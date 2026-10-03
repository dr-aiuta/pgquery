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