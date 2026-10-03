import {setupTests, dbpg, usersTable, postsTable} from '../pg-lightquery/test-setup';
import {ChainedInsertBuilder, createChainedInsert} from '../../../src/chained-insert';
import {DatabaseOperations} from '../../../src/database-operations';
import {TableBase} from '../../../src/table-base';
import {EnhancedTableBase} from '../../../src/table-base';
import {QueryInputError} from '../../../src/sql/identifiers';
import {sqlExpression} from '../../../src/sql/expression';
import {TableDefinition} from '../../../src/types';
import {UsersSchema, usersColumns} from '../../tables/definitions/users';
import {PostsSchema, postsColumns} from '../../tables/definitions/posts';
import {AddressesSchema, addressesColumns} from '../../tables/definitions/addresses';

const usersDefinition: TableDefinition<UsersSchema> = {tableName: 'users', schema: {columns: usersColumns}};
const postsDefinition: TableDefinition<PostsSchema> = {tableName: 'posts', schema: {columns: postsColumns}};
const addressesDefinition: TableDefinition<AddressesSchema> = {
	tableName: 'addresses',
	schema: {columns: addressesColumns},
};

// A table class that registers its related tables and builds chains. It extends TableBase, not EnhancedTableBase.
class UsersWithRelations extends TableBase<UsersSchema> {
	constructor() {
		super(usersDefinition);
		this.registerRelatedTable('posts', {tableDefinition: postsDefinition});
		this.registerRelatedTable('addresses', {tableDefinition: addressesDefinition});
	}

	public createUserWithPost(user: {name: string; email: string}, post: {title: string; content: string}) {
		return this.createChainedInsert()
			.insert('new_user', this, user, {allowedColumns: ['name', 'email'], returnField: '*'})
			.insertIntoTableWithReference(
				'new_post',
				'posts',
				post,
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['title', 'content'], returnField: 'id'}
			)
			.selectFrom('new_user')
			.build();
	}

	public postsOperations() {
		return this.getRelatedTable<PostsSchema>('posts');
	}

	public chain() {
		return this.createChainedInsert();
	}
}

