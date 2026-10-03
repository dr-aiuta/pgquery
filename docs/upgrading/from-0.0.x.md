# Upgrading from 0.0.x

## Who needs this

Projects on any 0.0.x version, which use `new DatabaseManager(dbConfig, modelsConfig)`.

No release reaches such a project by itself. A caret range on `0.0.x` matches one exact version, so `^0.0.19` installs 0.0.19 forever. This guide is the only path to a current version.

### Why now

0.0.x writes three parts of the `where` object into the SQL text without escaping them:

- the value of `limit`
- the direction of `<column>.orderBy`
- the keys of a JSON filter

With the `'*'` allow-list it also writes any key as a column name.

A project is exposed when request input reaches a `where` object, for example `req.query` passed to a query function. Such a project should upgrade, or check that input first.

### A stopgap if you cannot upgrade yet

Check the `where` object before it reaches the library. Three checks close the holes above: `limit` is an integer, a sort direction is `ASC` or `DESC`, and every key is a known column.

```typescript
const SORT_DIRECTIONS = ['ASC', 'DESC'];
const SAFE_JSON_KEY = /^[A-Za-z0-9_]+$/;

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

// Call it in front of every query that takes request input
assertSafeWhere(req.query, ['id', 'name', 'email']);
```

Replace `'*'` in your `allowedColumns` with a list of quoted names at the same time. The stopgap is not a substitute for the upgrade.

## What is new

Everything since 0.0.x. The parts you meet first:

