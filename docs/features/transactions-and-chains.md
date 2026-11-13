# Transactions and chains

A transaction runs several queries as one unit. Either every query takes effect or none does. Since 0.4.7 the library runs a transaction on one database connection. Before 0.4.7 each statement could land on a different pool connection, so a transaction was not atomic under concurrent load.

The examples use the `users` and `posts` tables from [`tests/tables`](../../tests/tables).

## What atomic means here

- One connection. The library checks out one pool client and uses it for the whole transaction.
- One `BEGIN` in front of the first query.
- One `COMMIT` after the last query, or one `ROLLBACK` when a query fails.
- The client goes back to the pool once, whatever happens.

## `transaction().add(query).execute()`

Every query method returns an object with a `.query` property. Add those query objects to a transaction and execute it.

`transaction()` is a protected method of `TableBase`. Call it inside your table class, or expose it as the `UsersTable` fixture does.

```typescript
const alice = usersTable.insertUser(['name', 'email'], {
	data: {name: 'Alice', email: 'alice@example.com'},
	returnField: 'id',
});
const bob = usersTable.insertUser(['name', 'email'], {
	data: {name: 'Bob', email: 'bob@example.com'},
	returnField: 'id',
});

const results = await usersTable.transaction().add(alice.query).add(bob.query).execute();

console.log(results.length); // 2
console.log(results[0].rows[0].id); // the id of Alice
```

`execute()` resolves to one pg result per query, in the order the queries were added.

A chained insert, `createChainedInsert()...build().execute()`, runs through the same code. It is atomic in the same way.

## `PostgresConnection.transaction(queries)`

Since 0.4.7. Use it when the query objects come from several tables, or when no table class is at hand.

```typescript
import {PostgresConnection} from 'pg-lightquery';

const rename = usersTable.updateUser(['name'], {
	data: {name: 'Published Author'},
	where: {id: author.id},
});
const post = postsTable.insertPost(['userId', 'title', 'content'], {
	data: {userId: author.id, title: 'First', content: 'Hello'},
	returnField: 'id',
});

const results = await PostgresConnection.transaction([rename.query, post.query]);

console.log(results[0].rowCount); // 1
console.log(results[1].rows[0].id); // the id of the new post
```

The single-statement form from earlier versions still works:

```typescript
const inserted = await PostgresConnection.transaction(
	'INSERT INTO users ("name", "email") VALUES ($1, $2) RETURNING "email"',
	['Single', 'single@statement.test']
);
```

## Forms

| Call | Runs | Resolves to | Since |
|---|---|---|---|
| `table.transaction().add(query).execute()` | every added query, in order | an array of pg results | atomic since 0.4.7 |
| `PostgresConnection.transaction(queries)` | every query object in the array, in order | an array of pg results | 0.4.7 |
| `PostgresConnection.transaction(text, params)` | one statement | one pg result | |

A query object has the shape `{sqlText: string, values: any[]}`.

## Errors

When a query fails, the library rolls the transaction back and rethrows the error it got from PostgreSQL. It does not wrap it. The error keeps its `code`, so a caller can tell a unique violation from other failures.

```typescript
import {DatabaseError} from 'pg';

try {
	await PostgresConnection.transaction([
		usersTable.insertUser(['name', 'email'], {data: {name: 'Rolled back', email: 'rolled-back@list.test'}}).query,
		usersTable.insertUser(['name', 'email'], {data: {name: 'Taken again', email: 'taken@unique.test'}}).query,
	]);
} catch (error) {
	if (error instanceof DatabaseError && error.code === '23505') {
		// The second email is taken. Neither user was inserted.
	}
}
```

Before 0.4.7 the single-statement form threw a new plain `Error` with the same message, and the `code` was lost.

## Limits and failure modes

- A failed query rolls back the whole transaction. No row of it stays.
- If `ROLLBACK` itself fails, the connection is broken. The library then removes that client from the pool, and still rethrows the first error.
- All queries of one transaction run one after the other. A later query cannot use a value an earlier one returned. For that, use a chained insert.
- A transaction holds one pool connection until it ends. A pool that is too small makes concurrent transactions wait.
