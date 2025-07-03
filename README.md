# pg-lightquery

A modern, type-safe PostgreSQL query builder for Node.js with TypeScript support.

## Why Choose pg-lightquery?

**🎯 Better Developer Experience**

- **Query Inspection**: See generated SQL and parameters before execution
- **Type Safety**: Full TypeScript support with auto-completion
- **Zero Learning Curve**: Intuitive API that mirrors your mental model

**🚀 Superior Architecture**

- **Deferred Execution**: Build queries separately, execute when ready
- **Composition Over Inheritance**: Clean, testable code structure
- **Security First**: Separate concerns for column validation and data projection

**⚡ Advanced Features**

- **Smart Operators**: Built-in support for `LIKE`, `IN`, date ranges, JSON queries
- **Complex Joins**: Filter by joined/aggregated columns with full type safety
- **Transaction Builder**: Fluent interface for multi-query transactions
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
}

const users = new UsersTable();
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
});
```

## Performance & Dependencies

- **Minimal footprint**: Only 4 dependencies (`pg`, `mocklogs`, `sql-ddl-to-json-schema`, `uuid`)
- **Parameterized queries**: Built-in SQL injection protection
- **Efficient execution**: Deferred execution prevents unnecessary queries
- **TypeScript optimized**: Full type inference and checking

## Compared to Other Libraries

| Feature              | pg-lightquery | Prisma     | TypeORM    | Raw SQL   |
| -------------------- | ------------- | ---------- | ---------- | --------- |
| **Type Safety**      | ✅ Full       | ✅ Full    | ⚠️ Partial | ❌ None   |
| **Query Inspection** | ✅ Built-in   | ❌ No      | ❌ No      | ✅ Manual |
| **Bundle Size**      | ✅ Small      | ❌ Large   | ❌ Large   | ✅ None   |
| **Complex Joins**    | ✅ Type-safe  | ⚠️ Limited | ⚠️ Limited | ✅ Manual |
| **Learning Curve**   | ✅ Minimal    | ❌ Steep   | ❌ Steep   | ✅ None   |
| **Flexibility**      | ✅ High       | ⚠️ Medium  | ⚠️ Medium  | ✅ Full   |

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

## Contributing

Contributions are welcome! Please check out our [GitHub repository](https://github.com/dr-aiuta/pgquery).

## License

ISC License
