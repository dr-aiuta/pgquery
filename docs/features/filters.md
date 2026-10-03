# Filters, sorting and paging

The `where` object of `select` and `selectWithCustomSchema` carries three things: the filters, the sort keys and the paging keys of a query. The library turns them into `WHERE`, `ORDER BY`, `LIMIT` and `OFFSET`. Values are bound as parameters. Column names, sort directions and paging numbers are checked before they reach the SQL text.

Since 0.5.0 filters fail closed. A key the query does not know throws. It is never dropped in silence.

The examples use the `users` and `posts` tables from [`tests/tables`](../../tests/tables). There, `usersTable.selectUsers(allowedColumns, {where})` is a thin wrapper around `select`.

## Minimal example

```typescript
const query = usersTable.selectUsers(['id', 'name', 'email'], {
	where: {'name.like': 'A%', 'id.orderBy': 'DESC', limit: 10} as any,
});

console.log(query.query.sqlText);
// SELECT "id", "name", "email" FROM users WHERE "name" LIKE $1 ORDER BY "id" DESC LIMIT 10
console.log(query.query.values);
// ['A%']

const rows = await query.execute();
```

## Operators

A key is a column name, or a column name with one operator after a dot.

| Key | Value | SQL | Since |
|---|---|---|---|
| `<column>` | any value | `"<column>" = $n` | |
| `<column>` | `null` | `"<column>" IS NULL` | |
| `<column>` | an object | one `"<column>" ->> $n = $m` per key, for a JSON column | |
| `<column>.not` | any value | `"<column>" <> $n` | |
| `<column>.like` | a pattern | `"<column>" LIKE $n` | |
| `<column>.in` | an array, or a comma-separated string | `"<column>" = ANY($n)` | one array parameter since 0.5.0 |
| `<column>.null` | `true` or `false` | `IS NULL` for `true`, `IS NOT NULL` for `false` | booleans since 0.5.0 |
| `<column>.startDate` | a date | `"<column>" >= $n` | |
| `<column>.endDate` | a date | `"<column>" <= $n` | |
| `<column>.orderBy` | `'ASC'` or `'DESC'`, in any case | `ORDER BY "<column>" ASC` | several sort keys since 0.4.7 |
| `limit` | non-negative integer, as a number or a numeric string | `LIMIT n` | |
| `offset` | non-negative integer, as a number or a numeric string | `OFFSET m` | 0.4.7 |

`.null` takes `true`, `false`, `'true'` or `'false'`. The strings are what a query string carries. Any other value throws.

Any other operator throws, for example `age.gte`. Before 0.5.0 an unknown operator fell back to equality.

## The allow-list

`allowedColumns` names the columns a `where` object may use. It has no default since 0.5.0. Pass a list, or write `'*'` out to allow every column of the table definition.

```typescript
// name is on the list
usersTable.selectUsers(['id', 'name', 'email'], {where: {name: 'Ann'}});

// A misspelled key throws QueryInputError: Unknown column in query parameters: nmae
usersTable.selectUsers(['id', 'name', 'email'], {where: {nmae: 'Ann'} as any});

// A real column that the list leaves out throws too
usersTable.selectUsers(['id', 'name', 'email'], {where: {lastChangedBy: 'SERVER'} as any});
```

A misspelled filter that was dropped would widen the result. That is why it throws.

### `ignoreUnknownKeys`

Since 0.5.0. A route that passes a raw query string usually wants extra parameters ignored. Set `ignoreUnknownKeys: true` and keys whose column is not on the list are dropped, as they were before 0.5.0.

```typescript
const query = usersDb.select({
	allowedColumns: ['id', 'name', 'email'],
	options: {
		where: {nmae: 'Ann', lastChangedBy: 'SERVER', id: 1},
		ignoreUnknownKeys: true,
	},
});
// SELECT "id", "name", "email" FROM users WHERE "id" = $1
```

The flag covers unknown columns only. An unknown operator, a bad `limit`, a bad `offset` and a bad sort direction still throw.

## `in`

Since 0.5.0 the list travels as one array parameter.

```typescript
usersTable.selectUsers(['id', 'name', 'email'], {where: {'id.in': [1, 2, 3], name: 'Ann'}});
// SELECT "id", "name", "email" FROM users WHERE "id" = ANY($1) AND "name" = $2
// values: [[1, 2, 3], 'Ann']
```

- A comma-separated string is split: `'Ann,Bob'` becomes `['Ann', 'Bob']`.
- An empty list matches no row. Before 0.5.0 it was a syntax error.
- More than 10,000 values throw.
- A value that is neither an array nor a string throws.

PostgreSQL takes the type of the array from the column. Integer, text and enum columns all work.

## Sorting

A key of the form `<column>.orderBy` sorts by that column. Sort keys keep the order of the object's keys.

```typescript
usersTable.selectUsers(['id', 'name'], {
	where: {'name.orderBy': 'ASC', 'id.orderBy': 'DESC'},
});
// SELECT "id", "name" FROM users ORDER BY "name" ASC, "id" DESC
```

## Paging

`limit` sets the page size and `offset` skips rows. Both go through the same check. Each must be a non-negative integer, given as a number or as a numeric string such as `'10'`.

