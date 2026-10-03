import {DatabaseError} from 'pg';
import PostgresConnection from '../../../src/connection/postgres-connection';
import UsersTable from '../../tables/entities/UsersTable';
import PostsTable from '../../tables/entities/PostsTable';
import {
	describeLive,
	createLiveSchema,
	dropLiveSchema,
	countIdleInTransaction,
	fixtureTablesDdl,
	livePoolConfig,
	silenceLibraryLogs,
	LiveSchema,
} from './live-setup';

describeLive('live: transactions and the connection', () => {
	silenceLibraryLogs();

	let schema: LiveSchema;
	const usersTable = new UsersTable();
	const postsTable = new PostsTable();

	const insertUser = (name: string, email: string) =>
		usersTable.insertUser(['name', 'email'], {data: {name, email}, returnField: 'id'});

	const emails = async (pattern: string): Promise<string[]> => {
		const result = await schema.admin.query('SELECT email FROM users WHERE email LIKE $1 ORDER BY email', [pattern]);
		return result.rows.map((row) => row.email);
	};

	beforeAll(async () => {
		schema = await createLiveSchema(fixtureTablesDdl);
	});

	afterAll(async () => {
		await dropLiveSchema(schema);
	});

	it('commits every statement of transaction().add().execute()', async () => {
		const alice = insertUser('Alice', 'alice@example.com');
		const bob = insertUser('Bob', 'bob@example.com');

		const results = await usersTable.transaction().add(alice.query).add(bob.query).execute();

		expect(results).toHaveLength(2);
		expect(results[0].rows[0].id).toEqual(expect.any(Number));
		expect(await emails('%@example.com')).toEqual(['alice@example.com', 'bob@example.com']);
	});

	it('leaves no row behind when a statement fails, while other transactions run', async () => {
		await insertUser('Taken', 'taken@unique.test').execute();

		// Each failing transaction inserts one new user and then violates the unique email.
		const runs: Promise<{ok: boolean; error?: any}>[] = [];
		for (let i = 0; i < 8; i++) {
			const succeeding = usersTable
				.transaction()
				.add(insertUser(`Ok ${i} a`, `ok-${i}-a@load.test`).query)
				.add(insertUser(`Ok ${i} b`, `ok-${i}-b@load.test`).query);
			const failing = usersTable
				.transaction()
				.add(insertUser(`Fail ${i}`, `fail-${i}@load.test`).query)
				.add(insertUser('Taken again', 'taken@unique.test').query);

			for (const transaction of [succeeding, failing]) {
				runs.push(
					transaction.execute().then(
						() => ({ok: true}),
						(error) => ({ok: false, error})
					)
				);
			}
		}
		const outcomes = await Promise.all(runs);

		const succeeded = outcomes.filter((outcome) => outcome.ok);
		const failed = outcomes.filter((outcome) => !outcome.ok);
		expect(succeeded).toHaveLength(8);
		expect(failed).toHaveLength(8);
		for (const outcome of failed) {
			expect(outcome.error).toBeInstanceOf(DatabaseError);
			expect(outcome.error.code).toBe('23505');
		}

		// The failed transactions left nothing. The others committed both rows.
		expect(await emails('fail-%@load.test')).toEqual([]);
		expect(await emails('ok-%@load.test')).toHaveLength(16);
		expect(await emails('taken@unique.test')).toEqual(['taken@unique.test']);
		expect(await countIdleInTransaction(schema)).toBe(0);
	});

	it('runs query objects from several tables with PostgresConnection.transaction(queries)', async () => {
		const [author] = await insertUser('Author', 'author@several.test').execute();
		const rename = usersTable.updateUser(['name'], {data: {name: 'Published Author'}, where: {id: author.id}});
		const post = postsTable.insertPost(['userId', 'title', 'content'], {
			data: {userId: author.id, title: 'First', content: 'Hello'},
			returnField: 'id',
		});

		const results = await PostgresConnection.transaction([rename.query, post.query]);

		expect(results).toHaveLength(2);
		expect(results[0].rowCount).toBe(1);
		expect(results[1].rows[0].id).toEqual(expect.any(Number));
		const stored = await schema.admin.query(
			'SELECT u.name, p.title FROM users u JOIN posts p ON p."userId" = u.id WHERE u.id = $1',
			[author.id]
		);
		expect(stored.rows).toEqual([{name: 'Published Author', title: 'First'}]);
	});

	it('rolls back PostgresConnection.transaction(queries) and rethrows the pg error with its code', async () => {
		const failed = PostgresConnection.transaction([
			insertUser('Rolled back', 'rolled-back@list.test').query,
			insertUser('Taken again', 'taken@unique.test').query,
		]);

		await expect(failed).rejects.toBeInstanceOf(DatabaseError);
		await expect(failed).rejects.toHaveProperty('code', '23505');
		expect(await emails('%@list.test')).toEqual([]);
		expect(await countIdleInTransaction(schema)).toBe(0);
	});

	it('keeps the single-statement form and rethrows the original pg error', async () => {
		const inserted = await PostgresConnection.transaction(
			'INSERT INTO users ("name", "email") VALUES ($1, $2) RETURNING "email"',
			['Single', 'single@statement.test']
		);
		expect(inserted.rows).toEqual([{email: 'single@statement.test'}]);

		const failed = PostgresConnection.transaction('INSERT INTO users ("name", "email") VALUES ($1, $2)', [
			'Taken again',
			'taken@unique.test',
		]);
		await expect(failed).rejects.toBeInstanceOf(DatabaseError);
		await expect(failed).rejects.toHaveProperty('code', '23505');
		expect(await countIdleInTransaction(schema)).toBe(0);
	});

	it('closes the pool with end() and opens a new one with initialize()', async () => {
		await PostgresConnection.end();
		expect(() => PostgresConnection.getInstance()).toThrow('PostgresConnection must be initialized');

		PostgresConnection.initialize(livePoolConfig(schema.name));
		const result = await PostgresConnection.query('SELECT count(*)::int AS count FROM users WHERE email = $1', [
			'taken@unique.test',
		]);
		expect(result.rows).toEqual([{count: 1}]);
	});
});
