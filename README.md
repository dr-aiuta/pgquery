# pg-lightquery

A modern, type-safe PostgreSQL query builder for Node.js with TypeScript support.

## Why Choose pg-lightquery?

**🎯 Better Developer Experience**

- **Query Inspection**: See generated SQL and parameters before execution
- **Type Safety**: Full TypeScript support with auto-completion
- **Zero Learning Curve**: Intuitive API that mirrors your mental model
- **Chained Inserts**: Fluent CTE-based multi-table operations
- **Related Tables Registry**: Simplified management of table relationships

**🚀 Superior Architecture**

- **Deferred Execution**: Build queries separately, execute when ready
- **Composition Over Inheritance**: Clean, testable code structure
- **Security First**: Separate concerns for column validation and data projection
- **Enhanced TableBase**: Built-in support for complex table relationships

**⚡ Advanced Features**

- **Smart Operators**: Built-in support for `LIKE`, `IN`, date ranges, JSON queries
- **Complex Joins**: Filter by joined/aggregated columns with full type safety
- **Transaction Builder**: Fluent interface for multi-query transactions
- **Chained Insert Builder**: Type-safe CTE operations for complex multi-table inserts
- **Optional Audit Fields**: Automatic `lastChangedBy` tracking with configurable defaults
- **Minimal Dependencies**: Only 4 core dependencies

## Installation

```bash
npm install pg-lightquery
```

## Quick Start

### 1. Setup Connection

```typescript
import PostgresConnection from 'pg-lightquery';

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
import {TableBase, EnhancedTableBase} from 'pg-lightquery';

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

// Enhanced table class with related tables support
class EnhancedUsersTable extends EnhancedTableBase<UsersSchema> {
	constructor() {
		super(usersTable);

		// Register related tables for chained operations
		this.registerRelatedTable('posts', {tableDefinition: postsTable});
		this.registerRelatedTable('addresses', {tableDefinition: addressesTable});
	}

	// Complex multi-table insert with CTE support
	createUserWithProfile(userData: {name: string; email: string}, includePost = false, includeAddress = false) {
		const postData = {title: 'Welcome Post', content: 'Welcome to our platform!'};
		const addressData = {street: '123 Default St', city: 'Default City'};

		return this.createChainedInsert()
			.insert('new_user', this.db, userData, {returnField: '*'})
			.insertWithReferenceIf(includePost, 'user_post', this.getRelatedTable('posts'), postData, {
				from: 'new_user',
				field: 'id',
				to: 'userId',
			})
			.insertWithReferenceIf(includeAddress, 'user_address', this.getRelatedTable('addresses'), addressData, {
				from: 'new_user',
				field: 'id',
				to: 'userId',
			})
			.selectFrom('new_user')
			.build();
	}
}

const users = new UsersTable();
const enhancedUsers = new EnhancedUsersTable();
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
const userWithProfile = await enhancedUsers
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

### 🔗 Chained Insert Builder

Build complex multi-table operations with automatic CTE handling:

```typescript
import {createChainedInsert} from 'pg-lightquery';

// Simple chained insert
const result = createChainedInsert()
	.insert('new_user', usersDb, userData, {returnField: '*'})
	.insertWithReference('user_post', postsDb, postData, {
		from: 'new_user',
		field: 'id',
		to: 'userId',
	})
	.selectFrom('new_user')
	.build();

// Conditional inserts
const result = createChainedInsert()
	.insert('new_user', usersDb, userData, {returnField: '*'})
	.insertWithReferenceIf(hasAddress, 'user_address', addressesDb, addressData, {
		from: 'new_user',
		field: 'id',
		to: 'userId',
	})
	.selectFrom('new_user')
	.build();

