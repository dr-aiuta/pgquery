import {Pool} from 'pg';
import PostgresConnection from '../../src/connection/postgres-connection';
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

	describe('logger', () => {
		const secret = 'secret@example.com';
		let mockPool: any;
		let defaultConnect: any;
		let client: {query: jest.Mock; release: jest.Mock};
		let failOn: Map<string, Error>;
		let consoleSpies: jest.SpyInstance[];

		// Initializes the connection with a fake client that answers every statement with two rows.
		const connect = (options?: Parameters<typeof PostgresConnection.initialize>[1]) => {
			PostgresConnection.initialize(testConfig, options);
			mockPool = (Pool as unknown as jest.Mock<any, any>).mock.results[0].value;
			defaultConnect = mockPool.connect.getMockImplementation();
			mockPool.connect.mockImplementation(async () => client);
		};

		beforeEach(() => {
			failOn = new Map();
			client = {
				query: jest.fn(async (text: any) => {
					const failure = failOn.get(typeof text === 'string' ? text : text.text);
					if (failure) {
						throw failure;
					}
					return {command: 'SELECT', rowCount: 2, rows: [{id: 1}, {id: 2}]};
				}),
				release: jest.fn(),
			};
			consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
				jest.spyOn(console, method).mockImplementation(() => undefined)
			);
		});

		afterEach(() => {
			mockPool.connect.mockImplementation(defaultConnect);
			jest.restoreAllMocks();
		});

		it('prints nothing without a logger', async () => {
			connect();
			failOn.set('SELECT broken', new Error('syntax error'));

			await PostgresConnection.query('SELECT * FROM users WHERE email = $1', [secret]);
			await expect(PostgresConnection.query('SELECT broken', [secret])).rejects.toThrow('syntax error');
			await PostgresConnection.transaction([{sqlText: 'INSERT 1', values: [secret]}]);
			await expect(PostgresConnection.transaction([{sqlText: 'SELECT broken', values: [secret]}])).rejects.toThrow(
				'syntax error'
			);
			await PostgresConnection.transaction('UPDATE 1', [secret]);

			for (const spy of consoleSpies) {
				expect(spy).not.toHaveBeenCalled();
			}
		});

		it('reports the SQL text, the duration and the row count of a query', async () => {
			const logger = jest.fn();
			connect({logger});

			await PostgresConnection.query('SELECT * FROM users WHERE email = $1', [secret]);

			expect(logger).toHaveBeenCalledTimes(1);
			const [entry] = logger.mock.calls[0];
			expect(entry).toEqual({
				sqlText: 'SELECT * FROM users WHERE email = $1',
				durationMs: expect.any(Number),
				rowCount: 2,
				slow: false,
				failed: false,
			});
			expect(Object.keys(entry).sort()).toEqual(['durationMs', 'failed', 'rowCount', 'slow', 'sqlText']);
			// Bound values never reach the logger.
			expect(JSON.stringify(logger.mock.calls)).not.toContain(secret);
			for (const spy of consoleSpies) {
				expect(spy).not.toHaveBeenCalled();
			}
		});

		it('reports every statement of a transaction, and never the bound values', async () => {
			const logger = jest.fn();
			connect({logger});

			await PostgresConnection.transaction([
				{sqlText: 'INSERT INTO users ("email") VALUES ($1)', values: [secret]},
				{sqlText: 'UPDATE users SET "email" = $1', values: [secret]},
			]);

			expect(logger.mock.calls.map(([entry]) => entry.sqlText)).toEqual([
				'BEGIN',
				'INSERT INTO users ("email") VALUES ($1)',
				'UPDATE users SET "email" = $1',
				'COMMIT',
			]);
			expect(JSON.stringify(logger.mock.calls)).not.toContain(secret);
		});

		it('reports a failed statement and still rethrows the original error', async () => {
			const logger = jest.fn();
			connect({logger});
			const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
				code: '23505',
				detail: `Key (email)=(${secret}) already exists.`,
			});
			failOn.set('INSERT 1', pgError);

			await expect(PostgresConnection.transaction([{sqlText: 'INSERT 1', values: [secret]}])).rejects.toBe(pgError);

			expect(logger.mock.calls.map(([entry]) => [entry.sqlText, entry.failed, entry.rowCount])).toEqual([
				['BEGIN', false, 2],
				['INSERT 1', true, null],
				['ROLLBACK', false, 2],
			]);
			// The error goes to the caller. Its detail can hold values, so the logger never sees it.
			expect(JSON.stringify(logger.mock.calls)).not.toContain(secret);
		});

		it('marks a statement as slow from slowQueryMs, which defaults to 2000', async () => {
			const clock = jest.spyOn(Date, 'now');

			const withDefault = jest.fn();
			connect({logger: withDefault});
			clock.mockReturnValueOnce(1000).mockReturnValueOnce(2999);
			await PostgresConnection.query('SELECT 1');
			clock.mockReturnValueOnce(1000).mockReturnValueOnce(3000);
			await PostgresConnection.query('SELECT 2');
			expect(withDefault.mock.calls.map(([entry]) => [entry.durationMs, entry.slow])).toEqual([
				[1999, false],
				[2000, true],
			]);

			await PostgresConnection.end();
			const withThreshold = jest.fn();
			connect({logger: withThreshold, slowQueryMs: 50});
			clock.mockReturnValueOnce(1000).mockReturnValueOnce(1049);
			await PostgresConnection.query('SELECT 3');
			clock.mockReturnValueOnce(1000).mockReturnValueOnce(1050);
			await PostgresConnection.query('SELECT 4');
			expect(withThreshold.mock.calls.map(([entry]) => [entry.durationMs, entry.slow])).toEqual([
				[49, false],
				[50, true],
			]);
		});

		it('reads the SQL text of a query config object and leaves its values out', async () => {
			const logger = jest.fn();
			connect({logger});

			await PostgresConnection.query({text: 'SELECT * FROM users WHERE email = $1', values: [secret]});

			expect(logger.mock.calls[0][0].sqlText).toBe('SELECT * FROM users WHERE email = $1');
			expect(JSON.stringify(logger.mock.calls)).not.toContain(secret);
		});

		it('keeps a query working when the logger throws', async () => {
			connect({
				logger: () => {
					throw new Error('logger is broken');
				},
			});

			const result = await PostgresConnection.query('SELECT 1');

			expect(result.rowCount).toBe(2);
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
