# pg-lightquery

A modern, type-safe PostgreSQL query builder for Node.js with TypeScript support.

## Why Choose pg-lightquery?

**🎯 Better Developer Experience**

- **Query Inspection**: See generated SQL and parameters before execution
- **Type Safety**: Full TypeScript support with auto-completion
- **Zero Learning Curve**: Intuitive API that mirrors your mental model
- **Chained Operations**: Fluent CTE-based multi-table inserts and updates
- **Related Tables Registry**: Simplified management of table relationships

**🚀 Superior Architecture**

- **Deferred Execution**: Build queries separately, execute when ready
- **Composition Over Inheritance**: Clean, testable code structure
- **Security First**: Separate concerns for column validation and data projection
- **Related Tables**: `TableBase` registers related tables for chained operations

**⚡ Advanced Features**

- **Smart Operators**: Built-in support for `LIKE`, `IN`, date ranges, JSON queries
- **Complex Joins**: Filter by joined/aggregated columns with full type safety
- **Transaction Builder**: Fluent interface for multi-query transactions
- **Chained Insert/Update Builder**: Type-safe CTE operations for complex multi-table operations
- **Optional Audit Fields**: Automatic `lastChangedBy` tracking with configurable defaults
- **Minimal Dependencies**: Only 2 dependencies, `pg` and `uuid`

## Installation

```bash
npm install pg-lightquery
```

## Documentation

Feature pages:

- [Filters, sorting and paging](docs/features/filters.md)
- [Writes: insert, upsert and update](docs/features/writes.md)
- [Transactions and chains](docs/features/transactions-and-chains.md)
- [Connection](docs/features/connection.md)
- [Schema: column types, drift check and migration drafts](docs/features/schema.md)

Upgrade guides:

| You are on | You want | Read |
| ---------- | -------- | ---------------------------------------------------- |
| 0.4.x      | 0.4.7    | [docs/upgrading/to-0.4.7.md](docs/upgrading/to-0.4.7.md) |
| 0.4.x      | 0.5.0    | [docs/upgrading/to-0.5.0.md](docs/upgrading/to-0.5.0.md) |
| 0.5.0      | 0.5.1    | [docs/upgrading/to-0.5.1.md](docs/upgrading/to-0.5.1.md) |
| 0.0.x      | 0.5.x    | [docs/upgrading/from-0.0.x.md](docs/upgrading/from-0.0.x.md) |

## Quick Start

### 1. Setup Connection

```typescript
import {PostgresConnection} from 'pg-lightquery';

PostgresConnection.initialize({
	host: 'localhost',
	port: 5432,
	user: 'your_user',
	password: 'your_password',
	database: 'your_database',
});
```

### 2. Define Your Schema

```typescript
import {ColumnDefinition, TableDefinition} from 'pg-lightquery';

export const usersColumns = {
	id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	name: {type: 'TEXT', notNull: true},
	email: {type: 'TEXT', unique: true},
	createdAt: {type: 'TIMESTAMP WITHOUT TIME ZONE', notNull: true, default: 'NOW()'},
	lastChangedBy: {type: 'TEXT', notNull: false}, // Optional audit field
} as const;

export type UsersSchema = {
	[K in keyof typeof usersColumns]: ColumnDefinition;
};

const usersTable: TableDefinition<UsersSchema> = {
	tableName: 'users',
	schema: {columns: usersColumns},
};
```

### 3. Create Your Table Class

