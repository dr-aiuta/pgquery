import {TableBase} from '../../src/table-base';
import {QueryInputError} from '../../src/sql/identifiers';
import {QueryParams} from '../../src/types';
import {UsersSchema, usersColumns} from '../tables/definitions/users';

/**
 * The examples of docs/upgrading/from-0.0.x.md.
 *
 * The 0.0.x SQL in the comments was derived by reading the 0.0.19 source:
 * DatabaseManager built `${query.sql} ${wherePart} ${orderByPart} ${limitPart}` for a select query.
 */

// ---------- The stopgap for a project that cannot upgrade yet ----------

const SORT_DIRECTIONS = ['ASC', 'DESC'];
const SAFE_JSON_KEY = /^[A-Za-z0-9_]+$/;

/**
 * Checks a where object before it reaches a 0.0.x DatabaseManager query.
 * 0.0.x writes `limit`, the sort direction, JSON keys and, under '*', column names into the SQL text.
 */
function assertSafeWhere(where: Record<string, unknown>, knownColumns: string[]): void {
	for (const [key, value] of Object.entries(where)) {
		const [field, condition] = key.split('.');
		if (field === 'limit') {
			if (!/^\d+$/.test(String(value))) {
				throw new Error(`limit must be a non-negative integer: ${String(value)}`);
			}
			continue;
		}
		if (!knownColumns.includes(field)) {
			throw new Error(`Unknown column: ${field}`);
		}
		if (condition === 'orderBy' && !SORT_DIRECTIONS.includes(String(value).toUpperCase())) {
			throw new Error(`Sort direction must be ASC or DESC: ${String(value)}`);
		}
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			for (const jsonKey of Object.keys(value)) {
				if (!SAFE_JSON_KEY.test(jsonKey)) {
					throw new Error(`Unsafe JSON key for ${field}: ${jsonKey}`);
				}
			}
		}
	}
}

describe('stopgap for 0.0.x: check the where object first', () => {
	const columns = ['id', 'name', 'email', 'settings'];

	it('accepts a where object with known columns and safe values', () => {
		expect(() =>
			assertSafeWhere(
				{name: 'Ann', 'id.orderBy': 'desc', 'email.like': '%@example.com', limit: '10', settings: {theme: 'dark'}},
				columns
			)
		).not.toThrow();
	});

	it('rejects what 0.0.x would write into the SQL text', () => {
		expect(() => assertSafeWhere({limit: '1; DELETE FROM users'}, columns)).toThrow(/limit must be/);
		expect(() => assertSafeWhere({limit: -1}, columns)).toThrow(/limit must be/);
		expect(() => assertSafeWhere({'id.orderBy': 'ASC; DROP TABLE users'}, columns)).toThrow(/Sort direction/);
		expect(() => assertSafeWhere({'id" = $1 OR true OR "id': 1}, columns)).toThrow(/Unknown column/);
		expect(() => assertSafeWhere({password: 'x'}, columns)).toThrow(/Unknown column/);
		expect(() => assertSafeWhere({settings: {'theme\' = $1 OR true OR "settings" ->> \'theme': 'x'}}, columns)).toThrow(
			/Unsafe JSON key/
		);
	});
});

// ---------- The same model on 0.5.0 ----------

// 0.0.x: modelsConfig.users = {tableName: 'users', schema: {...}, queries: {getUsers: {sql: 'SELECT * FROM users', type: 'select'}}}
// 0.5.0: one table definition and one class per model. Each named query becomes a method.
class UsersModel extends TableBase<UsersSchema> {
	constructor() {
		super({tableName: 'users', schema: {columns: usersColumns}});
	}

	// 0.0.x: db.models.users.queries.getUsers(['"id"', '"name"', '"limit"'], where)
	public getUsers(where: QueryParams<UsersSchema>) {
		return this.select({allowedColumns: ['id', 'name'], options: {where, columnsToReturn: '*'}});
	}

	// 0.0.x: a select query with its own SQL, and the where object appended to it
	public getUsersWithPostCount(where: Record<string, unknown>) {
		type Row = {id: number; name: string; postCount: number};
		return this.selectWithCustomSchema<Row, Record<keyof Row, any>>({
			allowedColumns: ['id', 'name', 'postCount'],
			predefinedSQL: {
				sqlText: `SELECT u.id, u.name, count(p.id)::int AS "postCount" FROM users u LEFT JOIN posts p ON p."userId" = u.id GROUP BY u.id, u.name`,
			},
			options: {where: where as any},
		});
	}
}

describe('a 0.0.x model moved to 0.5.0', () => {
	const users = new UsersModel();

	it('builds the same SQL as 0.0.19 for a plain select query', () => {
		const query = users.getUsers({name: 'Ann', 'id.orderBy': 'DESC', limit: 10} as any).query;

		// 0.0.19 built exactly this text for sql: 'SELECT * FROM users'
		expect(query.sqlText).toBe('SELECT * FROM users WHERE "name" = $1 ORDER BY "id" DESC LIMIT 10');
		expect(query.values).toEqual(['Ann']);
	});

	it('wraps a query that has its own SQL, where 0.0.19 appended to it', () => {
		const query = users.getUsersWithPostCount({postCount: 2}).query;

		expect(query.sqlText).toBe(
			'SELECT * FROM (\n' +
				'SELECT u.id, u.name, count(p.id)::int AS "postCount" FROM users u LEFT JOIN posts p ON p."userId" = u.id GROUP BY u.id, u.name\n' +
				') AS q WHERE "postCount" = $1'
		);
	});

	describe('differences in behavior to check', () => {
		it('a null value still filters with IS NULL, but .not with null does not', () => {
			expect(users.getUsers({name: null}).query.sqlText).toBe('SELECT * FROM users WHERE "name" IS NULL');

			// 0.0.19 turned {'name.not': null} into "name" IS NULL. 0.5.0 binds the null, which matches no row.
			const not = users.getUsers({'name.not': null}).query;
			expect(not.sqlText).toBe('SELECT * FROM users WHERE "name" <> $1');
			expect(not.values).toEqual([null]);

			// IS NOT NULL is asked for with .null
			expect(users.getUsers({'name.null': false}).query.sqlText).toBe('SELECT * FROM users WHERE "name" IS NOT NULL');
		});

		it('limit needs no entry in allowedColumns and must be an integer', () => {
			expect(users.getUsers({limit: '25'} as any).query.sqlText).toBe('SELECT * FROM users LIMIT 25');
			expect(() => users.getUsers({limit: '1; DELETE FROM users'} as any)).toThrow(QueryInputError);
		});

		it('.in still splits a comma-separated string, and sends one array parameter', () => {
			// 0.0.19: "id" IN ($1, $2) with the values '1' and '2'
			const query = users.getUsers({'id.in': '1,2'}).query;
			expect(query.sqlText).toBe('SELECT * FROM users WHERE "id" = ANY($1)');
			expect(query.values).toEqual([['1', '2']]);

			// 0.0.19 built IN () for an empty list, which PostgreSQL rejects.
			expect(users.getUsers({'id.in': []}).query.values).toEqual([[]]);
		});

		it('an unknown key throws, where 0.0.19 dropped it', () => {
			expect(() => users.getUsers({email: 'ann@example.com'})).toThrow('Unknown column in query parameters: email');
		});

		it('a sort direction outside ASC and DESC throws, where 0.0.19 wrote it into the SQL', () => {
			expect(() => users.getUsers({'id.orderBy': 'ASC; DROP TABLE users'})).toThrow(QueryInputError);
		});
	});
});