- One table class per model, with typed `select`, `insert` and `update`. See the [README](../../README.md#quick-start).
- An allow-list that is checked against the table definition, and filters that fail closed. See [Filters](../features/filters.md).
- Writes with `allowedColumns`, upserts and `returnField`. See [Writes](../features/writes.md).
- Transactions and chained inserts. See [Transactions and chains](../features/transactions-and-chains.md).
- One shared connection, with an optional logger. See [Connection](../features/connection.md).
- Schema drift checks and migration drafts. See [Schema](../features/schema.md).

## Before you start

1. Pin the version you run now, for example `"pg-lightquery": "0.0.19"`.
2. Run your test suite, and note the result.
3. For each query function you use, print the SQL it sends for one representative input. You compare against it later. 0.0.x has no `.query` property, so log the text at the `pg` pool, or read it from the PostgreSQL log.

## How the old API maps to the new one

Each row was checked against the 0.0.19 source.

| 0.0.x | 0.5.0 |
|---|---|
| `new DatabaseManager(dbConfig, modelsConfig)` | `PostgresConnection.initialize(dbConfig)` once, plus one table class per model |
| one entry of `modelsConfig`, with `tableName` and `schema` | one table definition, `{tableName, schema: {columns}}`, and one class that extends `TableBase` |
| a query with `type: 'select'` and SQL such as `SELECT * FROM users` | a method that calls `this.select({allowedColumns, options: {where}})` |
| a query with `type: 'select'` and its own SQL: a join, an aggregate | a method that calls `this.select` or `this.selectWithCustomSchema` with `predefinedSQL: {sqlText}` |
| `db.models.users.queries.getUsers(allowedColumns, whereObj)` | `users.getUsers(whereObj)`. `allowedColumns` and `options.where` live inside the method. |
| `allowedColumns` as quoted names, `['"id"', '"name"']`, or `['*']` | plain names, `['id', 'name']`, or `'*'` |
| the `alias` argument | removed. Predefined SQL is wrapped, so filters name the columns of its result. |
| `sql` as a function of `sqlArgs` | build the SQL text in the method and pass it as `predefinedSQL.sqlText`, with its values in `predefinedSQL.values` |
| a query of another `type`, with `sql` and `values(args)` | `this.insert(...)` or `this.update(...)`. For hand-written SQL, `PostgresConnection.query(sql, values)`. |
| `processResult(result)` | `execute()` resolves to the rows. Transform them in the method. |

The same model on both versions:

```typescript
// 0.0.x
const modelsConfig = {
	users: {
		tableName: 'users',
		schema: {/* ... */},
		queries: {
			getUsers: {sql: 'SELECT * FROM users', type: 'select'},
		},
	},
};
const db = new DatabaseManager(dbConfig, modelsConfig);
const rows = await db.models.users.queries.getUsers(['"id"', '"name"', '"limit"'], where);
```

```typescript
// 0.5.0
class UsersModel extends TableBase<UsersSchema> {
	constructor() {
		super({tableName: 'users', schema: {columns: usersColumns}});
	}

	public getUsers(where: QueryParams<UsersSchema>) {
		return this.select({allowedColumns: ['id', 'name'], options: {where, columnsToReturn: '*'}});
	}

	// A query with its own SQL
	public getUsersWithPostCount(where: Record<string, unknown>) {
		return this.selectWithCustomSchema({
			allowedColumns: ['id', 'name', 'postCount'],
			predefinedSQL: {
				sqlText: `SELECT u.id, u.name, count(p.id)::int AS "postCount" FROM users u LEFT JOIN posts p ON p."userId" = u.id GROUP BY u.id, u.name`,
			},
			options: {where},
		});
	}
}

PostgresConnection.initialize(dbConfig);
const users = new UsersModel();
const rows = await users.getUsers(where).execute();
```

For a plain select the SQL text is the same on both versions:

```typescript
users.getUsers({name: 'Ann', 'id.orderBy': 'DESC', limit: 10}).query.sqlText;
// SELECT * FROM users WHERE "name" = $1 ORDER BY "id" DESC LIMIT 10
```

## Differences in behavior to check

| Input | 0.0.x | 0.5.0 |
|---|---|---|
| `{name: null}` | `"name" IS NULL` | the same |
| `{'name.not': null}` | `"name" IS NULL` | `"name" <> $1` with `null`, which matches no row. Use `{'name.null': false}` for `IS NOT NULL`. |
| `limit` | allowed only when `'"limit"'` or `'*'` is in `allowedColumns`. The value goes into the SQL unchecked. | always allowed in `select`. It must be a non-negative integer. `offset` works the same way. |
| `{'id.in': '1,2'}` | split on commas, `"id" IN ($1, $2)` | split on commas, `"id" = ANY($1)` with one array parameter |
| `{'id.in': []}` | `IN ()`, which PostgreSQL rejects | an empty array, which matches no row |
| a key outside `allowedColumns` | dropped in silence | throws `QueryInputError`. Set `ignoreUnknownKeys: true` to drop it. |
| `<column>.orderBy` with a value outside `ASC` and `DESC` | written into the SQL | throws |
| a query with its own SQL plus a filter | the filter is appended to the SQL | the SQL is wrapped as a subquery, and the filter applies to its result columns |
| a failed query | the `pg` error | the same `pg` error, unchanged |

## Steps

The mapping above was checked against the 0.0.19 source. Nobody has run this migration from start to end on a real project yet. Treat the steps as a tested plan, not as a record of one.

### 1. Initialize the connection

- **What changed.** The pool belongs to `PostgresConnection`, not to a `DatabaseManager` instance.
- **Find it.** Search for `new DatabaseManager(`:

  ```bash
  grep -rn "new DatabaseManager(" .
  ```

- **Change it.**

  ```typescript
  // before
  const db = new DatabaseManager(dbConfig, modelsConfig);

  // after
  import {PostgresConnection} from 'pg-lightquery';
  PostgresConnection.initialize(dbConfig);
  ```

- **Check it.** `await PostgresConnection.query('SELECT 1')` resolves.

### 2. Write the table definitions

- **What changed.** A schema lives in a table definition. Column types have fixed names, and each maps to a TypeScript type.
- **Find it.** Every `schema` object in your `modelsConfig`.
- **Change it.** Write one definition per table. `SERIAL` becomes `INTEGER` with `autoIncrement: true`. `TIMESTAMP` becomes `TIMESTAMP WITHOUT TIME ZONE`. The type table is in [Schema: column types](../features/schema.md#column-types).

  ```typescript
  export const usersColumns = {
  	id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
  	name: {type: 'TEXT', notNull: true},
  	email: {type: 'TEXT', unique: true},
  	createdAt: {type: 'TIMESTAMP WITHOUT TIME ZONE', notNull: true, default: 'NOW()'},
  } as const;
  ```

- **Check it.** Run `checkSchemaDrift` against your database. It reports every column that disagrees with the definition. See [Schema: checkSchemaDrift](../features/schema.md#checkschemadrift).

### 3. Write one class per model

- **What changed.** A model is a class that extends `TableBase`. Its methods are your named queries.
- **Find it.** Every key of `modelsConfig`.
- **Change it.** Start each class with a constructor only, as in `UsersModel` above. Add methods in the next step.
- **Check it.** The type check passes.

### 4. Move one query at a time

- **What changed.** A query function becomes a method. `allowedColumns` moves from the call site into the method, and loses its quotes.
- **Find it.** Search for `.queries.`:

  ```bash
  grep -rn "\.queries\." .
  ```

- **Change it.** Use the mapping table above.

  To move one query at a time, both versions have to be installed. An npm alias does that: keep the old one as `"pg-lightquery-legacy": "npm:pg-lightquery@0.0.19"` and import `DatabaseManager` from `pg-lightquery-legacy`. The maintainers have not tried this side-by-side install. The alternative is to move a whole model in one change.

  This step needs a judgement call. The question to answer for each query: which columns may a caller filter on? In 0.0.x that list was passed at each call. Now it is written once in the method.
- **Check it.** Print `.query` for the new method and compare it with the SQL you noted for the old one. Use the differences table above to explain what is not identical.

### 5. Handle the stricter filters

- **What changed.** An unknown key, an unknown operator and a bad `limit` throw `QueryInputError`.
- **Find it.** Every call site that passes request input.
- **Change it.** Follow [Filters: passing request input safely](../features/filters.md#passing-request-input-safely).
- **Check it.** A request with a bad parameter gets HTTP 400, not 500.

## After the upgrade

1. Run your test suite, and compare the result with what you noted.
2. Remove `DatabaseManager`, `modelsConfig` and the stopgap check.
3. To roll back, pin the 0.0.x version you came from and restore the `DatabaseManager` code.
