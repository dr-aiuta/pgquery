# v0.5.1

Tidy release. Valid calls behave the same. See the upgrade guide: [docs/upgrading/to-0.5.1.md](docs/upgrading/to-0.5.1.md).

Fixes:

- A chained insert writes its steps in the order they are called. Inserts used to come first and updates after them, whatever the call order.
- A referenced insert keeps its `ON CONFLICT` clause. It used to be dropped.
- A referenced insert or update may have empty data. It used to throw.
- A placeholder inside a string literal, a quoted name or a comment of predefined SQL is no longer counted.

Added:

- A chain step takes a table class instance, as well as its operations object.
- `TableBase` has `registerRelatedTable`, `getRelatedTable` and `createChainedInsert`. `EnhancedTableBase` is a deprecated alias of `TableBase`.
- `sqlExpression(...)` is accepted as a value in insert and update data. It is written into the SQL text and is not bound.
- `selectFrom` takes an array of column names.

New checks. They reject input that was raw SQL, or that could never have run:

- The name of a chain step, the `from` and `field` of a reference, and each `selectFrom` column must be plain identifiers. `selectFrom` no longer accepts an expression, and it writes each column in double quotes.
- A reference target `to` must be a column of the table definition.
- A table name in a table definition must be a plain name, optionally with a schema in front.
- When `predefinedSQL` has `values`, their count must match its highest placeholder.

Internal:

- The chained builder no longer parses its own SQL back with regular expressions.
- The sources moved into a new layout. `src/index.ts` exports the same names.
- `select` and `selectWithCustomSchema` share one implementation.
- The `includeMetadata` option was never used. It is deprecated and ignored.
- `noUnusedLocals` is on, the path aliases are gone, and Prettier checks the formatting in CI.

# v0.5.0

Breaking release. A caret range on 0.4.x does not install it. See the upgrade guide: [docs/upgrading/to-0.5.0.md](docs/upgrading/to-0.5.0.md).

Schema features, described in [docs/features/schema.md](docs/features/schema.md):

- `checkSchemaDrift()` compares table definitions with the live catalog and reports every difference. It only reads.
- `generateMigration()` turns the drift into a draft migration, as a node-pg-migrate file in TypeScript or JavaScript, or as plain SQL. Active steps only add things. Everything that removes or changes something is commented out for review.
- Both are imported from `pg-lightquery/schema`.
- `sqlExpression('now()')` marks an SQL expression in a column default. It is exported from the package root.
- `ColumnDefinition.references` declares a foreign key with `table`, `column`, and optional `onDelete` and `onUpdate`.
- `ColumnDefinition.enumTypeName` names the PostgreSQL enum type of an `ENUM` column. It defaults to `<table>_<column>`.

New column types, each with its TypeScript type:

| Column type                                           | TypeScript type    |
| ----------------------------------------------------- | ------------------ |
| `UUID`                                                | `string`           |
| `SMALLINT`                                            | `number`           |
| `BIGINT`                                              | `string \| number` |
| `REAL`                                                | `number`           |
| `DOUBLE PRECISION`                                    | `number`           |
| `BOOLEAN`                                             | `boolean`          |
| `JSON`                                                | `unknown`          |
| `JSONB`                                               | `unknown`          |
| `TIME WITHOUT TIME ZONE`                              | `string`           |
| `TIMESTAMP WITH TIME ZONE`                            | `Date \| string`   |
| `TIMESTAMPTZ`, an alias of `TIMESTAMP WITH TIME ZONE` | `Date \| string`   |

`BIGINT` is `string | number`, because node-postgres returns it as a string. `JSON` and `JSONB` are `unknown` and need a cast when read.

Query features:

- `ignoreUnknownKeys` in the select options drops `where` keys outside `allowedColumns`. See [docs/features/filters.md](docs/features/filters.md).
- `maxLimit` in a table definition caps `limit`.
- `columnsToReturn` works with predefined SQL.
- `onConflict: {target: [...]}` upserts on a unique column that is not the primary key. See [docs/features/writes.md](docs/features/writes.md).
- `QueryInputError` is thrown for every rejected input. Errors from PostgreSQL still pass through unchanged. See [docs/features/connection.md](docs/features/connection.md).
- `PostgresConnection.initialize(config, {logger, slowQueryMs})` attaches a logger. It receives the SQL text, the duration and the row count, and never a bound value.

Breaking changes. Each has a migration note, and a step in the upgrade guide:

