# Connection

`PostgresConnection` owns the one connection pool the library uses. Initialize it once when the process starts. Every table class then runs its queries through that pool. Since 0.4.7 the pool can also be closed.

## Minimal example

```typescript
import {PostgresConnection} from 'pg-lightquery';

PostgresConnection.initialize({connectionString: process.env.DATABASE_URL});

// ... run queries through your table classes ...

await PostgresConnection.end();
```

## Methods

All of them are static.

| Method | What it does | Since |
|---|---|---|
| `initialize(config)` | Creates the pool. `config` is a [`pg` pool configuration](https://node-postgres.com/apis/pool). | |
| `getInstance()` | Returns the initialized connection. | |
| `query(text, params)` | Runs one statement on a pool connection and resolves to the pg result. | |
| `transaction(queries)` | Runs a list of query objects as one transaction. See [Transactions and chains](transactions-and-chains.md). | 0.4.7 |
| `transaction(text, params)` | Runs one statement inside `BEGIN` and `COMMIT`. | |
| `end()` | Closes the pool and clears the connection, so `initialize` can be called again. | 0.4.7 |

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

## Limits and failure modes

- `getInstance()`, `query()` and `transaction()` throw `PostgresConnection must be initialized with configuration before use` when `initialize` was never called, or after `end()`.
- A second `initialize` call returns the existing connection and ignores its `config`. Call `end()` first to connect with a new configuration.
- `end()` does nothing when the connection was never initialized.
- `end()` waits until every checked-out connection is back in the pool. Wait for running queries and transactions before calling it.
- Errors from PostgreSQL pass through unchanged, with their `code`.