```typescript
import {TableBase} from 'pg-lightquery';

// Basic table class
class UsersTable extends TableBase<UsersSchema> {
	constructor() {
		super(usersTable);
	}

	// Type-safe insert with query inspection
	insertUser(userData: {name: string; email: string}) {
		return this.insert({
			allowedColumns: ['name', 'email'],
			options: {
				data: userData,
				returnField: 'id',
			},
		});
	}

	// Flexible select with smart operators
	selectUsers(filters?: {name?: string; email?: string}) {
		return this.select({
			allowedColumns: '*',
			options: {
				where: filters,
				columnsToReturn: ['id', 'name', 'email', 'createdAt'],
			},
		});
	}

	// Safe update with required WHERE clause
	updateUser(data: {name?: string; email?: string}, where: {id?: number; email?: string}) {
		return this.update({
			allowedColumns: ['name', 'email'],
			options: {
				data,
				where,
				returnField: 'id',
			},
		});
	}
}

// A table class that registers related tables for chained operations
class UsersWithProfileTable extends TableBase<UsersSchema> {
	constructor() {
		super(usersTable);

		// Register related tables for chained operations
		this.registerRelatedTable('posts', {tableDefinition: postsTable});
		this.registerRelatedTable('addresses', {tableDefinition: addressesTable});
	}

	// Complex multi-table insert with CTE support
	createUserWithProfile(userData: {name: string; email: string}, includePost = false, includeAddress = false) {
		const postData = {title: 'Welcome Post', content: 'Welcome to our platform!'};
		const addressData = {street: '123 Default St', neighborhood: 'Center', city: 'Default City'};

		return this.createChainedInsert()
			.insert('new_user', this, userData, {allowedColumns: ['name', 'email'], returnField: '*'})
			.insertIntoTableWithReferenceIf(
				includePost,
				'user_post',
				'posts',
				postData,
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['title', 'content']}
			)
			.insertIntoTableWithReferenceIf(
				includeAddress,
				'user_address',
				'addresses',
				addressData,
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['street', 'neighborhood', 'city']}
			)
			.selectFrom('new_user')
			.build();
	}
}

const users = new UsersTable();
const usersWithProfile = new UsersWithProfileTable();
```

### 4. Use It

```typescript
// Query inspection before execution
const insertQuery = users.insertUser({name: 'John', email: 'john@example.com'});
console.log('SQL:', insertQuery.query.sqlText);
console.log('Values:', insertQuery.query.values);

// Execute when ready
const newUser = await insertQuery.execute();

// Or execute immediately
const allUsers = await users.selectUsers().execute();

// Update with WHERE clause (required for safety)
const updateQuery = users.updateUser({name: 'John Updated'}, {id: 1});
const updatedUser = await updateQuery.execute();

// Complex multi-table operations
const userWithProfile = await usersWithProfile
	.createUserWithProfile(
		{name: 'John', email: 'john@example.com'},
		true, // include post
		true // include address
	)
	.execute();
```

## Core Features

### 🔍 Query Inspection

Every query returns a `QueryResult` object with `.query` and `.execute()` methods:

```typescript
const query = users.selectUsers({name: 'John'});

// Inspect before execution
console.log(query.query.sqlText); // "SELECT ... FROM users WHERE name = $1"
console.log(query.query.values); // ["John"]

// Execute when ready
const results = await query.execute();
```

### 🔗 Chained Insert & Update Builder

A chain runs several inserts and updates as one statement. A later step can use a value an earlier step returned. Steps run in the order they are called, and each step names its columns.

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
	.selectFrom('new_user')
	.build();