describe('ChainedInsertBuilder - rebuilt without regex (0.5.1)', () => {
	setupTests();

	const usersDb = new DatabaseOperations(usersDefinition);
	const postsDb = new DatabaseOperations(postsDefinition);
	const reference = {from: 'new_user', field: 'id', to: 'userId'} as const;
	const all = {allowedColumns: '*'} as const;

	describe('names are plain identifiers', () => {
		const badNames = ['new user', 'new_user; DROP TABLE users; --', 'x) AS (SELECT 1', '1st', ''];

		it('rejects a step name that is not a plain identifier', () => {
			for (const name of badNames) {
				expect(() => createChainedInsert().insert(name, usersDb, {name: 'Ann'}, all)).toThrow(QueryInputError);
				expect(() => createChainedInsert().update(name, usersDb, {name: 'Ann'}, {id: 1}, all)).toThrow(
					/Invalid step name/
				);
				expect(() => createChainedInsert().selectFrom(name)).toThrow(/Invalid step name/);
			}
		});

		it('rejects a reference whose step name or field is not a plain identifier', () => {
			const withReference = (ref: {from: string; field: string; to: any}) =>
				createChainedInsert().insertWithReference('new_post', postsDb, {title: 'T', content: 'C'}, ref, all);

			expect(() => withReference({from: 'new user', field: 'id', to: 'userId'})).toThrow(/Invalid step name: new user/);
			expect(() => withReference({from: 'new_user', field: 'id" FROM users; --', to: 'userId'})).toThrow(
				/Invalid reference field/
			);
			expect(() => withReference({from: 'new_user) x; --', field: 'id', to: 'userId'})).toThrow(QueryInputError);
		});

		it('rejects a reference target that is not a column of the table', () => {
			expect(() =>
				createChainedInsert().insertWithReference(
					'new_post',
					postsDb,
					{title: 'T', content: 'C'},
					{from: 'new_user', field: 'id', to: 'authorId' as any},
					all
				)
			).toThrow('Invalid reference: authorId is not a column of posts.');
		});

		it("takes '*', one column or a list of columns in selectFrom, and no expression", () => {
			const select = (columns?: string | string[]) => {
				const sql = createChainedInsert()
					.insert('new_user', usersDb, {name: 'Ann'}, all)
					.selectFrom('new_user', columns)
					.build().queries[0].sqlText;
				return sql.split('\n').pop();
			};

			expect(select()).toBe('SELECT * FROM new_user;');
			expect(select('*')).toBe('SELECT * FROM new_user;');
			expect(select('id')).toBe('SELECT "id" FROM new_user;');
			expect(select(['id', 'createdAt'])).toBe('SELECT "id", "createdAt" FROM new_user;');

			expect(() => select('id, name')).toThrow(/Invalid selectFrom column/);
			expect(() => select('(SELECT password FROM users LIMIT 1)')).toThrow(QueryInputError);
			expect(() => select(['id', 'count(*)'])).toThrow(/Invalid selectFrom column: count\(\*\)/);
			expect(() => select('"id"')).toThrow(QueryInputError);
			expect(() => select([])).toThrow(/Invalid selectFrom columns/);
		});
	});

	describe('references are ordinary data', () => {
		it('keeps ON CONFLICT on a referenced insert', () => {
			const sql = createChainedInsert()
				.insert('new_user', usersDb, {name: 'Ann'}, all)
				.insertWithReference('new_post', postsDb, {id: 5, title: 'T', content: 'C'}, reference, {
					allowedColumns: '*',
					onConflict: true,
					returnField: 'id',
				})
				.selectFrom('new_post')
				.build().queries[0].sqlText;

			expect(sql).toContain(
				'INSERT INTO posts ("id", "title", "content", "userId") VALUES ($3, $4, $5, (SELECT "id" FROM new_user)) ' +
					'ON CONFLICT ("id") DO UPDATE SET "title" = EXCLUDED."title", "content" = EXCLUDED."content", "userId" = EXCLUDED."userId" ' +
					'RETURNING "id"'
			);
		});

		it('writes the reference even when the allow-list leaves the column out, and ignores a value in the data', () => {
			const {sqlText, values} = createChainedInsert()
				.insert('new_user', usersDb, {name: 'Ann'}, {allowedColumns: ['name']})
				.insertWithReference('new_post', postsDb, {title: 'T', content: 'C', userId: 999}, reference, {
					allowedColumns: ['title', 'content'],
				})
				.build().queries[0];

			expect(sqlText).toContain(
				'INSERT INTO posts ("title", "content", "userId") VALUES ($3, $4, (SELECT "id" FROM new_user)) RETURNING *'
			);
			expect(values).toEqual(['Ann', 'SERVER', 'T', 'C']);
		});

		it('builds a referenced insert and a referenced update whose data is empty', () => {
			const sql = createChainedInsert()
				.insert('new_user', usersDb, {name: 'Ann'}, all)
				.insertWithReference('new_post', postsDb, {}, reference, {allowedColumns: []})
				.updateWithReference('moved_post', postsDb, {}, {id: 7}, reference, {allowedColumns: []})
				.build().queries[0].sqlText;

			expect(sql).toContain('INSERT INTO posts ("userId") VALUES ((SELECT "id" FROM new_user)) RETURNING *');
			expect(sql).toContain('UPDATE posts SET "userId" = (SELECT "id" FROM new_user) WHERE "id" = $3\nRETURNING *');
		});

		it('writes the steps in the order they were called', () => {
			const {sqlText, values} = createChainedInsert()
				.update('renamed', usersDb, {name: 'Bea'}, {id: 1}, {allowedColumns: ['name'], returnField: 'id'})
				.insertWithReference(
					'new_post',
					postsDb,
					{title: 'T', content: 'C'},
					{from: 'renamed', field: 'id', to: 'userId'},
					{allowedColumns: ['title', 'content'], returnField: 'id'}
				)
				.update('touched', postsDb, {content: 'D'}, {id: 2}, {allowedColumns: ['content'], returnField: 'id'})
				.selectFrom('new_post')
				.build().queries[0];

			expect(sqlText).toBe(
				[
					'WITH renamed AS (',
					'  UPDATE users',
					'SET "name" = $1, "lastChangedBy" = $2',
					'WHERE "id" = $3',
					'RETURNING "id"',
					'),',
					'new_post AS (',
					'  INSERT INTO posts ("title", "content", "userId") VALUES ($4, $5, (SELECT "id" FROM renamed)) RETURNING "id"',
					'),',
					'touched AS (',
					'  UPDATE posts',
					'SET "content" = $6',
					'WHERE "id" = $7',
					'RETURNING "id"',
					')',
					'SELECT * FROM new_post;',
				].join('\n')
			);
			expect(values).toEqual(['Bea', 'SERVER', 1, 'T', 'C', 'D', 2]);
		});

		it('selects from the first insert by default, or from the first step when there is no insert', () => {
			const lastLine = (builder: ChainedInsertBuilder) => builder.build().queries[0].sqlText.split('\n').pop();

			expect(
				lastLine(
					createChainedInsert()
						.update('renamed', usersDb, {name: 'Bea'}, {id: 1}, all)
						.insert('new_user', usersDb, {name: 'Ann'}, all)
				)
			).toBe('SELECT * FROM new_user;');
			expect(
				lastLine(
					createChainedInsert()
						.update('renamed', usersDb, {name: 'Bea'}, {id: 1}, all)
						.update('touched', postsDb, {content: 'D'}, {id: 2}, all)
				)
			).toBe('SELECT * FROM renamed;');
		});
	});

	describe('sqlExpression as a value', () => {
		it('writes an expression into an insert and an update, and does not bind it', () => {
			const insert = usersDb.insert({
				allowedColumns: ['name', 'createdAt'],
				options: {data: {name: 'Ann', createdAt: sqlExpression('now()')}, returnField: 'id'},
			}).query;
			expect(insert.sqlText).toBe(
				'INSERT INTO users ("name", "lastChangedBy", "createdAt")\nVALUES ($1, $2, now())\nRETURNING "id";'
			);
			expect(insert.values).toEqual(['Ann', 'SERVER']);

			const update = usersDb.update({
				allowedColumns: ['name', 'updatedAt'],
				options: {data: {updatedAt: sqlExpression('now()'), name: 'Bea'}, where: {id: 1}},
			}).query;
			expect(update.sqlText).toBe(
				'UPDATE users\nSET "name" = $1, "lastChangedBy" = $2, "updatedAt" = now()\nWHERE "id" = $3;'
			);
			expect(update.values).toEqual(['Bea', 'SERVER', 1]);
		});

		it('applies the allow-list to an expression like to any other value', () => {
			const update = usersDb.update({
				allowedColumns: ['name'],
				options: {data: {name: 'Bea', updatedAt: sqlExpression('now()')}, where: {id: 1}},
			}).query;

			expect(update.sqlText).not.toContain('updatedAt');
		});

		it('binds a look-alike object from request data as a value', () => {
			// JSON cannot carry the symbol that marks an expression.
			const forged = JSON.parse('{"sql": "now(); DROP TABLE users"}');
			const update = usersDb.update({
				allowedColumns: ['name'],
				options: {data: {name: forged}, where: {id: 1}},
			}).query;

			expect(update.sqlText).toBe('UPDATE users\nSET "name" = $1, "lastChangedBy" = $2\nWHERE "id" = $3;');
			expect(update.values).toEqual([forged, 'SERVER', 1]);
		});

		it('rewrites an expression column on conflict like any other column', () => {
			const upsert = usersDb.insert({
				allowedColumns: ['id', 'name', 'updatedAt'],
				options: {data: {id: 1, updatedAt: sqlExpression('now()'), name: 'Ann'}, onConflict: true},
			}).query;

			expect(upsert.sqlText).toBe(
				'INSERT INTO users ("id", "name", "lastChangedBy", "updatedAt")\n' +
					'VALUES ($1, $2, $3, now()) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = EXCLUDED."updatedAt"\n;'
			);
		});
	});

	describe('a step takes a table class', () => {
		it('builds the same SQL for a table class instance and for its operations object', () => {
			const build = (users: any, posts: any) =>
				createChainedInsert()
					.insert('new_user', users, {name: 'Ann', email: 'ann@example.com'}, {allowedColumns: ['name', 'email']})
					.insertWithReference('new_post', posts, {title: 'T', content: 'C'}, reference, {
						allowedColumns: ['title', 'content'],
					})
					.selectFrom('new_user')
					.build().queries[0];

			const withClasses = build(usersTable, postsTable);
			expect(withClasses).toEqual(build(usersDb, postsDb));
			expect(withClasses.sqlText).toContain('INSERT INTO users ("name", "email", "lastChangedBy")');
		});

		it('rejects anything that is neither', () => {
			for (const table of [null, undefined, 'users', {}, {db: usersDb}, usersDefinition]) {
				expect(() => createChainedInsert().insert('new_user', table as any, {name: 'Ann'}, all)).toThrow(
					/Invalid table for a chain step/
				);
			}
		});

		it('resolves to an array of pg results, one per query', async () => {
			const row = {id: 1, name: 'Ann', email: 'ann@example.com'};
			(dbpg.query as jest.Mock).mockResolvedValue({rows: [row], rowCount: 1});

			const chain = createChainedInsert()
				.insert('new_user', usersTable, {name: 'Ann', email: 'ann@example.com'}, {allowedColumns: ['name', 'email']})
				.selectFrom('new_user')
				.build();
			const results = await chain.execute();

			expect(chain.queries).toHaveLength(1);
			expect(results).toHaveLength(1);
			expect(results[0].rows[0]).toEqual(row);
		});
	});

	describe('one builder, one base class', () => {
		it('returns the builder itself from every method', () => {
			const builder = new UsersWithRelations().chain();

			expect(builder.insert('a', usersDb, {name: 'Ann'}, all)).toBe(builder);
			expect(
				builder.insertWithReference('b', postsDb, {title: 'T', content: 'C'}, {...reference, from: 'a'}, all)
			).toBe(builder);
			expect(builder.insertWithReferenceIf(false, 'c', postsDb, {}, {...reference, from: 'a'}, all)).toBe(builder);
			expect(builder.update('d', usersDb, {name: 'Bea'}, {id: 1}, all)).toBe(builder);
			expect(builder.updateWithReference('e', postsDb, {}, {id: 1}, {...reference, from: 'a'}, all)).toBe(builder);
			expect(builder.updateIf(false, 'f', usersDb, {name: 'Bea'}, {id: 1}, all)).toBe(builder);
			expect(builder.updateWithReferenceIf(false, 'g', postsDb, {}, {id: 1}, {...reference, from: 'a'}, all)).toBe(
				builder
			);
			expect(builder.insertIntoTable('h', 'posts', {title: 'T', content: 'C', userId: 1}, all)).toBe(builder);
			expect(
				builder.insertIntoTableWithReference('i', 'posts', {title: 'T', content: 'C'}, {...reference, from: 'a'}, all)
			).toBe(builder);
			expect(builder.insertIntoTableWithReferenceIf(false, 'j', 'posts', {}, {...reference, from: 'a'}, all)).toBe(
				builder
			);
			expect(builder.updateTable('k', 'posts', {content: 'D'}, {id: 1}, all)).toBe(builder);
			expect(builder.updateTableWithReference('l', 'posts', {}, {id: 1}, {...reference, from: 'a'}, all)).toBe(builder);
			expect(builder.updateTableIf(false, 'm', 'posts', {content: 'D'}, {id: 1}, all)).toBe(builder);
			expect(builder.selectFrom('a')).toBe(builder);
			expect(builder).toBeInstanceOf(ChainedInsertBuilder);
		});

		it('throws a clear error for a name-based step on a builder without registered tables', () => {
			const step = () => createChainedInsert().insertIntoTable('new_post', 'posts', {title: 'T'}, all);

			expect(step).toThrow(QueryInputError);
			expect(step).toThrow("Cannot look up the table 'posts': this chain has no registered tables.");
			expect(() => createChainedInsert().updateTable('touched', 'posts', {title: 'T'}, {id: 1}, all)).toThrow(
				/has no registered tables/
			);
		});

		it('gives TableBase the related tables and the chain factory', () => {
			const users = new UsersWithRelations();
			const chain = users.createUserWithPost({name: 'Ann', email: 'ann@example.com'}, {title: 'T', content: 'C'});

			expect(users.postsOperations().tableName).toBe('posts');
			expect(chain.queries[0].sqlText).toBe(
				[
					'WITH new_user AS (',
					'  INSERT INTO users ("name", "email", "lastChangedBy")',
					'VALUES ($1, $2, $3)',
					'RETURNING *',
					'),',
					'new_post AS (',
					'  INSERT INTO posts ("title", "content", "userId") VALUES ($4, $5, (SELECT "id" FROM new_user)) RETURNING "id"',
					')',
					'SELECT * FROM new_user;',
				].join('\n')
			);
			expect(() => users.chain().insertIntoTable('x', 'nope', {}, all)).toThrow(
				"Related table 'nope' is not registered"
			);
		});

		it('keeps EnhancedTableBase as the same class under its old name', () => {
			class LegacyUsers extends EnhancedTableBase<UsersSchema> {
				constructor() {
					super(usersDefinition);
					this.registerRelatedTable('posts', {tableDefinition: postsDefinition});
				}
				public chain() {
					return this.createChainedInsert();
				}
			}

			expect(EnhancedTableBase).toBe(TableBase);
			const legacy = new LegacyUsers();
			expect(legacy).toBeInstanceOf(TableBase);
			expect(
				legacy.chain().insertIntoTable('new_post', 'posts', {title: 'T', content: 'C', userId: 1}, all)
			).toBeInstanceOf(ChainedInsertBuilder);
		});
	});

	describe('predefined SQL values match its placeholders', () => {
		const custom = (sqlText: string, values?: unknown[]) =>
			usersDb.selectWithCustomSchema({
				allowedColumns: ['id'],
				predefinedSQL: {sqlText, values},
				options: {where: {id: 1}},
			});

		it('throws when the values do not match the highest placeholder', () => {
			expect(() => custom('SELECT id FROM users', ['unused'])).toThrow(QueryInputError);
			expect(() => custom('SELECT id FROM users', ['unused'])).toThrow(
				'predefinedSQL has 1 values, but its highest placeholder is $0.'
			);
			expect(() => custom('SELECT id FROM users WHERE name = $1 AND email = $2', ['Ann'])).toThrow(
				'predefinedSQL has 1 values, but its highest placeholder is $2.'
			);
			expect(() => custom('SELECT id FROM users WHERE name = $1', [])).toThrow(/has 0 values/);
		});

		it('checks select with predefined SQL too, with or without a filter', () => {
			const select = (where: Record<string, unknown>) =>
				usersDb.select({
					allowedColumns: ['id'],
					predefinedSQL: {sqlText: 'SELECT * FROM users', values: ['unused']},
					options: {where},
				});

			expect(() => select({id: 1})).toThrow(/highest placeholder is \$0/);
			expect(() => select({})).toThrow(QueryInputError);
		});

		it('accepts matching values and does not count a placeholder inside quotes', () => {
			expect(custom('SELECT id FROM users WHERE name = $1', ['Ann']).query.values).toEqual(['Ann', 1]);
			expect(custom(`SELECT id, 'costs $5' AS note FROM users WHERE name = $1`, ['Ann']).query.sqlText).toBe(
				`SELECT * FROM (\nSELECT id, 'costs $5' AS note FROM users WHERE name = $1\n) AS q WHERE "id" = $2`
			);
			// The same placeholder used twice needs one value.
			expect(custom('SELECT id FROM users WHERE name = $1 OR email = $1', ['Ann']).query.values).toEqual(['Ann', 1]);
		});

		it('does not check predefined SQL that passes no values', () => {
			expect(custom('SELECT id FROM users').query.sqlText).toBe(
				'SELECT * FROM (\nSELECT id FROM users\n) AS q WHERE "id" = $1'
			);
		});
	});
});
