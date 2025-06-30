# pg-lightquery

A lightweight, type-safe PostgreSQL query builder for Node.js with TypeScript support.

## Features

- 🔒 **Type-safe query building** with full TypeScript support
- 🎯 **Object-oriented approach** with class-based table definitions using composition
- 🚀 **Standardized query interface** with consistent return patterns and deferred execution
- 📦 **Minimal dependencies** (pg, mocklogs, sql-ddl-to-json-schema, uuid)
- 🛠 **Built-in transaction support** with automatic rollback and builder pattern
- 🔍 **Advanced query filtering** with special operators
- 📊 **Support for complex views and joins** via predefined SQL
- 🎨 **Predefined query templates** with CTE and aggregation support
- 🔄 **JSON field operations** with nested property queries
- 🆕 **Custom schema queries** for filtering by joined/aggregated columns
- 📝 **Comprehensive logging** and error handling
- 🧪 **Enhanced testability** with query inspection capabilities
- ⚡ **Protected database operations** ensuring clean public APIs

## Installation

```bash
npm install pg-lightquery
```

## Architecture Overview

### New Standardized Interface Pattern

All table methods now follow a consistent pattern:

- **Consistent return type**: All methods return `QueryResult<T>` with `{query: QueryObject, execute: () => Promise<T>}` structure
- **Query inspection**: Access generated SQL and parameters before execution via `.query` property
- **Deferred execution**: Build queries separately from execution for better testing and debugging
- **Transaction builder**: Fluent interface for building complex transactions
- **Protected composition**: Database operations are protected, ensuring clean public APIs

```typescript
// All methods follow this pattern:
interface QueryResult<T> {
	query: QueryObject; // Access SQL and parameters
	execute(): Promise<T>; // Execute when ready
}

interface QueryObject {
	sqlText: string; // Generated SQL
	values: any[]; // Parameterized values
}
```

## Quick Start

### 1. Database Connection

Initialize your PostgreSQL connection using the singleton pattern:

```typescript
import PostgresConnection from 'pg-lightquery';

const dbConfig = {
	host: 'localhost',
	port: 5432,
	user: 'your_user',
	password: 'your_password',
	database: 'your_database',
};

PostgresConnection.initialize(dbConfig);
```

### 2. Define Your Table Schema

```typescript
import {ColumnDefinition, TableDefinition} from 'pg-lightquery';

// Define column names as a union type
export type UsersColumnName = 'id' | 'name' | 'email' | 'createdAt' | 'updatedAt';

// Define the schema type
export type UsersSchema = {
	[K in UsersColumnName]: ColumnDefinition;
};

// Define the actual columns with their properties
export const usersColumns = {
	id: {
		type: 'INTEGER',
		primaryKey: true,
		autoIncrement: true,
	},
	name: {
		type: 'TEXT',
		notNull: true,
	},
	email: {
		type: 'TEXT',
		unique: true,
	},
	createdAt: {
		type: 'TIMESTAMP WITHOUT TIME ZONE',
		notNull: true,
		default: 'NOW()',
	},
	updatedAt: {
		type: 'TIMESTAMP WITHOUT TIME ZONE',
		notNull: true,
		default: 'NOW()',
	},
} as const;

// Create the table definition
const usersTable: TableDefinition<UsersSchema> = {
	tableName: 'users',
	schema: {
		columns: usersColumns,
	},
};
```

### 3. Create Your Table Class (New Pattern)

```typescript
import {TableBase} from 'pg-lightquery';
import {QueryResult} from 'pg-lightquery';

class UsersTable extends TableBase<UsersSchema> {
	constructor() {
		super(usersTable);
	}

	// Insert a new user - returns QueryResult for inspection/execution
	public insertUser(
		allowedColumns: (keyof UsersSchema)[] | '*',
		options: {
			data: Partial<UsersData>;
			returnField?: keyof UsersSchema;
			onConflict?: boolean;
			idUser?: string;
		}
	): QueryResult<Partial<UsersData>[]> {
		return this.insert({
			allowedColumns,
			options: {
				data: options.data,
				returnField: options.returnField,
				onConflict: options.onConflict || false,
				idUser: options.idUser || 'SERVER',
			},
		});
	}

	// Select users with parameters - returns QueryResult
	public selectUsers(
		allowedColumns: (keyof UsersSchema)[] | '*',
		options?: {
			where?: QueryParams<UsersSchema>;
			alias?: string;
		}
	): QueryResult<Partial<UsersData>[]> {
		return this.select<UsersData>({
			allowedColumns,
			options: {
				where: options?.where,
				alias: options?.alias,
			},
		});
	}

	// Select user by ID - returns QueryResult
	public selectUserById(id: number): QueryResult<Partial<UsersData>[]> {
		return this.select<UsersData>({
			allowedColumns: '*',
			options: {
				where: {id},
			},
		});
	}

	// Public transaction access
	public transaction() {
		return super.transaction();
	}
}
```