console.log(chain.queries[0].sqlText); // one WITH statement
const results = await chain.execute();
const user = results[0].rows[0];
```

A step takes a table class instance. A table class can also register related tables and name them in its chains, with `registerRelatedTable` and `createChainedInsert` of `TableBase`. Updates, conditional steps, upserts and registered tables are described in [Transactions and chains](docs/features/transactions-and-chains.md#chained-inserts-and-updates).

### 🎨 Smart Query Operators

A `where` key is a column name, or a column name with one operator: `.like`, `.in`, `.not`, `.null`, `.startDate`, `.endDate` and `.orderBy`. `limit` and `offset` page the result.

```typescript
await users.selectUsers({'name.like': 'John%', 'id.in': [1, 2, 3], 'id.orderBy': 'DESC', limit: 10}).execute();
```

An unknown key or operator throws. The operator table, sorting and paging are described in [Filters, sorting and paging](docs/features/filters.md).

### 🔐 Security & Projection Control

`allowedColumns` decides which columns a caller may filter on or write. It has no default: every call names its columns, or writes `'*'` out. `columnsToReturn` decides which columns come back.

```typescript
// inside a table class
this.select({
	allowedColumns: ['id', 'name'], // can only filter by these
	options: {
		where: {name: 'John'},
		columnsToReturn: ['id', 'name', 'email'], // but can return these
	},
});
```

Routes that pass request input are covered in [Filters: passing request input safely](docs/features/filters.md#passing-request-input-safely).

### 🔄 Transaction Builder

Fluent interface for complex transactions:

```typescript
const user1 = users.insertUser({name: 'Alice', email: 'alice@example.com'});
const user2 = users.insertUser({name: 'Bob', email: 'bob@example.com'});

const transaction = users.transaction().add(user1.query).add(user2.query);

// Inspect the entire transaction
console.log('Queries:', transaction.queries.length);

// Execute all or none
const results = await transaction.execute();
```

### ✏️ Safe Update Operations

An update needs a `where` object. An empty one throws, unless `allowUpdateAll: true` is set. `allowedColumns` names the columns that may be written, and keys of `data` outside it are dropped. A `null` value writes `NULL`. `undefined` is skipped.

```typescript
const updateQuery = users.updateUser({name: 'John Updated', email: 'john.new@example.com'}, {id: 1});

console.log(updateQuery.query.sqlText);
// UPDATE users
// SET "name" = $1, "email" = $2, "lastChangedBy" = $3
// WHERE "id" = $4
// RETURNING "id";
```

Upserts, `returnField` and the `null` rule are described in [Writes: insert, upsert and update](docs/features/writes.md).

### ↩️ Returning Columns

`returnField` decides what an insert or an update returns: one column, a list of columns, or `'*'` for the whole row. Leave it out, or pass an empty list, and nothing is returned.

```typescript
// inside a table class
this.insert({allowedColumns: ['name', 'email'], options: {data, returnField: 'id'}});
// RETURNING "id"

this.insert({allowedColumns: ['name', 'email'], options: {data, returnField: ['id', 'name', 'email']}});
// RETURNING "id", "name", "email"

this.update({allowedColumns: ['name'], options: {data, where: {id: 1}, returnField: '*'}});
// RETURNING *
```

A name must be a column of the table definition. Each step of a chained insert takes its own `returnField`, so a step returns only what a later step or the caller needs. See [Writes: returnField](docs/features/writes.md#returnfield).

### 📊 Optional Audit Fields

A table whose definition has a column named `lastChangedBy` gets it written on every insert and every update. The value is the `idUser` option, and `'SERVER'` when `idUser` is left out. A table without that column is not affected.

```typescript
// inside a table class
this.update({
	allowedColumns: ['name'],
	options: {data: {name: 'Updated'}, where: {id: 1}, idUser: 'user-456'},
});
// UPDATE users
// SET "name" = $1, "lastChangedBy" = $2
// WHERE "id" = $3;
// values: ['Updated', 'user-456', 1]
```

The details are in [Writes: the lastChangedBy convention](docs/features/writes.md#the-lastchangedby-convention).

### 🎯 Complex Joins with Type Safety

Filter by joined/aggregated columns that don't exist in your base table:

```typescript
// Define custom schema for joined results
interface UserWithPosts {
	id: number;
	name: string;
	email: string;
	posts: Post[];
}

const userWithPostsSchema = {
	id: {type: 'INTEGER'},
	name: {type: 'TEXT'},
	email: {type: 'TEXT'},
	posts: {type: 'JSONB'},
} as const;

