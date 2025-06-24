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

// Use in your table class
class UsersTable extends TableBase<UsersSchema> {
	public selectUserDetails(
		allowedColumns: (keyof UsersSchema)[] | '*',
		options: {
			where?: Record<string, any>;
			whereClause?: string;
		}
	): QueryResult<Partial<UserDetailsView>[]> {
		let sqlText = predefinedQueries.selectUserDetails;

		if (options.whereClause) {
			sqlText += ` AND ${options.whereClause}`;
		}

		return this.select<UserDetailsView>({
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

// Usage
const userDetailsResult = usersTable.selectUserDetails(['id', 'name'], {
	where: {active: true},
	whereClause: "u.created_at > NOW() - INTERVAL '30 days'",
});

// Inspect complex query
console.log('Complex query SQL:', userDetailsResult.query.sqlText);

// Execute
const userDetails = await userDetailsResult.execute();
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

- **✅ 30/30 tests passing**
- **Integration tests**: Real database operations
- **Security tests**: SQL injection prevention, input validation
- **Transaction tests**: Builder pattern and rollback scenarios
- **Query inspection tests**: SQL structure validation
- **Date range tests**: Complex filtering scenarios

Test files:

- `tests/integration/pg-lightquery/` - Core functionality tests
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

## Dependencies

- **pg**: PostgreSQL client for Node.js
- **mocklogs**: Logging utility
- **sql-ddl-to-json-schema**: SQL DDL parsing
- **uuid**: UUID generation for primary keys

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC License