## New Usage Patterns

### Query Inspection and Execution

```typescript
const usersTable = new UsersTable();

// Build query without execution
const insertResult = usersTable.insertUser(['name', 'email'], {
	data: {name: 'John', email: 'john@example.com'},
	returnField: 'id',
});

// Inspect the generated query
console.log('SQL:', insertResult.query.sqlText);
console.log('Values:', insertResult.query.values);
// Output:
// SQL: INSERT INTO users ("name", "email") VALUES ($1, $2) RETURNING "id"
// Values: ['John', 'john@example.com']

// Execute when ready
const result = await insertResult.execute();

// Or execute immediately using method chaining
const users = await usersTable
	.selectUsers(['id', 'name'], {
		where: {'name.like': 'John%'},
	})
	.execute();
```

### Transaction Builder Pattern

```typescript
// Build multiple queries
const insert1 = usersTable.insertUser(['name', 'email'], {
	data: {name: 'User 1', email: 'user1@example.com'},
	returnField: 'id',
});

const insert2 = usersTable.insertUser(['name', 'email'], {
	data: {name: 'User 2', email: 'user2@example.com'},
	returnField: 'id',
});

// Build transaction using fluent interface
const transaction = usersTable.transaction().add(insert1.query).add(insert2.query);

// Inspect transaction
console.log('Transaction queries:', transaction.queries.length);
transaction.queries.forEach((query, index) => {
	console.log(`Query ${index + 1}:`, query.sqlText);
});

// Execute transaction
const results = await transaction.execute();
```

## Advanced Query Features

### Special Query Operators

The library supports various special operators for advanced filtering:

#### Date Range Queries

```typescript
// Query users created within a date range
const recentUsersResult = usersTable.selectUsers(['id', 'name', 'createdAt'], {
	where: {
		'createdAt.startDate': '2023-01-01',
		'createdAt.endDate': '2023-12-31',
	},
});

const recentUsers = await recentUsersResult.execute();
```

#### Pattern Matching with LIKE

```typescript
// Find users whose names start with 'John'
const johnUsersResult = usersTable.selectUsers(['id', 'name'], {
	where: {
		'name.like': 'John%',
	},
});

const johnUsers = await johnUsersResult.execute();
```

#### IN Clause Queries

```typescript
// Select multiple users by their IDs
const specificUsersResult = usersTable.selectUsers(['id', 'name'], {
	where: {
		'id.in': [1, 2, 3, 4, 5],
	},
});

const specificUsers = await specificUsersResult.execute();
```

#### JSON Field Queries

```typescript
// Query users based on nested JSON properties
const usUsersResult = usersTable.selectUsers(['id', 'name', 'metadata'], {
	where: {
		'metadata.country': 'USA',
		'settings.language': 'en',
	},
});

const usUsers = await usUsersResult.execute();
```

#### Ordering and Limiting

```typescript
// Get the latest 10 users, ordered by creation date
const latestUsersResult = usersTable.selectUsers(['id', 'name', 'createdAt'], {
	where: {
		'createdAt.orderBy': 'DESC',
		limit: 10,
	},
});

const latestUsers = await latestUsersResult.execute();
```

### Custom Schema Queries

When working with complex queries that involve JOINs, CTEs, or aggregations, you often need to filter by columns that don't exist in your original table schema. The new `selectWithCustomSchema` method solves this problem by allowing you to define custom schema types for your joined results.

#### The Problem

Consider a predefined SQL query that joins multiple tables:

```sql
SELECT
    u.id,
    u.name,
    u.email,
    json_agg(p.*) as posts,
    json_agg(a.*) as addresses
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
LEFT JOIN addresses a ON u.id = a.user_id
GROUP BY u.id, u.name, u.email
```

With the regular `select` method, you cannot filter by `posts` or `addresses` because they don't exist in the `users` table schema. This would cause a TypeScript error:

```typescript
// ❌ This fails - 'posts' is not in UsersSchema
const result = usersTable.selectUsers(['id', 'name'], {
	where: {'posts.not': null}, // TypeScript error!
});
```

#### The Solution: Custom Schema Queries

First, define your custom schema interface for the joined result:

```typescript
// Define the custom result interface
interface UserWithDetailsInterface {
	id: number;
	name: string;
	email: string;
	posts: PostData[] | null;
	addresses: AddressData[] | null;
}

// Define the schema for query operations
export const userWithDetailsColumns = {
	id: {type: 'INTEGER', primaryKey: true},
	name: {type: 'TEXT', notNull: true},
	email: {type: 'TEXT'},
	posts: {type: 'JSONB'},
	addresses: {type: 'JSONB'},
} as const;

export type UserWithDetailsSchema = {
	[K in keyof typeof userWithDetailsColumns]: ColumnDefinition;
};
```

Then, use `selectWithCustomSchema` in your table class:

```typescript
class UsersTable extends TableBase<UsersSchema> {
	private predefinedQueries = {
		selectUsersWithDetails: `
      SELECT 
        u.id,
        u.name,
        u.email,
        json_agg(p.*) as posts,
        json_agg(a.*) as addresses
      FROM users u
      LEFT JOIN posts p ON u.id = p.user_id
      LEFT JOIN addresses a ON u.id = a.user_id
      GROUP BY u.id, u.name, u.email
      WHERE 1=1
    `,
	};

	public selectUsersWithDetails(
		allowedColumns: (keyof UserWithDetailsSchema)[] | '*',
		options: {
			where?: QueryParams<UserWithDetailsSchema>;
			whereClause?: string;
		}
	): QueryResult<Partial<UserWithDetailsInterface>[]> {
		let sqlText = this.predefinedQueries.selectUsersWithDetails;

		if (options.whereClause) {
			sqlText += ` AND ${options.whereClause}`;
		}

		return this.selectWithCustomSchema<UserWithDetailsInterface, UserWithDetailsSchema>({
			allowedColumns,
			predefinedSQL: {sqlText},
			options: {where: options.where},
		});
	}
}
```

#### Usage Examples

Now you can filter by any column in your joined result:

```typescript
// ✅ Filter by joined columns - this works!
const usersWithPosts = await usersTable
	.selectUsersWithDetails('*', {
		where: {
			'posts.not': null, // Users who have posts
			'addresses.not': null, // Users who have addresses
			'name.like': '%John%', // Name pattern matching
		},
	})
	.execute();

// ✅ Select specific columns from joined result
const userSummary = await usersTable
	.selectUsersWithDetails(['id', 'name', 'posts'], {
		where: {'posts.not': null},
	})
	.execute();

// ✅ Combine with additional WHERE conditions
const recentActiveUsers = await usersTable
	.selectUsersWithDetails(['id', 'name', 'email'], {
		where: {
			'id.in': [1, 2, 3, 4, 5],
			'posts.not': null,
			'addresses.not': null,
		},
		whereClause: "u.created_at > NOW() - INTERVAL '30 days'",
	})
	.execute();
```

#### Key Benefits

- **✅ Type Safety**: Full TypeScript support for custom schemas
- **✅ Filter by Joined Columns**: Query by aggregated or joined data
- **✅ All Operators Supported**: Use `not`, `like`, `in`, and other operators
- **✅ Query Inspection**: Access generated SQL before execution
- **✅ Backward Compatible**: Existing `select` method unchanged

### Complex Queries with Predefined SQL

For complex queries involving JOINs, CTEs, and aggregations:

```typescript
// Define a complex view interface
interface UserDetailsView {
	id: number;
	name: string;
	email: string;
	posts: {
		id: number;
		title: string;
		content: string;
		createdAt: string;
		authorName: string;
	}[];
	addresses: {
		id: number;
		street: string;
		neighborhood: string;
		city: string;
		userId: number;
	}[];
}

// Define predefined queries
const predefinedQueries = {
	selectUserDetails: `
		WITH user_posts AS (
			SELECT 
				p.*,
				u.name as "authorName"
			FROM posts p
			JOIN users u ON p."userId" = u.id
		),
		posts_agg AS (
			SELECT 
				p."userId",
				json_agg(
					json_build_object(
						'id', p.id,
						'title', p.title,
						'content', p.content,
						'createdAt', p."createdAt",
						'authorName', p."authorName"
					)
				) as posts
			FROM user_posts p
			GROUP BY p."userId"
		),
		addresses_agg AS (
			SELECT 
				a."userId",
				json_agg(
					json_build_object(
						'id', a.id,
						'street', a.street,
						'neighborhood', a.neighborhood,
						'city', a.city,
						'userId', a."userId"
					)
				) as addresses
			FROM addresses a
			GROUP BY a."userId"
		)
		SELECT 
			u.id,
			u.name,
			u.email,
			pa.posts,
			aa.addresses
		FROM users u
		LEFT JOIN posts_agg pa ON u.id = pa."userId"
		LEFT JOIN addresses_agg aa ON u.id = aa."userId"
		WHERE 1=1
	`,
};

// Define schema for the joined result
export const userDetailsColumns = {
	id: {type: 'INTEGER', primaryKey: true},
	name: {type: 'TEXT', notNull: true},
	email: {type: 'TEXT'},
	posts: {type: 'JSONB'},
	addresses: {type: 'JSONB'},
} as const;

export type UserDetailsSchema = {
	[K in keyof typeof userDetailsColumns]: ColumnDefinition;
};

// Use in your table class
class UsersTable extends TableBase<UsersSchema> {
	public selectUserDetails(
		allowedColumns: (keyof UserDetailsSchema)[] | '*',
		options: {
			where?: QueryParams<UserDetailsSchema>;
			whereClause?: string;
		}
	): QueryResult<Partial<UserDetailsView>[]> {
		let sqlText = predefinedQueries.selectUserDetails;

		if (options.whereClause) {
			sqlText += ` AND ${options.whereClause}`;
		}

		// Use selectWithCustomSchema for joined result filtering
		return this.selectWithCustomSchema<UserDetailsView, UserDetailsSchema>({
			allowedColumns,
			predefinedSQL: {
				sqlText,
			},
			options: {
				where: options.where,
			},
		});
	}
}

// Usage - Now you can filter by joined columns!
const userDetailsResult = usersTable.selectUserDetails(['id', 'name', 'posts'], {
	where: {
		'posts.not': null, // Filter for users who have posts
		'addresses.not': null, // Filter for users who have addresses
		'name.like': '%John%', // Pattern matching on user name
	},
	whereClause: "u.created_at > NOW() - INTERVAL '30 days'",
});

// Inspect complex query
console.log('Complex query SQL:', userDetailsResult.query.sqlText);
console.log('Query parameters:', userDetailsResult.query.values);

// Execute
const userDetails = await userDetailsResult.execute();

// Example: Get users with specific post counts
const activeUsersResult = usersTable.selectUserDetails('*', {
	where: {
		'id.in': [1, 2, 3, 4, 5],
		'posts.not': null,
		'addresses.not': null,
	},
});

const activeUsers = await activeUsersResult.execute();
```

## Testing and Debugging

### Query Inspection for Testing

```typescript
describe('Users Table', () => {
	it('should generate correct SQL for user selection', () => {
		const selectResult = usersTable.selectUsers(['id', 'name'], {
			where: {name: 'John', 'age.gte': 18},
		});

		// Test SQL structure without database execution
		expect(selectResult.query.sqlText).toContain('SELECT "id", "name" FROM users');
		expect(selectResult.query.sqlText).toContain('WHERE "name" = $1');
		expect(selectResult.query.values).toEqual(['John', 18]);
	});

	it('should execute query and return data', async () => {
		const selectResult = usersTable.selectUsers(['id', 'name'], {
			where: {name: 'John'},
		});

		const users = await selectResult.execute();
		expect(users).toBeInstanceOf(Array);
		expect(users[0]).toHaveProperty('id');
		expect(users[0]).toHaveProperty('name');
	});
});
```