class UsersTable extends TableBase<UsersSchema> {
	selectUsersWithPosts(filters?: any) {
		const sql = `
			SELECT u.id, u.name, u.email, 
				   json_agg(p.*) as posts
			FROM users u
			LEFT JOIN posts p ON u.id = p.user_id
			GROUP BY u.id, u.name, u.email
		`;

		return this.selectWithCustomSchema<UserWithPosts, typeof userWithPostsSchema>({
			allowedColumns: ['id', 'name', 'posts'],
			predefinedSQL: {sqlText: sql},
			options: {where: filters},
		});
	}
}

// The predefined SQL is wrapped as a subquery, so a filter names a column of its result.
// Now you can filter by joined columns!
const activeUsers = await users
	.selectUsersWithPosts({
		'posts.null': false, // Filter by posts (doesn't exist in users table)
		'name.like': 'John%', // Combined with regular columns
	})
	.execute();
```

## Migrations & Schema Drift

pg-lightquery does not run migrations. Pair it with a dedicated migration tool, such as [node-pg-migrate](https://github.com/salsita/node-pg-migrate). Your table definitions still drive the work. `generateMigration` compares them with a database and drafts the migration. `checkSchemaDrift` fails fast when a database and the definitions disagree. Both are imported from `pg-lightquery/schema`. The column types, default expressions with `sqlExpression`, foreign keys, both tools and their limits are described in [Schema: column types, drift check and migration drafts](docs/features/schema.md).

## Testing Made Easy

```typescript
describe('User Operations', () => {
	it('generates correct SQL', () => {
		const query = users.selectUsers({name: 'John'});

		expect(query.query.sqlText).toContain('SELECT');
		expect(query.query.sqlText).toContain('WHERE "name" = $1');
		expect(query.query.values).toEqual(['John']);
	});

	it('executes and returns data', async () => {
		const result = await users.selectUsers({id: 1}).execute();
		expect(result).toHaveLength(1);
	});

	it('handles chained inserts correctly', async () => {
		const chainedInsert = createChainedInsert()
			.insert('new_user', usersTable, userData, {allowedColumns: ['name', 'email'], returnField: '*'})
			.insertWithReference(
				'user_post',
				postsTable,
				postData,
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['title', 'content']}
			)
			.selectFrom('new_user')
			.build();

		expect(chainedInsert.queries[0].sqlText).toContain('WITH new_user AS');
		expect(chainedInsert.queries[0].sqlText).toContain('INSERT INTO users');
		expect(chainedInsert.queries[0].sqlText).toContain('INSERT INTO posts');
	});
});
```

## Performance & Dependencies

- **Minimal footprint**: Only 2 dependencies (`pg`, `uuid`)
- **Parameterized queries**: Built-in SQL injection protection
- **Efficient execution**: Deferred execution prevents unnecessary queries
- **TypeScript optimized**: Full type inference and checking
- **CTE optimization**: Efficient multi-table operations with proper parameter handling

## Compared to Other Libraries

| Feature              | pg-lightquery     | Prisma     | TypeORM    | Raw SQL   |
| -------------------- | ----------------- | ---------- | ---------- | --------- |
| **Type Safety**      | ✅ Full           | ✅ Full    | ⚠️ Partial | ❌ None   |
| **Query Inspection** | ✅ Built-in       | ❌ No      | ❌ No      | ✅ Manual |
| **Chained Inserts**  | ✅ Type-safe      | ❌ No      | ❌ No      | ⚠️ Manual |
| **Bundle Size**      | ✅ Small          | ❌ Large   | ❌ Large   | ✅ None   |
| **Complex Joins**    | ✅ Type-safe      | ⚠️ Limited | ⚠️ Limited | ✅ Manual |
| **Update Safety**    | ✅ Required WHERE | ⚠️ Manual  | ⚠️ Manual  | ⚠️ Manual |
| **Audit Fields**     | ✅ Automatic      | ❌ Manual  | ❌ Manual  | ⚠️ Manual |
| **Learning Curve**   | ✅ Minimal        | ❌ Steep   | ❌ Steep   | ✅ None   |
| **Flexibility**      | ✅ High           | ⚠️ Medium  | ⚠️ Medium  | ✅ Full   |

## API Reference

### Core Types

```typescript
// All methods return QueryResult<T>
interface QueryResult<T> {
	query: QueryObject; // Inspect SQL and parameters
	execute(): Promise<T>; // Execute when ready
}

