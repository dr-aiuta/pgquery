# pg-lightquery

A lightweight, type-safe PostgreSQL query builder for Node.js with TypeScript support.

## Features

- 🔒 Type-safe query building
- 🎯 Object-oriented approach
- 🚀 Easy to use API
- 📦 Zero runtime dependencies (except `pg`)
- 🛠 Built-in transaction support
- 🔍 Advanced query filtering
- 📊 Support for complex views and joins
- 🎨 Predefined query templates
- 🔄 JSON field operations

## Installation

```bash
npm install pg-lightquery
```

## Basic Usage

### 1. Database Connection

First, initialize your database connection:

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

### 2. Define Table Structure

```typescript
import {ColumnDefinition, TableDefinition} from 'pg-lightquery';

type UsersSchema = {
	id: ColumnDefinition;
	name: ColumnDefinition;
	email: ColumnDefinition;
	createdAt: ColumnDefinition;
	updatedAt: ColumnDefinition;
};

const usersColumns = {
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

const usersTable: TableDefinition<UsersSchema> = {
	tableName: 'users',
	schema: {
		columns: usersColumns,
	},
};
```

### 3. Create Table Class

```typescript
import {PGLightQuery} from 'pg-lightquery';

class UsersTable extends PGLightQuery<UsersSchema> {
	constructor() {
		super(usersTable);
	}

	async createUser(data: Partial<UsersData>) {
		return this.insert(data, ['name', 'email'], 'id', false).execute();
	}

	async getUserById(id: number) {
		return this.select({
			params: {id},
			allowedColumns: '*',
		}).execute();
	}
}
```

## Advanced Features

### Views and Complex Queries

You can define complex views with joins and aggregations:

```typescript
// Define the view interface
interface UserDetailsView {
	id: number;
	name: string;
	email: string;
	posts: {
		id: number;
		title: string;
		content: string;
	}[];
	addresses: {
		street: string;
		city: string;
	}[];
}

// Create a predefined query
const userDetailsQuery = `
  WITH user_posts AS (
    SELECT 
      p.*,
      u.name as "authorName"
    FROM posts p
    JOIN users u ON p."userId" = u.id
  ),
  posts_agg AS (
    SELECT 
      "userId",
      json_agg(json_build_object(
        'id', id,
        'title', title,
        'content', content
      )) as posts
    FROM user_posts
    GROUP BY "userId"
  )
  SELECT 
    u.id,
    u.name,
    u.email,
    pa.posts
  FROM users u
  LEFT JOIN posts_agg pa ON u.id = pa."userId"
  WHERE 1=1
`;

// Use in your table class
class UsersTable extends PGLightQuery<UsersSchema> {
	async getUserDetails(userId: number): Promise<UserDetailsView> {
		return this.select<UserDetailsView>({
			params: {id: userId},
			allowedColumns: '*',
			predefinedSQL: {
				sqlText: userDetailsQuery,
			},
		}).execute();
	}
}
```

### Special Query Conditions

#### Date Range Queries

```typescript
const recentUsers = await usersTable
	.select({
		params: {
			'createdAt.startDate': '2023-01-01',
			'createdAt.endDate': '2023-12-31',
		},
		allowedColumns: '*',
	})
	.execute();
```

#### JSON Field Queries

```typescript
const users = await usersTable
	.select({
		params: {
			'metadata.country': 'USA',
			'settings.language': 'en',
		},
		allowedColumns: '*',
	})
	.execute();
```

#### Pattern Matching

```typescript
const users = await usersTable
	.select({
		params: {
			'name.like': 'John%',
		},
		allowedColumns: '*',
	})
	.execute();
```

#### IN Clause

```typescript
const users = await usersTable
	.select({
		params: {
			'id.in': [1, 2, 3],
		},
		allowedColumns: '*',
	})
	.execute();
```

### Transactions

```typescript
const transaction = usersTable.transaction([
	{
		sqlText: 'INSERT INTO users(name, email) VALUES($1, $2)',
		valuesToBeInserted: ['John', 'john@example.com'],
	},
	{
		sqlText: 'UPDATE users SET name = $1 WHERE id = $2',
		valuesToBeInserted: ['Jane', 1],
	},
]);

await transaction.execute();
```

## Type Support

The library provides full TypeScript support for:

- Table schemas
- Query parameters
- Return types
- Complex view interfaces
- JSON operations
- Special query conditions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC License