// Execute the chained operation
const newUser = await result.execute();
```

### 🏗️ Enhanced TableBase

Simplify complex table relationships with built-in registry:

```typescript
class PlacesTable extends EnhancedTableBase<PlacesSchema> {
	constructor() {
		super(placesTable);

		// Register related tables
		this.registerRelatedTable('places_contacts', {tableDefinition: placesContactsTable});
		this.registerRelatedTable('places_contacts_billing', {tableDefinition: placesContactsBillingTable});
	}

	insertPlaceWithRelations(data: PlacesData, idContact: number, isBilling = false) {
		return this.createChainedInsert()
			.insert('place', this.db, data)
			.insertWithReference(
				'place_contact',
				'places_contacts',
				{idContact},
				{
					from: 'place',
					field: 'idPlace',
					to: 'idPlace',
				}
			)
			.insertWithReferenceIf(
				isBilling,
				'billing',
				'places_contacts_billing',
				{},
				{
					from: 'place_contact',
					field: 'idPlaceContact',
					to: 'idPlaceContact',
				}
			)
			.selectFrom('place')
			.build();
	}
}
```

### 🎨 Smart Query Operators

Built-in support for common SQL patterns:

```typescript
// Pattern matching
await users.selectUsers({'name.like': 'John%'}).execute();

// Multiple values
await users.selectUsers({'id.in': [1, 2, 3]}).execute();

// Date ranges
await users
	.selectUsers({
		'createdAt.startDate': '2023-01-01',
		'createdAt.endDate': '2023-12-31',
	})
	.execute();

// JSON fields
await users.selectUsers({'settings.theme': 'dark'}).execute();

// NOT conditions
await users.selectUsers({'email.not': null}).execute();
```

### 🔐 Security & Projection Control

Separate concerns for security (what can be filtered) and projection (what gets returned):

```typescript
// Public API: Limited filtering, safe data return
const publicUsers = users.select({
	allowedColumns: ['id', 'name'], // Can only filter by these
	options: {
		where: {name: 'John'},
		columnsToReturn: ['id', 'name', 'email'], // But can return these
	},
});

// Admin API: Full access
const adminUsers = users.select({
	allowedColumns: '*', // Can filter by anything
	options: {
		columnsToReturn: '*', // Can return everything
	},
});
```

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

Built-in safety features to prevent accidental mass updates:

```typescript
// Basic update with required WHERE clause
const updateQuery = users.updateUser({name: 'John Updated', email: 'john.new@example.com'}, {id: 1});

// Inspect before execution
console.log(updateQuery.query.sqlText);
// OUTPUT: UPDATE users SET "name" = $1, "email" = $2, "lastChangedBy" = $3 WHERE "id" = $4

// Execute when ready
const updatedUser = await updateQuery.execute();
```

#### 🛡️ Safety Features

**Required WHERE clause** - Prevents accidental mass updates:

```typescript
// ❌ This will throw an error
users.updateUser({name: 'New Name'}, {}); // Empty WHERE clause
// Error: WHERE clause is required for UPDATE operations

// ✅ Explicit mass update (use with caution)
users.updateUser({lastLoginAt: new Date()}, {}, {allowUpdateAll: true});
```

#### 🎯 Advanced Update Options

```typescript
// Update with smart operators in WHERE clause
await users.updateUser({status: 'inactive'}, {'email.like': '%@oldcompany.com'}).execute();

// Update with RETURNING clause
const updatedUser = await users.updateUser({name: 'Updated Name'}, {id: 1}, {returnField: 'id'}).execute();

// Track who made the change
await users.updateUser({name: 'Admin Updated'}, {id: 1}, {idUser: 'admin-123'}).execute();
```

#### 🔍 Update Query Inspection

```typescript
const updateQuery = users.updateUser({name: 'John', email: 'john@new.com'}, {id: 1});

// Full query inspection
console.log('SQL:', updateQuery.query.sqlText);
console.log('Parameters:', updateQuery.query.values);
console.log('Parameter count:', updateQuery.query.values.length);