```typescript
usersTable.selectUsers(['id', 'name'], {
	where: {'id.orderBy': 'ASC', limit: 10, offset: 20} as any,
});
// SELECT "id", "name" FROM users ORDER BY "id" ASC LIMIT 10 OFFSET 20
```

### `maxLimit`

Since 0.5.0. A table definition can cap the page size. A `limit` above the cap throws. Without `maxLimit` there is no ceiling.

```typescript
const cappedUsers: TableDefinition<UsersSchema> = {
	tableName: 'users',
	maxLimit: 100,
	schema: {columns: usersColumns},
};
// limit: 100 is accepted
// limit: 101 throws QueryInputError: Invalid limit value: 101. The maximum for this table is 100.
```

`maxLimit` does not add a limit to a query that has none.

## Predefined SQL

`select` and `selectWithCustomSchema` take hand-written SQL in `predefinedSQL`. Since 0.5.0 the library wraps it as a subquery when it adds a filter, a sort key, a paging key or a column list.

```typescript
const query = usersDb.selectWithCustomSchema({
	allowedColumns: ['id', 'name'],
	predefinedSQL: {
		sqlText: 'SELECT id, name, email FROM users WHERE email LIKE $1 ORDER BY id;',
		values: ['%@example.com'],
	},
	options: {where: {name: 'Ann', 'id.in': [1, 2, 3, 4]}},
});

console.log(query.query.sqlText);
// SELECT * FROM (
// SELECT id, name, email FROM users WHERE email LIKE $1 ORDER BY id
// ) AS q WHERE "name" = $2 AND "id" = ANY($3)
```

What follows from the wrapping:

- The predefined SQL may end in its own `WHERE`, `GROUP BY` or `ORDER BY`. Before 0.5.0 the filter was appended to it and broke such queries.
- Filters name the columns of the predefined query's result. A filter on an aggregated column works:

  ```typescript
  usersDb.selectWithCustomSchema({
  	allowedColumns: ['id', 'name', 'postCount'],
  	predefinedSQL: {
  		sqlText: `SELECT u.id, u.name, count(p.id)::int AS "postCount"
  			FROM users u LEFT JOIN posts p ON p."userId" = u.id
  			GROUP BY u.id, u.name`,
  	},
  	options: {where: {'postCount.in': [1, 2], 'id.orderBy': 'ASC'}, columnsToReturn: ['name', 'postCount']},
  });
  ```

- `columnsToReturn` works with predefined SQL. It narrows the outer column list.
- Placeholders continue after the highest one of the predefined SQL.
- With nothing to add, the predefined SQL is sent exactly as it was given.
- The `alias` option is gone. It is not needed, because a filter never has to reach into the predefined query.

`limit` and `offset` work in `selectWithCustomSchema` with an explicit column list since 0.4.7.

## Passing request input safely

A route that hands `req.query` to `where` needs four pieces:

1. An explicit column list. It decides what a client may filter on.
2. `ignoreUnknownKeys: true`, if extra parameters should be ignored. Leave it out to reject them.
3. `maxLimit` on the table, so a client cannot ask for every row.
4. One place that maps `QueryInputError` to HTTP 400.

```typescript
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

const query = publicUsers.listUsers({
	'name.like': 'A%',
	'id.orderBy': 'asc',
	limit: '20',
	offset: '40',
	utm_source: 'newsletter', // not a column: ignored
	lastChangedBy: 'SERVER', // a column, but not on the list: ignored
});
// SELECT "id", "name" FROM users WHERE "name" LIKE $1 ORDER BY "id" ASC LIMIT 20 OFFSET 40
```

Map the error where your application handles errors:

```typescript
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

statusFor(() => publicUsers.listUsers({limit: '101'})); // 400, above maxLimit
statusFor(() => publicUsers.listUsers({'name.regex': '.*'})); // 400, unknown operator
statusFor(() => publicUsers.listUsers({'email.null': 'maybe'})); // 400
```

`allowedColumns` governs filters. `columnsToReturn` governs what comes back. Keep secret columns out of both.

## Limits and failure modes

- Every rejected input throws `QueryInputError` when the query is built, before anything reaches the database. See [Connection: errors](connection.md#errors).
- A `limit` or an `offset` that is not a non-negative integer throws `Invalid limit value` or `Invalid offset value`.
- A sort direction other than `ASC` or `DESC` throws `Invalid orderBy direction`.
- `limit` and `offset` are paging keys and take no operator. A table with a column named `limit` or `offset` cannot filter on that column through `where`.
- `limit` and `offset` are not part of the `QueryParams` type. A TypeScript object literal that holds them needs a cast, as in the examples above. An object that comes from request input needs none.
- Paging without a sort key returns rows in no defined order. Pass a sort key with every paged query.
- Wrapping moves an `ORDER BY` of the predefined SQL inside the subquery. PostgreSQL keeps that order for a plain outer filter in practice, but the SQL standard does not promise it. Pass `.orderBy` when a filtered query must be ordered.
- A data-modifying `WITH` clause cannot run inside a subquery. Predefined SQL that holds one cannot take a filter.
- `<column>.not` with `null` produces `<> NULL`, which matches no row. Use `'<column>.null': false` for `IS NOT NULL`.
