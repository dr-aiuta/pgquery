# Writes: insert, upsert and update

`insert` and `update` build one statement from a `data` object. `allowedColumns` decides which keys of that object may be written. Values are bound as parameters. `returnField` asks for columns of the written rows.

The examples use the `users` table from [`tests/tables`](../../tests/tables). There, `usersTable.insertUser(allowedColumns, options)` and `usersTable.updateUser(allowedColumns, options)` are thin wrappers around `insert` and `update`.

## Minimal example

```typescript
const [inserted] = await usersTable
	.insertUser(['name', 'email'], {
		data: {name: 'John Doe', email: 'john.doe@example.com'},
		returnField: 'id',
	})
	.execute();

const updated = await usersTable
	.updateUser(['name'], {
		data: {name: 'John Updated'},
		where: {id: inserted.id},
		returnField: 'id',
	})
	.execute();
// [{id: inserted.id}]
```

## `allowedColumns` for writes

Since 0.5.0 `allowedColumns` has no default. Every write names its columns, or writes `'*'` out.

A key of `data` outside `allowedColumns` is dropped. It is not an error. This lets you pass an object with extra keys, and the list is the guard.

```typescript
const update = usersTable.updateUser(['name'], {
	data: {name: 'Ann', email: null, unknownKey: null},
	where: {id: 1},
});
// UPDATE users
// SET "name" = $1, "lastChangedBy" = $2
// WHERE "id" = $3;
```

Pass a list whenever the object comes from outside your code, such as a request body. Pass `'*'` only when your own code builds the object.

The same rule holds for every step of a chained insert. Each step takes its own `allowedColumns`.

## `null` and `undefined`

Since 0.5.0 a `null` value writes `NULL`. Only `undefined` is skipped. Before 0.5.0 both were skipped, so a column could not be cleared.

```typescript
// null clears the column
usersTable.updateUser(['name', 'email'], {data: {email: null}, where: {id: 1}});
// UPDATE users
// SET "email" = $1, "lastChangedBy" = $2
// WHERE "id" = $3;
// values: [null, 'SERVER', 1]

// undefined leaves it alone
usersTable.updateUser(['name', 'email'], {data: {name: 'Ann', email: undefined}, where: {id: 1}});
// SET "name" = $1, "lastChangedBy" = $2
```

In an insert, `null` is written as `NULL` too. The column default then does not apply. Leave the key out, or pass `undefined`, to get the default.

## SQL expressions as values

Since 0.5.1 a value in `data` can be an SQL expression. Wrap it in `sqlExpression(...)`. The expression is written into the SQL text and is not bound.

```typescript
import {sqlExpression} from 'pg-lightquery';

const insert = usersDb.insert({
	allowedColumns: ['name', 'createdAt'],
	options: {data: {name: 'Ann', createdAt: sqlExpression('now()')}, returnField: 'id'},
});
// INSERT INTO users ("name", "lastChangedBy", "createdAt")
// VALUES ($1, $2, now())
// RETURNING "id";
// values: ['Ann', 'SERVER']
```

- An expression is SQL you write. Never build one from request input.
- Request data cannot forge an expression. The marker is a symbol, and JSON cannot carry a symbol. An object such as `{"sql": "now()"}` from a request body is bound as a value.
- `allowedColumns` applies to an expression as to any other value.
- Expression columns are written after the bound columns.

## Upserts

`onConflict` turns an insert into an upsert.

| `onConflict`          | Conflict target                                                        | Since |
| --------------------- | ---------------------------------------------------------------------- | ----- |
| `false`, or left out  | none. A plain insert.                                                  |       |
| `true`                | the primary key columns of the table definition                        |       |
| `{target: ['email']}` | the named columns. They must have a unique constraint in the database. | 0.5.0 |

```typescript
const upsert = usersDb.insert({
	allowedColumns: ['name', 'email'],
	options: {
		data: {name: 'Second name', email: 'upsert@example.com'},
		onConflict: {target: ['email']},
		returnField: ['id', 'name'],
	},
});
// INSERT INTO users ("name", "email", "lastChangedBy")
// VALUES ($1, $2, $3) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"
// RETURNING "id", "name";
```

On conflict the row is updated with the other columns of `data`. The target columns and the primary key columns are never rewritten.

When `data` holds nothing but target and key columns, there is nothing to update. The statement then ends in `ON CONFLICT (...) DO NOTHING`. It succeeds and returns no row for a conflicting insert. Since 0.4.7.

Every column of a composite target is quoted on its own. Since 0.4.7.

An insert whose `data` yields no column becomes `INSERT INTO ... DEFAULT VALUES`. Since 0.4.7.

## `returnField`

| Value            | SQL                                                            |
| ---------------- | -------------------------------------------------------------- |
| left out         | no `RETURNING` clause. `execute()` resolves to an empty array. |
| `'*'`            | `RETURNING *`                                                  |
| `'id'`           | `RETURNING "id"`                                               |
| `['id', 'name']` | `RETURNING "id", "name"`                                       |

Since 0.4.7 a name must be a column of the table definition. Anything else throws.

## Update safety

`update` needs a `where` object. An empty one throws, unless `allowUpdateAll: true` is set.

`where` may use any column of the table definition and every operator of [Filters](filters.md#operators). `allowedColumns` governs only what is written. An unknown `where` key throws.

Since 0.5.0 `update` takes no `predefinedSQL`. PostgreSQL rejects two commands in one prepared statement, so that option never worked.

## The `lastChangedBy` convention

A table whose definition has a column named `lastChangedBy` gets it written on every insert and every update. The value is the `idUser` option, and `'SERVER'` when `idUser` is left out.

```typescript
await usersTable.updateUser(['name', 'email'], {data: {email: null}, where: {id}, idUser: 'editor'}).execute();
// the row now has lastChangedBy = 'editor'
```

- The column is written whatever `allowedColumns` says. A `lastChangedBy` key in `data` is not the source of the value. With a list that leaves the column out, such a key is dropped.
- A table without that column is not affected.
- An upsert that updates an existing row does not rewrite `lastChangedBy`.

## Options

`insert`:

| Option        | Meaning                             |
| ------------- | ----------------------------------- |
| `data`        | the values to write, by column name |
| `returnField` | the columns to return               |
| `onConflict`  | see Upserts                         |
| `idUser`      | the value for `lastChangedBy`       |

`update`:

| Option           | Meaning                                |
| ---------------- | -------------------------------------- |
| `data`           | the values to write, by column name    |
| `where`          | which rows to update. Required.        |
| `returnField`    | the columns to return                  |
| `idUser`         | the value for `lastChangedBy`          |
| `allowUpdateAll` | allows an update with an empty `where` |

## Limits and failure modes

- Bad input throws `QueryInputError` when the query is built: a missing `allowedColumns`, a column in `allowedColumns` that the definition lacks, a bad `returnField`, a bad `onConflict` target, an empty `where`, or an update with no column left to write.
- Errors from PostgreSQL pass through unchanged, with their `code`. A unique violation has code `23505`.
- `onConflict: {target}` needs a unique constraint or unique index on exactly those columns. Without one, PostgreSQL rejects the statement with code `42P10`.
- A `null` for a `NOT NULL` column is rejected by PostgreSQL with code `23502`, even when the column has a default.
- A `lastChangedBy` key in `data` that passes `allowedColumns` puts the column into the statement twice, and PostgreSQL rejects it. Set the value with `idUser`.
- One call writes one row. There is no multi-row insert.
