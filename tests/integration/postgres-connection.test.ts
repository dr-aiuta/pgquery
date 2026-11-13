import {Pool} from 'pg';
import PostgresConnection from '@/connection/postgres-connection';
import UsersTable from '../tables/entities/UsersTable';

jest.mock('pg', () => {
	const mClient = {
		query: jest.fn(),
		release: jest.fn(),
	};
	const mPool = {
		connect: jest.fn().mockResolvedValue(mClient),
		query: jest.fn(),
		end: jest.fn(),
	};
	const Pool = jest.fn(() => mPool);
	return {Pool};
});

describe('PostgresConnection', () => {
	const testConfig = {
		host: 'localhost',
		port: 5432,
		user: 'test_user',
		password: 'test_password',
		database: 'test_database',
	};

	afterEach(() => {
		jest.clearAllMocks();
		// Also reset the singleton instance
		(PostgresConnection as any).instance = undefined;
	});

	it('should initialize singleton instance with config', () => {
		const instance = PostgresConnection.initialize(testConfig);
		expect(instance).toBeDefined();
		expect(Pool).toHaveBeenCalledWith(testConfig);
	});

	it('should return existing instance when already initialized', () => {
		const instance1 = PostgresConnection.initialize(testConfig);
		const instance2 = PostgresConnection.initialize(testConfig);
		expect(instance1).toBe(instance2);
		expect(Pool).toHaveBeenCalledTimes(1);
	});

	it('should throw error when getting instance before initialization', () => {
		expect(() => {
			PostgresConnection.getInstance();
		}).toThrow('PostgresConnection must be initialized with configuration before use');
	});

	it('should execute query successfully', async () => {
		const instance = PostgresConnection.initialize(testConfig);
		const mockResult = {
			command: 'SELECT',
			rowCount: 1,
			rows: [{id: 1}],
		};
		const mockPool = (Pool as unknown as jest.Mock<any, any>).mock.results[0].value;
		const mockClient = await mockPool.connect();
		mockClient.query.mockResolvedValueOnce(mockResult);

		const result = await instance.query('SELECT * FROM users');
		expect(result).toEqual(mockResult);
		expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
	});
	describe('transaction', () => {
		// A fake pool hands out a new fake client on every connect() and records what each one received.
		type FakeClient = {query: jest.Mock; release: jest.Mock};
		let clients: FakeClient[];
		let mockPool: any;
		let defaultConnect: any;
		let failOn: Map<string, Error>;

		const uniqueViolation = () => Object.assign(new Error('duplicate key value violates unique constraint'), {code: '23505'});

		beforeEach(() => {
			jest.spyOn(console, 'log').mockImplementation(() => undefined);
			jest.spyOn(console, 'error').mockImplementation(() => undefined);
			PostgresConnection.initialize(testConfig);
			mockPool = (Pool as unknown as jest.Mock<any, any>).mock.results[0].value;
			defaultConnect = mockPool.connect.getMockImplementation();
			clients = [];
			failOn = new Map();
			mockPool.connect.mockImplementation(async () => {
				const client: FakeClient = {
					query: jest.fn(async (text: string) => {
						const failure = failOn.get(text);
						if (failure) {
							throw failure;
						}
						return {command: String(text).split(' ')[0], rowCount: 1, rows: [{text}]};
					}),
					release: jest.fn(),
				};
				clients.push(client);
				return client;
			});
		});

		afterEach(() => {
			mockPool.connect.mockImplementation(defaultConnect);
			jest.restoreAllMocks();
		});

		it('runs BEGIN, every statement and COMMIT on one client and releases it once', async () => {
			const results = await PostgresConnection.transaction([
				{sqlText: 'INSERT INTO users ("name") VALUES ($1)', values: ['Alice']},
				{sqlText: 'INSERT INTO posts ("title") VALUES ($1)', values: ['Hello']},
			]);

			expect(clients).toHaveLength(1);
			expect(clients[0].query.mock.calls).toEqual([
				['BEGIN'],
				['INSERT INTO users ("name") VALUES ($1)', ['Alice']],
				['INSERT INTO posts ("title") VALUES ($1)', ['Hello']],
				['COMMIT'],
			]);
			expect(clients[0].release).toHaveBeenCalledTimes(1);
			expect(clients[0].release).toHaveBeenCalledWith(undefined);
			expect(results.map((result) => result.rows[0].text)).toEqual([
				'INSERT INTO users ("name") VALUES ($1)',
				'INSERT INTO posts ("title") VALUES ($1)',
			]);
		});

		it('sends transaction().add().execute() through one client', async () => {
			const usersTable = new UsersTable();
			const first = usersTable.insertUser(['name'], {data: {name: 'Alice'}, returnField: 'id'});
			const second = usersTable.insertUser(['name'], {data: {name: 'Bob'}, returnField: 'id'});

			await usersTable.transaction().add(first.query).add(second.query).execute();

			expect(clients).toHaveLength(1);
			expect(clients[0].query.mock.calls.map(([text]) => text)).toEqual([
				'BEGIN',
				first.query.sqlText,
				second.query.sqlText,
				'COMMIT',
			]);
			expect(clients[0].release).toHaveBeenCalledTimes(1);
		});

		it('rolls back on the same client and rethrows the original error', async () => {
			const pgError = uniqueViolation();
			failOn.set('INSERT 2', pgError);

			const failed = PostgresConnection.transaction([
				{sqlText: 'INSERT 1', values: []},
				{sqlText: 'INSERT 2', values: []},
				{sqlText: 'INSERT 3', values: []},
			]);

			await expect(failed).rejects.toBe(pgError);
			expect(clients).toHaveLength(1);
			expect(clients[0].query.mock.calls.map(([text]) => text)).toEqual(['BEGIN', 'INSERT 1', 'INSERT 2', 'ROLLBACK']);
			expect(clients[0].release).toHaveBeenCalledTimes(1);
			expect(clients[0].release).toHaveBeenCalledWith(undefined);
		});

		it('releases the client with the rollback error when ROLLBACK itself fails', async () => {
			const pgError = uniqueViolation();
			const rollbackError = new Error('connection terminated');
			failOn.set('INSERT 1', pgError);
			failOn.set('ROLLBACK', rollbackError);

			await expect(PostgresConnection.transaction([{sqlText: 'INSERT 1', values: []}])).rejects.toBe(pgError);

			// pg destroys a client that is released with an error, so the broken connection leaves the pool.
			expect(clients[0].release).toHaveBeenCalledTimes(1);
			expect(clients[0].release).toHaveBeenCalledWith(rollbackError);
		});

		it('keeps the single-statement form transaction(text, params)', async () => {
			const result = await PostgresConnection.transaction('UPDATE users SET "name" = $1', ['Alice']);

			expect(clients).toHaveLength(1);
			expect(clients[0].query.mock.calls).toEqual([['BEGIN'], ['UPDATE users SET "name" = $1', ['Alice']], ['COMMIT']]);
			expect(clients[0].release).toHaveBeenCalledTimes(1);
			expect(result.rows).toEqual([{text: 'UPDATE users SET "name" = $1'}]);
		});

		it('rethrows the original pg error from the single-statement form, with its code', async () => {
			const pgError = uniqueViolation();
			failOn.set('INSERT 1', pgError);

			const failed = PostgresConnection.transaction('INSERT 1', []);

			await expect(failed).rejects.toBe(pgError);
			await expect(failed).rejects.toHaveProperty('code', '23505');
			expect(clients[0].query.mock.calls.map(([text]) => text)).toEqual(['BEGIN', 'INSERT 1', 'ROLLBACK']);
			expect(clients[0].release).toHaveBeenCalledTimes(1);
		});
	});

	describe('end', () => {
		it('closes the pool and clears the singleton', async () => {
			PostgresConnection.initialize(testConfig);
			const mockPool = (Pool as unknown as jest.Mock<any, any>).mock.results[0].value;

			await PostgresConnection.end();

			expect(mockPool.end).toHaveBeenCalledTimes(1);
			expect(() => PostgresConnection.getInstance()).toThrow(
				'PostgresConnection must be initialized with configuration before use'
			);

			// initialize works again after end()
			PostgresConnection.initialize(testConfig);
			expect(Pool).toHaveBeenCalledTimes(2);
		});

		it('does nothing when the connection was never initialized', async () => {
			await expect(PostgresConnection.end()).resolves.toBeUndefined();
		});
	});
});