interface QueryObject {
	sqlText: string; // Generated SQL
	values: any[]; // Parameterized values
}
```

### Chained Insert & Update Builder

```typescript
// Create a new chained insert builder
const builder = createChainedInsert();

// INSERT operations
builder.insert(cteName, table, data, options);
builder.insertWithReference(cteName, table, data, reference, options);
builder.insertWithReferenceIf(condition, cteName, table, data, reference, options);

// UPDATE operations
builder.update(cteName, table, data, where, options);
builder.updateWithReference(cteName, table, data, where, reference, options);
builder.updateIf(condition, cteName, table, data, where, options);
builder.updateWithReferenceIf(condition, cteName, table, data, where, reference, options);

// Set final SELECT. columns is '*', one column name, or an array of column names.
builder.selectFrom(cteName, columns);

// Build and execute
const result = builder.build();
const data = await result.execute();
```

### Related Tables

```typescript
class MyTable extends TableBase<MySchema> {
	constructor() {
		super(tableDefinition);

		// Register related tables
		this.registerRelatedTable('related_table', {tableDefinition: relatedTableDef});
	}

	// Use chained inserts with registered tables
	complexInsertOperation() {
		return this.createChainedInsert()
			.insert('main', this, data, {allowedColumns: ['name']})
			.insertIntoTableWithReference('related', 'related_table', relatedData, reference, {allowedColumns: ['note']})
			.selectFrom('main')
			.build();
	}

	// Use chained updates with registered tables
	complexUpdateOperation() {
		return this.createChainedInsert()
			.update('main_update', this, data, where, {allowedColumns: ['name']})
			.updateTableWithReference('related_update', 'related_table', relatedData, where, reference, {allowedColumns: ['note']})
			.updateTableIf(condition, 'conditional_update', 'related_table', data, where, {allowedColumns: ['note']})
			.selectFrom('main_update')
			.build();
	}
}
```

`EnhancedTableBase` is the old name of `TableBase`. It keeps working and is deprecated.

### Query Operators

```typescript
// Available keys for WHERE conditions
type QueryOperators = {
	'field.like': string; // LIKE pattern matching
	'field.in': any[] | string; // = ANY(array). A comma-separated string is split.
	'field.not': any; // NOT EQUAL
	'field.startDate': string; // Date >= value
	'field.endDate': string; // Date <= value
	'field.orderBy': 'ASC' | 'DESC'; // ORDER BY
	'field.null': boolean; // true: IS NULL, false: IS NOT NULL
	limit: number; // LIMIT
	offset: number; // OFFSET
	// A JSON column takes an object. Each key becomes "jsonField" ->> 'key' = value.
	jsonField: {[key: string]: any};
};
```

Any other operator throws `QueryInputError`. See [Filters, sorting and paging](docs/features/filters.md).

### Audit Field Configuration

```typescript
// Optional lastChangedBy field in schema
const schema = {
	// ... other fields
	lastChangedBy: {
		type: 'TEXT',
		notNull: false, // Optional field
	},
};

// Written with the default value 'SERVER'
this.insert({allowedColumns: ['name'], options: {data}});

// Written with a custom value
this.insert({allowedColumns: ['name'], options: {data, idUser: 'custom-user-id'}});
```

## Contributing

Contributions are welcome! Please check out our [GitHub repository](https://github.com/dr-aiuta/pgquery).

## License

ISC License
