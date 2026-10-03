# Transactions and chains

A transaction runs several queries as one unit. Either every query takes effect or none does. Since 0.4.7 the library runs a transaction on one database connection. Before 0.4.7 each statement could land on a different pool connection, so a transaction was not atomic under concurrent load.

A chained insert goes one step further. It runs several inserts and updates as one statement, and a later step can use a value an earlier step returned.

The examples use the `users`, `posts` and `addresses` tables from [`tests/tables`](../../tests/tables).

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

A chained insert, `createChainedInsert()...build().execute()`, runs through the same code. It is atomic in the same way. See [Chained inserts and updates](#chained-inserts-and-updates).

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

## Chained inserts and updates

A chain builds one `WITH` statement. Each step is an insert or an update with a name. A later step can read a field that an earlier step returned.

```typescript
import {createChainedInsert} from 'pg-lightquery';

const chain = createChainedInsert()
	.insert('new_user', usersTable, {name: 'Ann', email: 'ann@example.com'}, {allowedColumns: ['name', 'email'], returnField: '*'})
	.insertWithReference(
		'new_post',
		postsTable,
		{title: 'Hello', content: 'First post'},
		{from: 'new_user', field: 'id', to: 'userId'},
		{allowedColumns: ['title', 'content'], returnField: 'id'}
	)
	.insertWithReference(
		'new_address',
		addressesTable,
		{street: 'Main St', neighborhood: 'Centro', city: 'Rio'},
		{from: 'new_user', field: 'id', to: 'userId'},
		{allowedColumns: ['street', 'neighborhood', 'city'], returnField: 'id'}
	)
	.selectFrom('new_user')
	.build();

const results = await chain.execute();
const user = results[0].rows[0];
```

### Steps

| Method | Adds |
|---|---|
| `insert(name, table, data, options)` | an insert |
| `insertWithReference(name, table, data, reference, options)` | an insert that reads a field of an earlier step |
| `insertWithReferenceIf(condition, name, table, data, reference, options)` | the same, only when `condition` is true |
| `update(name, table, data, where, options)` | an update |
| `updateWithReference(name, table, data, where, reference, options)` | an update that reads a field of an earlier step |
| `updateIf(condition, ...)`, `updateWithReferenceIf(condition, ...)` | the same, only when `condition` is true |
| `selectFrom(name, columns)` | the final `SELECT`. `columns` is `'*'`, one column name, or an array of column names. |

Every step takes `allowedColumns` in its options. It is required, as it is for `insert` and `update`. A step also takes `returnField`, which defaults to `'*'`, and `idUser`. An insert step takes `onConflict`.

Since 0.5.1 the `table` of a step is a table class instance. The operations object that earlier versions needed still works.

Since 0.5.1 steps are written in the order they are called. Before, every insert came first and every update after them, whatever the call order. An insert can therefore read the result of an update that was called before it:

```typescript
const chain = createChainedInsert()
	.update('renamed', usersTable, {name: 'Dave Renamed'}, {id: dave.id}, {allowedColumns: ['name'], returnField: 'id'})
	.insertWithReference(
		'new_post',
		postsTable,
		{title: 'After the rename', content: 'x'},
		{from: 'renamed', field: 'id', to: 'userId'},
		{allowedColumns: ['title', 'content'], returnField: '*'}
	)
	.selectFrom('new_post', ['id', 'userId', 'title'])
	.build();
```

### References

A reference is `{from, field, to}`. `from` is the name of an earlier step. `field` is a field that step returns. `to` is the column of this step's table that receives the value.

- The referenced column is always written. It needs no entry in `allowedColumns`, and a value for it in `data` is ignored.
- `to` must be a column of the table definition.
- Since 0.5.1 a referenced insert keeps its `ON CONFLICT` clause, so the step can upsert. Before, the clause was dropped.
- Since 0.5.1 a referenced step may have empty `data`. The reference is then its only column.

```typescript
.insertWithReference(
	'upserted_post',
	postsTable,
	{id: existing.id, title: 'New title', content: 'new'},
	{from: 'new_owner', field: 'id', to: 'userId'},
	{allowedColumns: ['id', 'title', 'content'], onConflict: true, returnField: '*'}
)
```

### Registered tables

A table class can register other tables once and then name them in its chains. Since 0.5.1 these methods are on `TableBase`. `EnhancedTableBase` is the same class under its old name, and is deprecated.

```typescript
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
}
```

| Method of `TableBase` | What it does |
|---|---|
| `registerRelatedTable(name, {tableDefinition})` | registers a table under a name |
| `getRelatedTable(name)` | returns the operations object of a registered table |
| `createChainedInsert()` | returns a chain that knows the registered tables |

The name-based steps take a registered name where the other steps take a table: `insertIntoTable`, `insertIntoTableWithReference`, `insertIntoTableWithReferenceIf`, `updateTable`, `updateTableWithReference` and `updateTableIf`. They work on a chain that came from `createChainedInsert()` of a table class. On a chain from the standalone `createChainedInsert()` they throw, because that chain has no registered tables.

### What `build()` and `execute()` return

`build()` returns `{queries, execute}`. `queries` holds one query object, the whole `WITH` statement:

```typescript
const chain = users.createUserWithPost({name: 'Ann', email: 'ann@example.com'}, {title: 'T', content: 'C'});

console.log(chain.queries[0].sqlText);
// WITH new_user AS (
//   INSERT INTO users ("name", "email", "lastChangedBy")
// VALUES ($1, $2, $3)
// RETURNING *
// ),
// new_post AS (
//   INSERT INTO posts ("title", "content", "userId") VALUES ($4, $5, (SELECT "id" FROM new_user)) RETURNING "id"
// )
// SELECT * FROM new_user;
```

`execute()` resolves to an array of pg results, one per query. A chain has one query, so the rows of the final `SELECT` are in `results[0].rows`.

Without `selectFrom`, the final `SELECT` reads the first insert step, or the first step when the chain has no insert.

## Limits and failure modes

- A step name, the `from` and `field` of a reference, and a `selectFrom` column must be plain identifiers: letters, digits and underscores, not starting with a digit. Anything else throws `QueryInputError`. `selectFrom` takes no expression.
- All steps of a chain see the same snapshot of the database. A step reads another step's rows only through a reference or the final `SELECT`, not by querying the table again.
- A chain with no step throws when it is built.
- A failed step rolls back the whole chain.
- A failed query rolls back the whole transaction. No row of it stays.
- If `ROLLBACK` itself fails, the connection is broken. The library then removes that client from the pool, and still rethrows the first error.
- All queries of one transaction run one after the other. A later query cannot use a value an earlier one returned. For that, use a chained insert.
- A transaction holds one pool connection until it ends. A pool that is too small makes concurrent transactions wait.