### Transaction Testing

```typescript
describe('Transaction Builder', () => {
	it('should build transaction with multiple queries', () => {
		const insert1 = usersTable.insertUser(['name'], {
			data: {name: 'User 1'},
		});

		const insert2 = usersTable.insertUser(['name'], {
			data: {name: 'User 2'},
		});

		const transaction = usersTable.transaction().add(insert1.query).add(insert2.query);

		expect(transaction.queries).toHaveLength(2);
		expect(transaction.queries[0].sqlText).toContain('INSERT INTO users');
		expect(transaction.queries[1].sqlText).toContain('INSERT INTO users');
	});
});
```

### Custom Schema Query Testing

```typescript
describe('Custom Schema Queries', () => {
	it('can filter by joined columns that are not in the original table schema', async () => {
		const expectedResult = [
			{
				id: 1,
				name: 'John Doe',
				email: 'john.doe@example.com',
				posts: [{id: 1, title: 'First Post', content: 'Content'}],
				addresses: [{id: 1, street: 'Main St', city: 'New York'}],
			},
		];

		// Mock the database response
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Test filtering by joined columns - this is the key benefit!
		const result = await usersTable
			.selectUserDetails('*', {
				where: {
					'posts.not': null, // Filter by posts (joined column)
					'addresses.not': null, // Filter by addresses (joined column)
				},
			})
			.execute();

		expect(result).toEqual(expectedResult);
	});

	it('demonstrates the limitation of the original select method', async () => {
		// Using the original selectUsers method - can only filter by columns in UsersSchema
		const result = await usersTable
			.selectUsers(['id', 'name', 'email'], {
				where: {
					id: 1,
					name: 'John Doe',
					// Can't filter by 'posts' here - would cause TypeScript error
					// 'posts.not': null // ❌ This would fail - 'posts' is not in UsersSchema
				},
			})
			.execute();

		expect(result).toBeDefined();
	});

	it('supports complex filtering with multiple joined columns', async () => {
		const selectResult = usersTable.selectUserDetails(['id', 'name', 'posts'], {
			where: {
				'id.in': [1, 2, 3],
				'posts.not': null,
				'addresses.not': null,
				'name.like': '%John%',
			},
		});

		// Verify the query structure
		expect(selectResult.query.sqlText).toContain('WITH user_posts AS');
		expect(selectResult.query.sqlText).toContain('LEFT JOIN posts_agg');
		expect(selectResult.query.sqlText).toContain('LEFT JOIN addresses_agg');
		expect(Array.isArray(selectResult.query.values)).toBe(true);
	});
});
```

## Architecture Benefits

### Composition Over Inheritance

The new architecture uses composition instead of inheritance for database operations:

- **Protected operations**: Database methods are not exposed in public APIs
- **Clean interfaces**: Table classes only expose intended functionality
- **Better testing**: Easier to mock and test individual components
- **Type safety**: Full TypeScript support throughout the stack

### Standardized Interface

All methods follow the same pattern:

1. **Input structure**: Common parameters at top level, method-specific options nested
2. **Return structure**: Consistent `QueryResult<T>` with query inspection and execution
3. **Type safety**: Strong typing throughout the interface
4. **Testability**: Easy access to generated SQL via `.query` property

## Type System

The library provides comprehensive TypeScript support:

### Column Type Mapping

```typescript
export type ColumnTypeMapping = {
	VARCHAR: string;
	INTEGER: number;
	NUMERIC: number;
	TEXT: string;
	DATE: Date | string;
	ENUM: Enumerator | Enumerator[];
	'TIMESTAMP WITHOUT TIME ZONE': Date | string;
};
```

### Query Parameters with Special Operators

```typescript
export type ConditionSuffixes = 'not' | 'startDate' | 'endDate' | 'like' | 'in' | 'orderBy';

export type QueryConditionKeys<T extends Record<string, ColumnDefinition>> =
	| Extract<keyof SchemaToData<T>, string>
	| `${Extract<keyof SchemaToData<T>, string>}.${ConditionSuffixes}`;

export type QueryParams<T extends Record<string, ColumnDefinition>> = {
	[key in QueryConditionKeys<T>]?: any;
};
```

### New Standardized Types

