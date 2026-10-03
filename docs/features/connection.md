# Connection

`PostgresConnection` owns the one connection pool the library uses. Initialize it once when the process starts. Every table class then runs its queries through that pool. The pool can be closed, and since 0.5.0 a logger can be attached.

## Minimal example

```typescript
import {PostgresConnection} from 'pg-lightquery';

PostgresConnection.initialize({connectionString: process.env.DATABASE_URL});

// ... run queries through your table classes ...

await PostgresConnection.end();
```

## Methods

All of them are static.

| Method                         | What it does                                                                                                                               | Since                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `initialize(config, options?)` | Creates the pool. `config` is a [`pg` pool configuration](https://node-postgres.com/apis/pool). `options` holds the logger settings below. | `options` since 0.5.0 |
| `getInstance()`                | Returns the initialized connection.                                                                                                        |                       |
| `query(text, params)`          | Runs one statement on a pool connection and resolves to the pg result.                                                                     |                       |
| `transaction(queries)`         | Runs a list of query objects as one transaction. See [Transactions and chains](transactions-and-chains.md).                                | 0.4.7                 |
| `transaction(text, params)`    | Runs one statement inside `BEGIN` and `COMMIT`.                                                                                            |                       |
| `end()`                        | Closes the pool and clears the connection, so `initialize` can be called again.                                                            | 0.4.7                 |

## Logging

Since 0.5.0 the library prints nothing by default. Before 0.5.0 it wrote a line to the console for every query, and it printed bound values for slow ones.

Pass a logger to `initialize` to see what runs.

```typescript
import {PostgresConnection, QueryLogEntry} from 'pg-lightquery';

const logEntries: QueryLogEntry[] = [];

PostgresConnection.initialize(
	{connectionString: process.env.DATABASE_URL},
	{logger: (entry) => logEntries.push(entry), slowQueryMs: 500}
);
```

| Option        | Default | Meaning                                                                  |
| ------------- | ------- | ------------------------------------------------------------------------ |
| `logger`      | none    | A function called once for every statement the library sends.            |
| `slowQueryMs` | `2000`  | A statement that takes at least this long is reported with `slow: true`. |

The logger receives one entry per statement:

| Field        | Meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| `sqlText`    | the SQL text of the statement                                        |
| `durationMs` | how long it took, in milliseconds                                    |
| `rowCount`   | the row count PostgreSQL reported. `null` when the statement failed. |
| `slow`       | `true` when `durationMs` reached `slowQueryMs`                       |
| `failed`     | `true` when the statement failed                                     |

For an insert, a select and a failed insert, the entries read:

```typescript
logEntries.map((entry) => [entry.sqlText.split('\n')[0], entry.rowCount, entry.failed]);
// [
//   ['INSERT INTO users ("name", "email", "lastChangedBy")', 1, false],
//   ['SELECT "id", "email" FROM users WHERE "email" = $1', 1, false],
//   ['INSERT INTO users ("name", "email", "lastChangedBy")', null, true],
// ]
```

Three guarantees:

- A logger never receives bound values. It gets the SQL text with its `$1` placeholders.
- A logger never receives the error of a failed statement. The error goes to the caller. Its detail can hold values.
- A logger that throws does not fail the query.

A transaction reports each of its statements, with `BEGIN` and `COMMIT` or `ROLLBACK`.

## `end()`

A process cannot exit while the pool holds open connections. Tests and scripts call `end()` when they are done.

```typescript
afterAll(async () => {
	await PostgresConnection.end();
});
```

After `end()`, `initialize` creates a new pool:

```typescript
await PostgresConnection.end();

PostgresConnection.initialize({connectionString: process.env.DATABASE_URL});
const result = await PostgresConnection.query('SELECT count(*)::int AS count FROM users WHERE email = $1', [
	'taken@unique.test',
]);
```

## Errors

Two kinds of error leave the library.

**`QueryInputError`**, since 0.5.0. The library throws it for every input it rejects before a query is built: an unknown key or operator in `where`, a bad `limit`, `offset` or `orderBy`, a bad `returnField`, a missing `allowedColumns`. It extends `Error`. Map it to HTTP 400 in one place.

```typescript
import {QueryInputError} from 'pg-lightquery';

try {
	usersTable.selectUsers(['id', 'name'], {where: {nmae: 'Ann'}});
} catch (error) {
	if (error instanceof QueryInputError) {
		// respond with 400 and error.message
	}
}
```

**Errors from PostgreSQL.** They pass through unchanged. The library never wraps them, so `error.code` is there. A unique violation has code `23505`.

```typescript
import {DatabaseError} from 'pg';

const failed = usersTable.insertUser(['name', 'email'], {data: {name: 'Logged again', email}}).execute();
// rejects with a DatabaseError whose code is '23505' when the email is taken
```

## Limits and failure modes

- `getInstance()`, `query()` and `transaction()` throw `PostgresConnection must be initialized with configuration before use` when `initialize` was never called, or after `end()`.
- A second `initialize` call returns the existing connection and ignores its `config` and its `options`. Call `end()` first to connect with a new configuration or a new logger.
- `end()` does nothing when the connection was never initialized.
- `end()` waits until every checked-out connection is back in the pool. Wait for running queries and transactions before calling it.
- The logger runs inside the query call. Keep it fast.
