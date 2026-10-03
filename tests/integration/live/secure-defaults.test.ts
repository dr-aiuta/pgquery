import {DatabaseError} from 'pg';
import {DatabaseOperations} from '../../../src/core/database-operations';
import {TableBase} from '../../../src/core/table-base';
import {QueryLogEntry} from '../../../src/connection/postgres-connection';
import {QueryInputError} from '../../../src/utils/query-input-error';
import {TableDefinition} from '../../../src/types/core-types';
import UsersTable from '../../tables/entities/UsersTable';
import PostsTable from '../../tables/entities/PostsTable';
import {UsersSchema, usersColumns} from '../../tables/definitions/users';
import {
	describeLive,
	createLiveSchema,
	dropLiveSchema,
	fixtureTablesDdl,
	ticketsTable,
	ticketsDdl,
	LiveSchema,
} from './live-setup';

const usersDefinition: TableDefinition<UsersSchema> = {tableName: 'users', schema: {columns: usersColumns}};

// A table class for routes that pass request input: an explicit list, unknown keys ignored, a limit ceiling.
class PublicUsersTable extends TableBase<UsersSchema> {
	constructor() {
		super({tableName: 'users', maxLimit: 100, schema: {columns: usersColumns}});
	}

	public listUsers(requestQuery: Record<string, unknown>) {
		return this.select({
			allowedColumns: ['id', 'name', 'email'],
			options: {where: requestQuery, ignoreUnknownKeys: true, columnsToReturn: ['id', 'name']},
		});
	}
}

