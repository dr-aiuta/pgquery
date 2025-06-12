# pg-lightquery

A lightweight, type-safe PostgreSQL query builder for Node.js with TypeScript support.

## Features

- 🔒 **Type-safe query building** with full TypeScript support
- 🎯 **Object-oriented approach** with class-based table definitions
- 🚀 **Easy to use API** with method chaining and bound methods
- 📦 **Minimal dependencies** (pg, mocklogs, sql-ddl-to-json-schema, uuid)
- 🛠 **Built-in transaction support** with automatic rollback
- 🔍 **Advanced query filtering** with special operators
- 📊 **Support for complex views and joins** via predefined SQL
- 🎨 **Predefined query templates** with CTE and aggregation support
- 🔄 **JSON field operations** with nested property queries
- 📝 **Comprehensive logging** and error handling

## Installation

```bash
npm install pg-lightquery
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

### 3. Create Your Table Class

```typescript
import {TableBase} from 'pg-lightquery';

class UsersTable extends TableBase<UsersSchema> {
	constructor() {
		super(usersTable);
	}

	// Insert a new user
	public insertUser(
		userData: Partial<UsersData>,
		allowedColumns: (keyof UsersSchema)[] | '*',
		returnField: keyof UsersSchema,
		onConflict: boolean = false,
		idUser?: string
	) {
		return this.insert(userData, allowedColumns, returnField, onConflict, idUser || 'SERVER');
	}

	// Select users with parameters
	public async selectUsers(
		params: QueryParams<UsersSchema>,
		allowedColumns: (keyof UsersSchema)[] | '*' = '*'
	): Promise<Partial<UsersData>[]> {
		return this.select<UsersData>({
			params,
			allowedColumns,
		}).execute();
	}

	// Select user by ID
	public async selectUserById(id: number): Promise<Partial<UsersData>[]> {
		return this.select<UsersData>({
			params: {id},
			allowedColumns: '*',
		}).execute();
	}
}
```

## Advanced Query Features

### Special Query Operators

The library supports various special operators for advanced filtering:

#### Date Range Queries

```typescript
// Query users created within a date range
const recentUsers = await usersTable.selectUsers({
	'createdAt.startDate': '2023-01-01',
	'createdAt.endDate': '2023-12-31',
});
```

#### Pattern Matching with LIKE

```typescript
// Find users whose names start with 'John'
const johnUsers = await usersTable.selectUsers({
	'name.like': 'John%',
});
```

#### IN Clause Queries

```typescript
// Select multiple users by their IDs
const specificUsers = await usersTable.selectUsers({
	'id.in': [1, 2, 3, 4, 5],
});
```

#### JSON Field Queries

```typescript
// Query users based on nested JSON properties
const usUsers = await usersTable.selectUsers({
	'metadata.country': 'USA',
	'settings.language': 'en',
});
```

#### Ordering and Limiting

```typescript
// Get the latest 10 users, ordered by creation date
const latestUsers = await usersTable.selectUsers({
	'createdAt.orderBy': 'DESC',
	limit: 10,
});
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
	public async selectUserDetails(
		params: Record<string, any>,
		allowedColumns: (keyof UsersSchema)[] | '*' = '*',
		additionalWhereClause?: string
	): Promise<Partial<UserDetailsView>[]> {
		let sqlText = predefinedQueries.selectUserDetails;

		if (additionalWhereClause) {
			sqlText += ` AND ${additionalWhereClause}`;
		}

		return this.select<UserDetailsView>({
			params,
			allowedColumns,
			predefinedSQL: {
				sqlText,
			},
		}).execute();
	}
}
```

### Transaction Support

Execute multiple queries within a transaction:

```typescript
import {QueryObject} from 'pg-lightquery';

// Create transaction with multiple operations
const transactionQueries: QueryObject[] = [
	{
		sqlText: 'INSERT INTO users(name, email) VALUES($1, $2)',
		valuesToBeInserted: ['John Doe', 'john@example.com'],
	},
	{
		sqlText: 'UPDATE users SET name = $1 WHERE id = $2',
		valuesToBeInserted: ['Jane Doe', 1],
	},
];

const transaction = usersTable.transaction(transactionQueries);
await transaction.execute();
```

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

## Project Structure

```
src/
├── config/
│   └── queries.ts          # PostgresConnection singleton
├── queries/
│   ├── TableBase.ts        # Main table base class
│   ├── DatabaseOperations.ts  # Database operations
│   ├── insert.ts           # Insert query logic
│   ├── update.ts           # Update query logic
│   ├── selectQueryConstructor.ts  # SELECT query building
│   └── shared/
│       ├── db/             # Database utilities
│       └── helpers/        # Helper functions
└── types/
    ├── column.ts           # Column and schema types
    ├── table.ts            # Table definition types
    ├── database.ts         # Database schema types
    └── types.ts            # Utility types
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