```typescript
export type QueryObject = {
	sqlText: string;
	values: any[];
};

export interface QueryResult<T> {
	query: QueryObject;
	execute(): Promise<T>;
}

export interface TransactionResult<T> {
	queries: QueryObject[];
	execute(): Promise<T>;
	add(query: QueryObject): TransactionResult<T>;
}

// Custom schema types for joined/complex queries
export interface CustomBaseOptions<T extends Record<string, any>> {
	allowedColumns?: (keyof T)[] | '*';
	predefinedSQL: {
		sqlText: string;
		values?: any[];
	};
}

export interface CustomSelectOptions<T extends Record<string, any>> {
	where?: QueryParams<T>;
	alias?: string;
	includeMetadata?: boolean;
	schemaColumns?: any;
}
```

## Project Structure

```
src/
├── index.ts                           # Main exports
├── connection/
│   └── postgres-connection.ts         # PostgresConnection singleton
├── core/
│   ├── table-base.ts                  # Main table base class with composition
│   ├── database-operations.ts         # Protected database operations
│   └── query-constructor.ts           # SELECT query building
├── utils/
│   ├── query-builder.ts               # SQL query building utilities
│   ├── query-executor.ts              # Query execution utilities
│   ├── query-utils.ts                 # Query utility functions and interfaces
│   ├── array-utils.ts                 # Array validation utilities
│   ├── class-utils.ts                 # Class utility functions
│   └── helpers.ts                     # SQL query helper functions
└── types/
    ├── index.ts                       # Type exports
    ├── core-types.ts                  # Column, table, and database types
    └── utility-types.ts               # Utility type definitions
```

## Testing

The library includes comprehensive test coverage:

- **✅ 40/40 tests passing**
- **Integration tests**: Real database operations
- **Security tests**: SQL injection prevention, input validation
- **Transaction tests**: Builder pattern and rollback scenarios
- **Query inspection tests**: SQL structure validation
- **Date range tests**: Complex filtering scenarios
- **Custom schema tests**: Joined column filtering and type safety

Test files:

- `tests/integration/pg-lightquery/` - Core functionality tests
  - `custom-schema-queries.test.ts` - Custom schema query testing
  - `advanced-queries.test.ts` - Complex query operations
  - `basic-crud.test.ts` - Basic CRUD operations
  - `date-range.test.ts` - Date filtering scenarios
- `tests/integration/security/` - Security-focused tests
- `tests/tables/` - Table entity and definition tests

## Migration Guide

### From Old Pattern to New Pattern

**Before (Old Pattern)**:

```typescript
// Inconsistent return types and interfaces
const result = await table.selectUsers({params: {name: 'John'}, allowedColumns: ['id', 'name']});
const {execute} = table.insertUser(data, ['name'], 'id', false, 'user');
```

**After (New Pattern)**:

```typescript
// Consistent QueryResult interface
const selectResult = table.selectUsers(['id', 'name'], {where: {name: 'John'}});
const insertResult = table.insertUser(['name'], {data, returnField: 'id', idUser: 'user'});

// Query inspection capability
console.log(selectResult.query.sqlText);
console.log(insertResult.query.values);

// Execute when ready
const users = await selectResult.execute();
const newUser = await insertResult.execute();
```

### New Custom Schema Support

**New Feature**: For complex queries with JOINs and aggregations:

```typescript
// Before: Limited to original table schema
const result = table.select({
	predefinedSQL: {sqlText: complexJoinQuery},
	allowedColumns: ['id', 'name'], // Only original table columns
	options: {where: {id: 1}}, // Can't filter by joined columns
});

// After: Full support for custom schemas
const result = table.selectWithCustomSchema<CustomResultInterface, CustomSchema>({
	predefinedSQL: {sqlText: complexJoinQuery},
	allowedColumns: ['id', 'name', 'joinedColumn'], // Any column from result
	options: {
		where: {
			id: 1,
			'joinedColumn.not': null, // Filter by joined columns!
			'aggregatedData.like': '%pattern%',
		},
	},
});
```

## Dependencies

- **pg**: PostgreSQL client for Node.js
- **mocklogs**: Logging utility
- **sql-ddl-to-json-schema**: SQL DDL parsing
- **uuid**: UUID generation for primary keys

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC License