- `allowedColumns` has no default in `select`, `selectWithCustomSchema`, `insert`, `update` and every step of a chained insert. Migration: pass a column list, or write `'*'` out. Guide step 1.
- A `where` key whose column is not in `allowedColumns` throws. It used to be dropped. Migration: pass an explicit list, and set `ignoreUnknownKeys: true` on routes that should ignore extra parameters. Guide step 2.
- `null` in insert and update data writes `NULL`. Only `undefined` is skipped. Migration: where `null` means "keep what is stored", remove the null keys before the call. Guide step 3.
- `'<column>.null': true` means `IS NULL`. Boolean `true` used to mean `IS NOT NULL`. Migration: pass `false` for `IS NOT NULL`. Guide step 4.
- An operator outside `not`, `like`, `in`, `null`, `startDate`, `endDate` and `orderBy` throws. It used to fall back to equality. Migration: fix the key. A JSON key filter is an object value. Guide step 4.
- The default export, `QueryBuilder`, `pgUtilsDb`, `pgUtilsHelpers`, `CTETransactionBuilder`, `createCTETransaction`, `EnhancedCTEBuilder`, `createEnhancedCTE` and their types are no longer exported. Migration: import `{TableBase}` by name, and use `createChainedInsert` for chains. Guide step 5.
- `update` no longer takes `predefinedSQL`. Migration: run the update on its own, or send the whole statement through `PostgresConnection.query`. Guide step 6.
- Predefined SQL is wrapped as a subquery when a filter, a sort key, a paging key or a column list is added. Filters apply to the columns of its result. The `alias` option is removed. Migration: remove `alias`, and filter on result column names. Guide step 7.
- `<column>.in` sends one array parameter, `= ANY($n)`. An empty list returns no rows. More than 10,000 values throw. Migration: code that reads `.query.values` finds one array. Guide step 8.
- The library no longer prints to the console. Migration: pass a logger to `initialize`. Guide step 9.
- TypeScript types only: the column types above used to accept any value. A value of another type, or `null`, no longer compiles for those columns. Migration: fix the value's type, or remove the cast. Guide step 10.
- The package has an `exports` map. Only `pg-lightquery` and `pg-lightquery/schema` can be imported. An import of any other path inside the package, such as `pg-lightquery/dist/...`, fails. Migration: import from one of the two entry points. Guide step 11.
- A string `default` in a table definition is a literal. Exactly `now()`, `CURRENT_TIMESTAMP`, `CURRENT_DATE` and `gen_random_uuid()`, in any case, are still read as expressions. No query reads `default`, so this affects only the schema tools. Migration: wrap an expression in `sqlExpression(...)`. Guide step 12.

Removed dependencies: `sql-ddl-to-json-schema`, `mocklogs` and `@types/json-schema`. The package now depends on `pg` and `uuid` only.

Projects on 0.0.x: see [docs/upgrading/from-0.0.x.md](docs/upgrading/from-0.0.x.md).

# v0.4.7

Safety patch. No API change, and no code change is required. See the upgrade guide: [docs/upgrading/to-0.4.7.md](docs/upgrading/to-0.4.7.md).

Fixes:

- Transactions run on one connection. `transaction().add().execute()` and chained `.build().execute()` used to send `BEGIN`, each statement and `COMMIT` through separate pool checkouts, so they were not atomic under concurrent load.
- A failed `PostgresConnection.transaction(text, params)` rethrows the original pg error, with its `code`. It used to throw a new plain `Error`.
- An upsert on a composite primary key quotes each key column on its own in `ON CONFLICT`.
- An upsert whose data holds only key columns emits `ON CONFLICT (...) DO NOTHING`. It used to emit an empty `DO UPDATE SET`.
- An insert whose data yields no column emits `INSERT INTO ... DEFAULT VALUES`. It used to emit an empty column list.
- Two or more `<column>.orderBy` keys produce one `ORDER BY` clause. Keys keep their object order.
- `offset` in a `where` object emits `OFFSET n`. It used to become a filter on a column named `offset`. It takes the same non-negative integer check as `limit`.
- `selectWithCustomSchema()` keeps `limit` and `offset` when `allowedColumns` is an explicit list.
- `returnField` must be `'*'`, a column of the table definition, or an array of such columns. Anything else throws. It used to be written into the SQL unchecked.

Added:

- `PostgresConnection.transaction(queries)` runs a list of query objects as one transaction.
- `PostgresConnection.end()` closes the pool and clears the singleton.

Packaging and tooling:

- The published package holds only `dist/`, `package.json` and `README.md`.
- The publish workflow reads the tag from the environment and pins npm to major version 11.
- A CI workflow runs the type check and the tests, with a PostgreSQL service, on every pull request and on every push to `main`.
- A live test suite runs against PostgreSQL when `PGLIGHTQUERY_TEST_DATABASE_URL` is set.

# v0.4.6

Security fix for GHSA-m2wx-4cwh-cgw5 (SQL injection through the `where` object).

- `limit` must now be a non-negative integer (number or numeric string). Anything else throws.
- `<column>.orderBy` must now be `ASC` or `DESC` (case-insensitive). Anything else throws.
- Under the `'*'` allow-list, a `where` key must be a plain identifier (`/^[A-Za-z_][A-Za-z0-9_]*$/`). Anything else throws.
- `update()` now restricts `where` keys to the table schema instead of accepting any key.
- `selectWithCustomSchema()` uses `options.schemaColumns` as the allow-list when `allowedColumns` is `'*'`.
- Nested JSON keys (`where: {col: {key: value}}`) are bound as parameters instead of being interpolated.

# v0.0.19

- Added sql functions

# v0.0.18

- Added json queries

# v0.0.17

- Added like and in queries

# v0.0.16

- npm run build

# v0.0.15

- Fixed queries for null values

# v0.0.14

- npm run build

# v0.0.13

- Updated order By queries

# v0.0.12

- Adjusted import and exports

# v0.0.11

- Updated with npm run build and new Date() for date ranges

# v0.0.10

- Refactor queries and special queries

# v0.0.7

- Introduced query constructors

# v0.0.6

- Adjusted folder structures and imports

# v0.0.4

- Adjusted folder structures and imports

# v0.0.3

- General updates

# v0.0.2

- Updated to Class
- Updated methods

# v0.0.1

- First commit with first structure of the module