describeLive('live: secure defaults (0.5.0)', () => {
	let schema: LiveSchema;
	const logEntries: QueryLogEntry[] = [];
	const usersTable = new UsersTable();
	const postsTable = new PostsTable();
	const usersDb = new DatabaseOperations(usersDefinition);
	const ticketsDb = new DatabaseOperations(ticketsTable);

	const ids = (rows: {id?: number}[]) => rows.map((row) => row.id);
	const stored = async (id: number) => {
		const result = await schema.admin.query('SELECT name, email, "lastChangedBy" FROM users WHERE id = $1', [id]);
		return result.rows[0];
	};

	beforeAll(async () => {
		schema = await createLiveSchema([...fixtureTablesDdl, ...ticketsDdl], {
			logger: (entry) => logEntries.push(entry),
		});
		// ids 1 to 4
		await schema.admin.query(
			`INSERT INTO users (name, email) VALUES
				('Ann', 'ann@example.com'), ('Bob', 'bob@example.com'), ('Ann', 'ann.two@sample.org'), ('Carol', NULL)`
		);
		// Ann has two posts, Bob has one, the others have none.
		await schema.admin.query(
			`INSERT INTO posts ("userId", title, content) VALUES (1, 'First', 'a'), (1, 'Second', 'b'), (2, 'Hello', 'c')`
		);
		await schema.admin.query(
			`INSERT INTO tickets (status, title) VALUES ('open', 'one'), ('closed', 'two'), ('archived', 'three'), ('open', 'four')`
		);
	});

	afterAll(async () => {
		await dropLiveSchema(schema);
	});

	describe('null writes NULL', () => {
		it('clears a column with null in an update, and leaves it alone with undefined', async () => {
			const [inserted] = await usersTable
				.insertUser(['name', 'email'], {data: {name: 'Dora', email: 'dora@example.com'}, returnField: 'id'})
				.execute();
			const id = inserted.id as number;

			await usersTable.updateUser(['name', 'email'], {data: {name: 'Dora B', email: undefined}, where: {id}}).execute();
			expect(await stored(id)).toEqual({name: 'Dora B', email: 'dora@example.com', lastChangedBy: 'SERVER'});

			await usersTable
				.updateUser(['name', 'email'], {data: {email: null as any}, where: {id}, idUser: 'editor'})
				.execute();
			expect(await stored(id)).toEqual({name: 'Dora B', email: null, lastChangedBy: 'editor'});
		});

		it('writes NULL with null in an insert, where undefined leaves the column default', async () => {
			const [withNull] = await usersTable
				.insertUser(['name', 'email'], {data: {name: 'Eve', email: null as any}, returnField: 'id'})
				.execute();
			expect(await stored(withNull.id as number)).toMatchObject({name: 'Eve', email: null});

			// createdAt has a default and is NOT NULL. undefined keeps the default.
			const [withDefault] = await usersTable
				.insertUser(['name', 'createdAt'], {data: {name: 'Fay', createdAt: undefined}, returnField: 'createdAt'})
				.execute();
			expect(withDefault.createdAt).toBeInstanceOf(Date);

			// null is written as NULL, so the default no longer applies and the constraint rejects it.
			const rejected = usersTable
				.insertUser(['name', 'createdAt'], {data: {name: 'Gus', createdAt: null as any}})
				.execute();
			await expect(rejected).rejects.toBeInstanceOf(DatabaseError);
			await expect(rejected).rejects.toHaveProperty('code', '23502');
		});
	});

	describe('upsert with a conflict target', () => {
		it('upserts on a unique column that is not the primary key', async () => {
			const upsert = (name: string) =>
				usersDb
					.insert({
						allowedColumns: ['name', 'email'],
						options: {data: {name, email: 'upsert@example.com'}, onConflict: {target: ['email']}, returnField: ['id', 'name']},
					})
					.execute();

			const [first] = await upsert('First name');
			const [second] = await upsert('Second name');

			expect(second).toEqual({id: first.id, name: 'Second name'});
			const count = await schema.admin.query(`SELECT count(*)::int AS count FROM users WHERE email = 'upsert@example.com'`);
			expect(count.rows).toEqual([{count: 1}]);
		});

		it('takes the primary key as a named target and rewrites only the other columns', async () => {
			const upsertStatus = () =>
				ticketsDb
					.insert({
						allowedColumns: ['id', 'status'],
						options: {data: {id: 1, status: 'closed'}, onConflict: {target: ['id']}, returnField: '*'},
					})
					.execute();

			// The row with id 1 exists and is open. Its title is not in the data, so it stays.
			expect(await upsertStatus()).toEqual([{id: 1, status: 'closed', title: 'one'}]);
			await schema.admin.query(`UPDATE tickets SET status = 'open' WHERE id = 1`);
		});

		it('fails in PostgreSQL when the target has no unique constraint', async () => {
			const upsert = usersDb
				.insert({
					allowedColumns: ['name', 'email'],
					options: {data: {name: 'Ann', email: 'no-constraint@example.com'}, onConflict: {target: ['name']}},
				})
				.execute();

			// 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
			await expect(upsert).rejects.toHaveProperty('code', '42P10');
		});
	});

	describe('in', () => {
		const selectIn = (value: unknown) =>
			usersTable.selectUsers(['id', 'name', 'email'], {where: {'id.in': value, 'id.orderBy': 'ASC'} as any}).execute();

		it('returns no rows for an empty list', async () => {
			expect(await selectIn([])).toEqual([]);
			expect(await selectIn('')).toEqual([]);
		});

		it('matches a list of integers', async () => {
			expect(ids(await selectIn([1, 3]))).toEqual([1, 3]);
			expect(ids(await selectIn('2,4'))).toEqual([2, 4]);
		});

		it('matches a list of strings', async () => {
			const rows = await usersTable
				.selectUsers(['id', 'name', 'email'], {
					where: {'email.in': ['bob@example.com', 'ann.two@sample.org', 'nobody@example.com'], 'id.orderBy': 'ASC'},
				})
				.execute();
			expect(ids(rows)).toEqual([2, 3]);
		});

		it('matches a list of enum values', async () => {
			const rows = await ticketsDb
				.select({allowedColumns: ['id', 'status'], options: {where: {'status.in': ['open', 'archived'], 'id.orderBy': 'ASC'}}})
				.execute();
			expect(rows.map((row) => [row.id, row.status])).toEqual([
				[1, 'open'],
				[3, 'archived'],
				[4, 'open'],
			]);

			const none = await ticketsDb.select({allowedColumns: ['id', 'status'], options: {where: {'status.in': []}}}).execute();
			expect(none).toEqual([]);
		});

		it('updates no row for an empty list', async () => {
			const updated = await usersDb
				.update({allowedColumns: ['name'], options: {data: {name: 'Nobody'}, where: {'id.in': []}, returnField: 'id'}})
				.execute();
			expect(updated).toEqual([]);
		});
	});

	describe('filters fail closed', () => {
		it('reads .null as a boolean', async () => {
			const select = (value: unknown) =>
				usersTable.selectUsers(['id', 'email'], {where: {'email.null': value, 'id.in': [1, 2, 3, 4]} as any}).execute();

			expect(ids(await select(true))).toEqual([4]);
			expect(ids(await select(false)).sort()).toEqual([1, 2, 3]);
		});

		it('throws for an unknown key and sends nothing', async () => {
			const before = logEntries.length;
			expect(() => usersTable.selectUsers(['id', 'name'], {where: {nmae: 'Ann'} as any})).toThrow(QueryInputError);
			expect(logEntries).toHaveLength(before);
		});

		it('passes request input through an explicit list, ignoring unknown parameters', async () => {
			const publicUsers = new PublicUsersTable();

			const rows = await publicUsers
				.listUsers({name: 'Ann', 'id.orderBy': 'DESC', limit: '10', utm_source: 'newsletter', lastChangedBy: 'x'})
				.execute();
			expect(rows).toEqual([
				{id: 3, name: 'Ann'},
				{id: 1, name: 'Ann'},
			]);

			expect(() => publicUsers.listUsers({limit: '101'})).toThrow(QueryInputError);
		});
	});

	describe('predefined SQL is wrapped as a subquery', () => {
		type PostWithAuthor = {id: number; title: string; authorName: string};
		type UserWithCount = {id: number; name: string; postCount: number};

		it('filters a join on a column of its result', async () => {
			const rows = await usersDb
				.selectWithCustomSchema<PostWithAuthor, Record<keyof PostWithAuthor, any>>({
					allowedColumns: ['id', 'title', 'authorName'],
					predefinedSQL: {
						sqlText: `SELECT p.id, p.title, u.name AS "authorName" FROM posts p JOIN users u ON u.id = p."userId"`,
					},
					options: {where: {authorName: 'Ann', 'title.orderBy': 'DESC', limit: 5} as any},
				})
				.execute();

			expect(rows).toEqual([
				{id: 2, title: 'Second', authorName: 'Ann'},
				{id: 1, title: 'First', authorName: 'Ann'},
			]);
		});

		it('filters a GROUP BY query on an aggregated column', async () => {
			const rows = await usersDb
				.selectWithCustomSchema<UserWithCount, Record<keyof UserWithCount, any>>({
					allowedColumns: ['id', 'name', 'postCount'],
					predefinedSQL: {
						sqlText: `SELECT u.id, u.name, count(p.id)::int AS "postCount"
							FROM users u LEFT JOIN posts p ON p."userId" = u.id
							GROUP BY u.id, u.name`,
					},
					options: {where: {'postCount.in': [1, 2], 'id.orderBy': 'ASC'} as any, columnsToReturn: ['name', 'postCount']},
				})
				.execute();

			expect(rows).toEqual([
				{name: 'Ann', postCount: 2},
				{name: 'Bob', postCount: 1},
			]);
		});

		it('filters a query that has its own WHERE, ORDER BY and placeholders', async () => {
			const query = usersDb.selectWithCustomSchema<{id: number; name: string}, Record<'id' | 'name' | 'email', any>>({
				allowedColumns: ['id', 'name'],
				predefinedSQL: {
					sqlText: 'SELECT id, name, email FROM users WHERE email LIKE $1 ORDER BY id;',
					values: ['%@example.com'],
				},
				options: {where: {name: 'Ann', 'id.in': [1, 2, 3, 4]} as any},
			});

			expect(query.query.sqlText).toBe(
				'SELECT * FROM (\nSELECT id, name, email FROM users WHERE email LIKE $1 ORDER BY id\n) AS q ' +
					'WHERE "name" = $2 AND "id" = ANY($3)'
			);
			expect(await query.execute()).toEqual([{id: 1, name: 'Ann', email: 'ann@example.com'}]);
		});

		it('filters the joined fixture query, which ends in its own WHERE', async () => {
			const rows = await usersTable
				.selectUserDetails(['id', 'name', 'posts'], {
					where: {'name.like': 'A%', 'posts.null': false, 'id.orderBy': 'ASC'} as any,
					whereClause: 'u.id < 100',
				})
				.execute();

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({id: 1, name: 'Ann'});
			expect(rows[0].posts).toHaveLength(2);
		});

		it('runs predefined SQL with no filter unchanged', async () => {
			const sqlText = 'SELECT id, name FROM users WHERE id < $1 ORDER BY id DESC';
			const query = usersDb.selectWithCustomSchema<{id: number; name: string}, Record<'id' | 'name', any>>({
				allowedColumns: ['id', 'name'],
				predefinedSQL: {sqlText, values: [3]},
			});

			expect(query.query.sqlText).toBe(sqlText);
			expect(ids(await query.execute())).toEqual([2, 1]);
		});

		it('wraps predefined SQL in select, where columnsToReturn narrows the result', async () => {
			const rows = await postsTable
				.selectPosts(['id', 'title'], {where: {'id.in': [1, 3], 'id.orderBy': 'ASC'}})
				.execute();
			expect(rows).toEqual([
				{id: 1, title: 'First'},
				{id: 3, title: 'Hello'},
			]);

			const narrowed = await usersDb
				.select({
					allowedColumns: ['id', 'name'],
					predefinedSQL: {sqlText: 'SELECT * FROM users WHERE email IS NOT NULL'},
					options: {where: {name: 'Ann', 'id.orderBy': 'ASC'}, columnsToReturn: ['id']},
				})
				.execute();
			expect(narrowed).toEqual([{id: 1}, {id: 3}]);
		});
	});

	describe('logger', () => {
		it('receives the SQL text, the duration and the row count, and never a bound value', async () => {
			logEntries.length = 0;
			const secret = 'logger-secret@example.com';

			await usersTable.insertUser(['name', 'email'], {data: {name: 'Logged', email: secret}, returnField: 'id'}).execute();
			await usersTable.selectUsers(['id', 'email'], {where: {email: secret}}).execute();
			const failed = usersTable.insertUser(['name', 'email'], {data: {name: 'Logged again', email: secret}}).execute();
			await expect(failed).rejects.toHaveProperty('code', '23505');

			expect(logEntries.map((entry) => [entry.sqlText.split('\n')[0], entry.rowCount, entry.failed])).toEqual([
				['INSERT INTO users ("name", "email", "lastChangedBy")', 1, false],
				['SELECT "id", "email" FROM users WHERE "email" = $1', 1, false],
				['INSERT INTO users ("name", "email", "lastChangedBy")', null, true],
			]);
			for (const entry of logEntries) {
				expect(entry.durationMs).toEqual(expect.any(Number));
				expect(entry.slow).toBe(false);
			}
			expect(JSON.stringify(logEntries)).not.toContain(secret);
		});
	});
});
