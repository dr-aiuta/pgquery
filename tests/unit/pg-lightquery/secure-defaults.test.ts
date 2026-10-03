import {setupTests, dbpg, usersTable} from './test-setup';
import {DatabaseOperations} from '../../../src/database-operations';
import {TableBase} from '../../../src/table-base';
import {EnhancedTableBase} from '../../../src/table-base';
import {createChainedInsert} from '../../../src/chained-insert';
import {QueryInputError} from '../../../src/sql/identifiers';
import {TableDefinition} from '../../../src/types';
import {UsersSchema, usersColumns} from '../../tables/definitions/users';
import {PostsSchema, postsColumns} from '../../tables/definitions/posts';

const usersDefinition: TableDefinition<UsersSchema> = {tableName: 'users', schema: {columns: usersColumns}};
const postsDefinition: TableDefinition<PostsSchema> = {tableName: 'posts', schema: {columns: postsColumns}};

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

// What an application does with QueryInputError: one place maps it to HTTP 400.
function statusFor(run: () => unknown): number {
	try {
		run();
		return 200;
	} catch (error) {
		if (error instanceof QueryInputError) {
			return 400;
		}
		throw error;
	}
}

describe('Secure defaults (0.5.0)', () => {
	setupTests();

	const usersDb = new DatabaseOperations(usersDefinition);
	const postsDb = new DatabaseOperations(postsDefinition);
	const selectSql = (where: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
		usersDb.select({allowedColumns: ['id', 'name', 'email'], options: {where: where as any, ...extra}}).query;

	describe('allowedColumns is required', () => {
		const missing = /allowedColumns is required for/;

		it('throws for select, selectWithCustomSchema, insert and update without it', () => {
			expect(() => usersDb.select({} as any)).toThrow(/allowedColumns is required for select/);
			expect(() => usersDb.select({options: {where: {id: 1}}} as any)).toThrow(QueryInputError);
			expect(() => usersDb.selectWithCustomSchema({predefinedSQL: {sqlText: 'SELECT 1'}} as any)).toThrow(
				/allowedColumns is required for selectWithCustomSchema/
			);
			expect(() => usersDb.insert({options: {data: {name: 'Ann'}}} as any)).toThrow(
				/allowedColumns is required for insert/
			);
			expect(() => usersDb.update({options: {data: {name: 'Ann'}, where: {id: 1}}} as any)).toThrow(
				/allowedColumns is required for update/
			);
		});

		it("accepts '*' when it is written out", () => {
			expect(usersDb.select({allowedColumns: '*'}).query.sqlText).toBe('SELECT * FROM users ');
			expect(usersDb.insert({allowedColumns: '*', options: {data: {name: 'Ann'}}}).query.sqlText).toContain(
				'INSERT INTO users ("name", "lastChangedBy")'
			);
		});

		it('throws for every step of a chain without it', () => {
			const chain = () => createChainedInsert() as any;
			const reference = {from: 'new_user', field: 'id', to: 'userId'};

			expect(() => chain().insert('new_user', usersDb, {name: 'Ann'})).toThrow(missing);
			expect(() => chain().insert('new_user', usersDb, {name: 'Ann'}, {returnField: '*'})).toThrow(missing);
			expect(() => chain().insertWithReference('post', postsDb, {title: 'T'}, reference)).toThrow(missing);
			expect(() => chain().insertWithReferenceIf(true, 'post', postsDb, {title: 'T'}, reference)).toThrow(missing);
			expect(() => chain().update('user', usersDb, {name: 'Ann'}, {id: 1})).toThrow(missing);
			expect(() => chain().updateWithReference('post', postsDb, {title: 'T'}, {id: 1}, reference)).toThrow(missing);
			expect(() => chain().updateIf(true, 'user', usersDb, {name: 'Ann'}, {id: 1})).toThrow(missing);
			expect(() => chain().updateWithReferenceIf(true, 'post', postsDb, {title: 'T'}, {id: 1}, reference)).toThrow(
				missing
			);
		});

		it('throws for the name-based steps of a chain without it', () => {
			class RelatedUsers extends EnhancedTableBase<UsersSchema> {
				constructor() {
					super(usersDefinition);
					this.registerRelatedTable('posts', {tableDefinition: postsDefinition});
				}
				public chain() {
					return this.createChainedInsert() as any;
				}
			}
			const related = new RelatedUsers();
			const reference = {from: 'new_user', field: 'id', to: 'userId'};

			expect(() => related.chain().insertIntoTable('post', 'posts', {title: 'T'})).toThrow(missing);
			expect(() => related.chain().insertIntoTableWithReference('post', 'posts', {title: 'T'}, reference)).toThrow(
				missing
			);
			expect(() => related.chain().updateTable('post', 'posts', {title: 'T'}, {id: 1})).toThrow(missing);
			expect(() => related.chain().updateTableWithReference('post', 'posts', {title: 'T'}, {id: 1}, reference)).toThrow(
				missing
			);
		});

		it('writes only the listed columns in a chained step', () => {
			const chain = createChainedInsert()
				.insert(
					'new_user',
					usersDb,
					{name: 'Ann', email: 'ann@example.com', lastChangedBy: 'forged'},
					{allowedColumns: ['name'], returnField: 'id'}
				)
				.insertWithReference(
					'new_post',
					postsDb,
					{title: 'Hello', content: 'World', userId: 999},
					{from: 'new_user', field: 'id', to: 'userId'},
					{allowedColumns: ['title'], returnField: 'id'}
				)
				.update('renamed', usersDb, {name: 'Bea', email: 'bea@example.com'}, {id: 7}, {allowedColumns: ['name']})
				.selectFrom('new_user')
				.build();

			const {sqlText, values} = chain.queries[0];
			expect(sqlText).toContain('INSERT INTO users ("name", "lastChangedBy")');
			expect(sqlText).toContain('INSERT INTO posts ("title", "userId") VALUES ($3, (SELECT "id" FROM new_user))');
			expect(sqlText).toContain('SET "name" = $4, "lastChangedBy" = $5');
			expect(sqlText).not.toContain('"email"');
			expect(sqlText).not.toContain('"content"');
			// email, content, the forged audit value and the forged userId are all dropped.
			expect(values).toEqual(['Ann', 'SERVER', 'Hello', 'Bea', 'SERVER', 7]);
		});
	});

	describe('filters fail closed', () => {
		it('throws for a key that is not on the allow-list', () => {
			expect(() => selectSql({nmae: 'Ann'})).toThrow(QueryInputError);
			expect(() => selectSql({nmae: 'Ann'})).toThrow('Unknown column in query parameters: nmae');
			// A column of the table that the allow-list leaves out is unknown too.
			expect(() => selectSql({lastChangedBy: 'SERVER'})).toThrow('Unknown column in query parameters: lastChangedBy');
		});

		it('drops the same key with ignoreUnknownKeys, and keeps the known ones', () => {
			const query = selectSql(
				{nmae: 'Ann', lastChangedBy: 'SERVER', 'nmae.like': 'A%', id: 1},
				{ignoreUnknownKeys: true}
			);

			expect(query.sqlText).toBe('SELECT "id", "name", "email" FROM users WHERE "id" = $1');
			expect(query.values).toEqual([1]);
		});

		it('throws for an unknown operator, with and without ignoreUnknownKeys', () => {
			for (const key of ['age.gte', 'name.gte', 'name.like.extra', 'name.', 'name.LIKE', 'limit.max']) {
				expect(() => selectSql({[key]: 1})).toThrow(/Unknown operator in query parameters/);
				expect(() => selectSql({[key]: 1}, {ignoreUnknownKeys: true})).toThrow(QueryInputError);
			}
			// limit and offset are paging keys. A supported operator on them is rejected too.
			expect(() => selectSql({'limit.orderBy': 'ASC'})).toThrow(/limit takes no operator/);
			expect(() => selectSql({'offset.in': [1]})).toThrow(/offset takes no operator/);
		});

		it('still validates the known keys with ignoreUnknownKeys', () => {
			expect(() => selectSql({limit: 'ten'}, {ignoreUnknownKeys: true})).toThrow(/Invalid limit value/);
			expect(() => selectSql({'name.orderBy': 'UP'}, {ignoreUnknownKeys: true})).toThrow(/Invalid orderBy direction/);
		});

		it('reads .null as true for IS NULL and false for IS NOT NULL', () => {
			const isNull = 'SELECT "id", "name", "email" FROM users WHERE "email" IS NULL';
			const isNotNull = 'SELECT "id", "name", "email" FROM users WHERE "email" IS NOT NULL';

			expect(selectSql({'email.null': true}).sqlText).toBe(isNull);
			expect(selectSql({'email.null': 'true'}).sqlText).toBe(isNull);
			expect(selectSql({'email.null': false}).sqlText).toBe(isNotNull);
			expect(selectSql({'email.null': 'false'}).sqlText).toBe(isNotNull);
			expect(selectSql({'email.null': true}).values).toEqual([]);
		});

		it('throws for any other .null value', () => {
			for (const value of ['yes', 'TRUE', 1, 0, null, undefined, '']) {
				expect(() => selectSql({'email.null': value})).toThrow(/Invalid value for email.null/);
			}
		});

		it('throws for an unknown where key in an update', () => {
			const update = (where: Record<string, unknown>) =>
				usersDb.update({allowedColumns: ['name'], options: {data: {name: 'Ann'}, where: where as any}});

			expect(() => update({nmae: 'Ann'})).toThrow('Unknown column in query parameters: nmae');
			expect(() => update({'id.gte': 1})).toThrow(/Unknown operator/);
			expect(() => update({id: 1, limit: 1})).toThrow('Unknown column in query parameters: limit');
		});
	});

	describe('null writes NULL', () => {
		it('writes NULL for a null value in an update and skips undefined', () => {
			const cleared = usersTable.updateUser(['name', 'email'], {data: {email: null as any}, where: {id: 1}});
			expect(cleared.query.sqlText).toBe('UPDATE users\nSET "email" = $1, "lastChangedBy" = $2\nWHERE "id" = $3;');
			expect(cleared.query.values).toEqual([null, 'SERVER', 1]);

			const skipped = usersTable.updateUser(['name', 'email'], {
				data: {name: 'Ann', email: undefined},
				where: {id: 1},
			});
			expect(skipped.query.sqlText).toBe('UPDATE users\nSET "name" = $1, "lastChangedBy" = $2\nWHERE "id" = $3;');
			expect(skipped.query.values).toEqual(['Ann', 'SERVER', 1]);
		});

		it('writes NULL for a null value in an insert and skips undefined', () => {
			const insert = usersTable.insertUser(['name', 'email', 'createdAt'], {
				data: {name: 'Ann', email: null as any, createdAt: undefined},
			});

			expect(insert.query.sqlText).toBe('INSERT INTO users ("name", "email", "lastChangedBy")\nVALUES ($1, $2, $3)\n;');
			expect(insert.query.values).toEqual(['Ann', null, 'SERVER']);
		});

		it('overwrites with NULL on conflict', () => {
			const upsert = usersTable.insertUser(['id', 'name', 'email'], {
				data: {id: 1, name: 'Ann', email: null as any},
				onConflict: true,
			});

			expect(upsert.query.sqlText).toContain(
				'ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "email" = EXCLUDED."email"'
			);
			expect(upsert.query.values).toEqual([1, 'Ann', null, 'SERVER']);
		});

		it('still drops a key outside allowedColumns, null or not', () => {
			const update = usersTable.updateUser(['name'], {
				data: {name: 'Ann', email: null as any, unknownKey: null} as any,
				where: {id: 1},
			});
			expect(update.query.sqlText).toBe('UPDATE users\nSET "name" = $1, "lastChangedBy" = $2\nWHERE "id" = $3;');
		});
	});

	describe('update takes no predefinedSQL', () => {
		it('throws when predefinedSQL is passed', () => {
			const update = () =>
				usersDb.update({
					allowedColumns: ['name'],
					predefinedSQL: {sqlText: 'SELECT 1'},
					options: {data: {name: 'Ann'}, where: {id: 1}},
				} as any);

			expect(update).toThrow(QueryInputError);
			expect(update).toThrow(/update does not take predefinedSQL/);
		});
	});

	describe('predefined SQL is wrapped as a subquery', () => {
		const predefined = '  SELECT id, name, email FROM users WHERE email LIKE $1 ORDER BY id;  ';
		type Row = {id: number; name: string; email: string};
		const custom = (input: Record<string, unknown>, sqlText = predefined) =>
			usersDb.selectWithCustomSchema<Row, Record<'id' | 'name' | 'email', any>>({
				predefinedSQL: {sqlText, values: ['%@example.com']},
				...input,
			} as any).query;

		it('sends predefined SQL with no filter exactly as it was given', () => {
			const query = custom({allowedColumns: ['id', 'name']});

			expect(query.sqlText).toBe(predefined);
			expect(query.values).toEqual(['%@example.com']);
			expect(custom({allowedColumns: '*', options: {where: {}}}).sqlText).toBe(predefined);
		});

		it('wraps it when a filter is added, and continues its placeholders', () => {
			const query = custom({
				allowedColumns: ['id', 'name'],
				options: {where: {'name.like': 'A%', 'id.orderBy': 'DESC', limit: 5}},
			});

			expect(query.sqlText).toBe(
				'SELECT * FROM (\nSELECT id, name, email FROM users WHERE email LIKE $1 ORDER BY id\n) AS q ' +
					'WHERE "name" LIKE $2 ORDER BY "id" DESC LIMIT 5'
			);
			expect(query.values).toEqual(['%@example.com', 'A%']);
		});

		it('returns only columnsToReturn, with or without a filter', () => {
			const withFilter = custom({
				allowedColumns: ['id', 'name'],
				options: {where: {id: 1}, columnsToReturn: ['id', 'name']},
			});
			expect(withFilter.sqlText).toMatch(/^SELECT "id", "name" FROM \(\n/);
			expect(withFilter.sqlText).toMatch(/\n\) AS q WHERE "id" = \$2$/);

			const withoutFilter = custom({allowedColumns: ['id', 'name'], options: {columnsToReturn: ['email']}});
			expect(withoutFilter.sqlText).toBe(
				'SELECT "email" FROM (\nSELECT id, name, email FROM users WHERE email LIKE $1 ORDER BY id\n) AS q'
			);
		});

		it('checks columnsToReturn before writing it into the SQL', () => {
			expect(() => custom({allowedColumns: '*', options: {columnsToReturn: ['id" FROM users; --']}})).toThrow(
				QueryInputError
			);
			expect(() =>
				custom({allowedColumns: '*', options: {schemaColumns: {id: {}, name: {}}, columnsToReturn: ['email']}})
			).toThrow('Column email is not in the provided schema');
		});

		it('keeps a trailing line comment of the predefined SQL from swallowing the filter', () => {
			const query = usersDb.selectWithCustomSchema({
				allowedColumns: ['id'],
				predefinedSQL: {sqlText: 'SELECT id FROM users -- all of them'},
				options: {where: {id: 1}},
			}).query;

			expect(query.sqlText).toBe('SELECT * FROM (\nSELECT id FROM users -- all of them\n) AS q WHERE "id" = $1');
		});

		it('does not change the object the caller passed', () => {
			const predefinedSQL = {sqlText: predefined, values: ['%@example.com']};
			usersDb.selectWithCustomSchema({allowedColumns: ['id'], predefinedSQL, options: {where: {id: 1}}});

			expect(predefinedSQL).toEqual({sqlText: predefined, values: ['%@example.com']});
		});

		it('wraps predefined SQL in select too, and columnsToReturn narrows it', () => {
			const query = usersDb.select({
				allowedColumns: ['id', 'name'],
				predefinedSQL: {sqlText: 'SELECT * FROM users WHERE email IS NOT NULL'},
				options: {where: {name: 'Ann'}, columnsToReturn: ['id']},
			}).query;

			expect(query.sqlText).toBe(
				'SELECT "id" FROM (\nSELECT * FROM users WHERE email IS NOT NULL\n) AS q WHERE "name" = $1'
			);

			const unfiltered = usersDb.select({
				allowedColumns: ['id', 'name'],
				predefinedSQL: {sqlText: 'SELECT * FROM users WHERE email IS NOT NULL'},
			}).query;
			expect(unfiltered.sqlText).toBe('SELECT * FROM users WHERE email IS NOT NULL');
		});

		it('has no alias option: a filter always names a result column', () => {
			const query = usersDb.select({
				allowedColumns: ['id', 'name'],
				options: {where: {name: 'Ann'}, alias: 'u'} as any,
			}).query;

			expect(query.sqlText).toBe('SELECT "id", "name" FROM users WHERE "name" = $1');
		});
	});

	describe('in sends one array parameter', () => {
		it('binds an array as one parameter', () => {
			const query = selectSql({'id.in': [1, 2, 3], name: 'Ann'});

			expect(query.sqlText).toBe('SELECT "id", "name", "email" FROM users WHERE "id" = ANY($1) AND "name" = $2');
			expect(query.values).toEqual([[1, 2, 3], 'Ann']);
		});

		it('splits a comma-separated string', () => {
			expect(selectSql({'name.in': 'Ann,Bob'}).values).toEqual([['Ann', 'Bob']]);
		});

		it('sends an empty list as an empty array, which matches no row', () => {
			expect(selectSql({'id.in': []}).sqlText).toBe('SELECT "id", "name", "email" FROM users WHERE "id" = ANY($1)');
			expect(selectSql({'id.in': []}).values).toEqual([[]]);
			expect(selectSql({'id.in': ''}).values).toEqual([[]]);
		});

		it('throws above 10,000 values', () => {
			const atTheCap = Array.from({length: 10000}, (_, index) => index);
			expect(selectSql({'id.in': atTheCap}).values[0]).toHaveLength(10000);

			expect(() => selectSql({'id.in': [...atTheCap, 10000]})).toThrow(QueryInputError);
			expect(() => selectSql({'id.in': [...atTheCap, 10000]})).toThrow(/Too many values for id.in: 10001/);
			expect(() => selectSql({'id.in': atTheCap.concat(atTheCap).join(',')})).toThrow(/Too many values/);
		});

		it('throws for a value that is neither an array nor a string', () => {
			for (const value of [5, null, undefined, {a: 1}, true]) {
				expect(() => selectSql({'id.in': value})).toThrow(/Invalid value for id.in/);
			}
		});
	});

	describe('maxLimit', () => {
		const cappedDb = new DatabaseOperations({...usersDefinition, maxLimit: 100});

		it('throws for a limit above the maximum of the table', () => {
			const select = (limit: unknown) =>
				cappedDb.select({allowedColumns: ['id'], options: {where: {limit} as any}}).query.sqlText;

			expect(select(100)).toBe('SELECT "id" FROM users LIMIT 100');
			expect(select('100')).toBe('SELECT "id" FROM users LIMIT 100');
			expect(() => select(101)).toThrow(QueryInputError);
			expect(() => select('101')).toThrow('Invalid limit value: 101. The maximum for this table is 100.');
		});

		it('applies to selectWithCustomSchema', () => {
			const custom = (limit: number) =>
				cappedDb.selectWithCustomSchema({
					allowedColumns: ['id'],
					predefinedSQL: {sqlText: 'SELECT id FROM users'},
					options: {where: {limit} as any},
				}).query.sqlText;

			expect(custom(100)).toBe('SELECT * FROM (\nSELECT id FROM users\n) AS q LIMIT 100');
			expect(() => custom(101)).toThrow(/The maximum for this table is 100/);
		});

		it('leaves a table without maxLimit unchanged', () => {
			expect(selectSql({limit: 1000000}).sqlText).toBe('SELECT "id", "name", "email" FROM users LIMIT 1000000');
		});

		it('rejects a maxLimit that is not a non-negative integer when the table is defined', () => {
			for (const maxLimit of [-1, 1.5, '100' as any, NaN]) {
				expect(() => new DatabaseOperations({...usersDefinition, maxLimit})).toThrow(
					/Invalid maxLimit for table users/
				);
			}
		});
	});

	describe('passing request input', () => {
		const publicUsers = new PublicUsersTable();

		it('filters on listed columns, ignores the rest and pages', () => {
			const query = publicUsers.listUsers({
				'name.like': 'A%',
				'id.orderBy': 'asc',
				limit: '20',
				offset: '40',
				utm_source: 'newsletter',
				lastChangedBy: 'SERVER',
			}).query;

			expect(query.sqlText).toBe(
				'SELECT "id", "name" FROM users WHERE "name" LIKE $1 ORDER BY "id" ASC LIMIT 20 OFFSET 40'
			);
			expect(query.values).toEqual(['A%']);
		});

		it('maps every rejected request to 400 through QueryInputError', () => {
			expect(statusFor(() => publicUsers.listUsers({name: 'Ann'}))).toBe(200);
			expect(statusFor(() => publicUsers.listUsers({limit: '101'}))).toBe(400);
			expect(statusFor(() => publicUsers.listUsers({limit: 'all'}))).toBe(400);
			expect(statusFor(() => publicUsers.listUsers({'name.regex': '.*'}))).toBe(400);
			expect(statusFor(() => publicUsers.listUsers({'id.orderBy': 'sideways'}))).toBe(400);
			expect(statusFor(() => publicUsers.listUsers({'email.null': 'maybe'}))).toBe(400);
		});
	});

	describe('conflict target for upserts', () => {
		const upsert = (data: Record<string, unknown>, onConflict: any) =>
			usersDb.insert({
				allowedColumns: ['id', 'name', 'email'],
				options: {data: data as any, onConflict, returnField: 'id'},
			}).query.sqlText;

		it('targets the named unique column and never rewrites it or the primary key', () => {
			expect(upsert({id: 5, name: 'Ann', email: 'ann@example.com'}, {target: ['email']})).toBe(
				'INSERT INTO users ("id", "name", "email", "lastChangedBy")\n' +
					'VALUES ($1, $2, $3, $4) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"\n' +
					'RETURNING "id";'
			);
		});

		it('does nothing on conflict when only target and key columns are sent', () => {
			expect(upsert({email: 'ann@example.com'}, {target: ['email']})).toContain('ON CONFLICT ("email") DO NOTHING');
		});

		it('quotes each column of a composite target', () => {
			expect(upsert({name: 'Ann', email: 'ann@example.com'}, {target: ['name', 'email']})).toContain(
				'ON CONFLICT ("name", "email") DO NOTHING'
			);
		});

		it('keeps true as the primary key', () => {
			expect(upsert({id: 5, name: 'Ann'}, true)).toContain('ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"');
			expect(upsert({id: 5, name: 'Ann'}, false)).not.toContain('ON CONFLICT');
		});

		it('validates the target against the table definition', () => {
			expect(() => upsert({name: 'Ann'}, {target: ['nickname']})).toThrow('Invalid onConflict target: nickname');
			expect(() => upsert({name: 'Ann'}, {target: ['email") DO NOTHING; --']})).toThrow(QueryInputError);
			expect(() => upsert({name: 'Ann'}, {target: []})).toThrow(/target must be a non-empty array/);
			expect(() => upsert({name: 'Ann'}, {})).toThrow(/target must be a non-empty array/);
			expect(() => upsert({name: 'Ann'}, {target: ['email', 'email']})).toThrow(QueryInputError);
		});
	});

	describe('QueryInputError', () => {
		const failures: [string, () => unknown][] = [
			['an unknown key', () => selectSql({nmae: 1})],
			['an unknown operator', () => selectSql({'name.gte': 1})],
			['a bad limit', () => selectSql({limit: -1})],
			['a bad offset', () => selectSql({offset: 'x'})],
			['a bad orderBy', () => selectSql({'name.orderBy': 'UP'})],
			['a bad .null', () => selectSql({'name.null': 'maybe'})],
			['a bad .in', () => selectSql({'id.in': 5})],
			[
				'a bad returnField',
				() => usersDb.insert({allowedColumns: ['name'], options: {data: {name: 'Ann'}, returnField: 'nope' as any}}),
			],
			['missing allowedColumns', () => usersDb.select({} as any)],
			['a column outside the schema in allowedColumns', () => usersDb.select({allowedColumns: ['nope' as any]})],
			['a duplicate in allowedColumns', () => usersDb.select({allowedColumns: ['id', 'id']})],
			[
				'an update without where',
				() => usersDb.update({allowedColumns: ['name'], options: {data: {name: 'Ann'}, where: {}}}),
			],
			[
				'an update with no column to write',
				() =>
					usersDb.update({allowedColumns: ['name'], options: {data: {}, where: {id: 1}} as any}) &&
					postsDb.update({allowedColumns: ['title'], options: {data: {}, where: {id: 1}}}),
			],
		];

		it.each(failures)('is thrown for %s', (_what, run) => {
			let thrown: unknown;
			try {
				run();
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(QueryInputError);
			expect(thrown).toBeInstanceOf(Error);
			expect((thrown as Error).name).toBe('QueryInputError');
		});

		it('never wraps an error from PostgreSQL', async () => {
			const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {code: '23505'});
			(dbpg.query as jest.Mock).mockRejectedValue(pgError);

			const insert = usersTable.insertUser(['name'], {data: {name: 'Ann'}}).execute();

			await expect(insert).rejects.toBe(pgError);
			await expect(insert).rejects.not.toBeInstanceOf(QueryInputError);
		});
	});
});