// Generated SQL:
// UPDATE users
// SET "name" = $1, "email" = $2, "lastChangedBy" = $3
// WHERE "id" = $4
//
// Parameters: ['John', 'john@new.com', 'SERVER', 1]
```

### 📊 Optional Audit Fields

Automatic `lastChangedBy` tracking with configurable defaults:

```typescript
// Automatic audit field addition (when present in schema)
const insertQuery = users.insertUser({name: 'John', email: 'john@example.com'});
// Automatically includes lastChangedBy: 'SERVER' if field exists in schema

// Custom audit tracking
const insertQuery = users.insertUser({name: 'John', email: 'john@example.com'}, {idUser: 'admin-123'});
// Uses custom idUser value for lastChangedBy

// Update with audit tracking
const updateQuery = users.updateUser({name: 'Updated'}, {id: 1}, {idUser: 'user-456'});
// Tracks who made the change
```

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
			WHERE 1=1
		`;

		return this.selectWithCustomSchema<UserWithPosts, typeof userWithPostsSchema>({
			allowedColumns: ['id', 'name', 'posts'],
			predefinedSQL: {sqlText: sql},
			options: {where: filters},
		});
	}
}

// Now you can filter by joined columns!
const activeUsers = await users
	.selectUsersWithPosts({
		'posts.not': null, // Filter by posts (doesn't exist in users table)
		'name.like': 'John%', // Combined with regular columns
	})
	.execute();
```

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
			.insert('new_user', usersDb, userData, {returnField: '*'})
			.insertWithReference('user_post', postsDb, postData, {
				from: 'new_user',
				field: 'id',
				to: 'userId',
			})
			.selectFrom('new_user')
			.build();

		expect(chainedInsert.queries[0].sqlText).toContain('WITH new_user AS');
		expect(chainedInsert.queries[0].sqlText).toContain('INSERT INTO users');
		expect(chainedInsert.queries[0].sqlText).toContain('INSERT INTO posts');
	});
});
```

## Performance & Dependencies

- **Minimal footprint**: Only 4 dependencies (`pg`, `mocklogs`, `sql-ddl-to-json-schema`, `uuid`)
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

### Chained Insert Builder

```typescript
// Create a new chained insert builder
const builder = createChainedInsert();

// Add base insert
builder.insert(cteName, table, data, options);

// Add insert with reference to previous CTE
builder.insertWithReference(cteName, table, data, reference, options);

// Add conditional insert
builder.insertWithReferenceIf(condition, cteName, table, data, reference, options);

// Set final SELECT
builder.selectFrom(cteName, columns);

// Build and execute
const result = builder.build();
const data = await result.execute();
```

### Enhanced TableBase

```typescript
class MyTable extends EnhancedTableBase<MySchema> {
	constructor() {
		super(tableDefinition);

		// Register related tables
		this.registerRelatedTable('related_table', {tableDefinition: relatedTableDef});
	}

	// Use chained inserts with registered tables
	complexOperation() {
		return this.createChainedInsert()
			.insertIntoTable('main', 'main_table', data)
			.insertIntoTableWithReference('related', 'related_table', relatedData, reference)
			.selectFrom('main')
			.build();
	}
}
```

### Query Operators

```typescript
// Available operators for WHERE conditions
type QueryOperators = {
	'field.like': string; // LIKE pattern matching
	'field.in': any[]; // IN clause
	'field.not': any; // NOT EQUAL
	'field.startDate': string; // Date >= value
	'field.endDate': string; // Date <= value
	'field.orderBy': 'ASC' | 'DESC'; // ORDER BY
	'field.null': boolean; // IS NULL / IS NOT NULL
	// JSON field access
	'jsonField.property': any; // JSON -> 'property' = value
};
```

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

// Automatic addition with default value
const insertQuery = table.insert(data); // Uses 'SERVER' as default

// Custom audit tracking
const insertQuery = table.insert(data, {idUser: 'custom-user-id'});
```

## Contributing

Contributions are welcome! Please check out our [GitHub repository](https://github.com/dr-aiuta/pgquery).

## License

ISC License
