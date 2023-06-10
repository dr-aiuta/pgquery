# pgquery

With this module you'll be able to synthetize your postgreSQL database in just one file.
Then, using an object-oriented approach, it will be possible to manipulate the database without hussle.

# pgConfig

Use a file to config Postgres access and database schema, like:

```
const modelsConfig = {
  users: {
    tableName: 'users',
    schema: {
      id: {
        type: 'SERIAL',
        primaryKey: true,
      },
      name: {
        type: 'TEXT',
        notNull: true,
      },
      email: {
        type: 'TEXT',
        notNull: true,
        unique: true,
      },
      createdAt: {
        type: 'TIMESTAMP',
        notNull: true,
        default: 'NOW()',
      },
      updatedAt: {
        type: 'TIMESTAMP',
        notNull: true,
        default: 'NOW()',
      },
    },
    queries: {
      createUser: {
        sql: 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
        type:'insert',
        values: ({ name, email }: UserData) => [name, email],
        processResult: (result: QueryResult<UserResult>) => result.rows[0],
      },
      getUserById: {
        sql: 'SELECT * FROM users',
        type:'select',
        values: (id: number) => [id],
        processResult: (result: QueryResult<UserResult>) => result.rows[0],
      },
    },
  },
}
```

# Special Queries

Use params like field.condition like `{createdAt.startDate: '2023-01-01'}` as params