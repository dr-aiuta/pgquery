# Schema: column types, drift check and migration drafts

Since 0.5.0. Your table definitions describe the database. Two tools use them beyond typing and query building. `checkSchemaDrift` compares the definitions with a live database and reports every difference. `generateMigration` turns those differences into a draft migration for a human to review.

pg-lightquery does not run migrations. Pair it with a migration tool. [node-pg-migrate](https://github.com/salsita/node-pg-migrate) fits well, because it is Postgres-only and uses the same `pg` driver.

The tools have separate jobs:

- **Table definitions are what you edit.** pg-lightquery uses them for typing and query building.
- **`generateMigration` writes the migration.** It compares your definitions with a database and drafts the SQL that closes the gap.
- **Your migration tool runs the migrations.** Committed migration files stay frozen history and are applied the same way everywhere.
- **`checkSchemaDrift` keeps everything honest.** It fails fast when a database and your definitions disagree.

The examples use the `users`, `posts` and `addresses` definitions from [`tests/tables`](../../tests/tables).

## Minimal example

Both tools are imported from `pg-lightquery/schema`. They take an array of table definitions.

```typescript
import {Client} from 'pg';
import {TableDefinition} from 'pg-lightquery';
import {checkSchemaDrift, generateMigration} from 'pg-lightquery/schema';

const usersTable: TableDefinition<UsersSchema> = {tableName: 'users', schema: {columns: usersColumns}};
const postsTable: TableDefinition<PostsSchema> = {tableName: 'posts', schema: {columns: postsColumns}};
const addressesTable: TableDefinition<AddressesSchema> = {tableName: 'addresses', schema: {columns: addressesColumns}};
const tables = [usersTable, postsTable, addressesTable];

const client = new Client({connectionString: process.env.DATABASE_URL});
await client.connect();
const query = (text: string, values: any[]) => client.query(text, values);

const report = await checkSchemaDrift(tables, {query});
if (!report.ok) {
	console.log(report.issues.map((issue) => issue.message).join('\n'));
}

const draft = await generateMigration(tables, {query, format: 'sql'});
console.log(draft.content);
```

## Column types

| Type | TypeScript type | PostgreSQL type |
|---|---|---|
| `VARCHAR` | `string` | `character varying`, with `length` when set |
| `TEXT` | `string` | `text` |
| `UUID` | `string` | `uuid` |
| `SMALLINT` | `number` | `smallint` |
| `INTEGER` | `number` | `integer` |
| `BIGINT` | `string \| number` | `bigint` |
| `NUMERIC` | `number` | `numeric`, with `precision` and `scale` when set |
| `REAL` | `number` | `real` |
| `DOUBLE PRECISION` | `number` | `double precision` |
| `BOOLEAN` | `boolean` | `boolean` |
| `JSON` | `unknown` | `json` |
| `JSONB` | `unknown` | `jsonb` |
| `DATE` | `Date \| string` | `date` |
| `TIME WITHOUT TIME ZONE` | `string` | `time without time zone` |
| `TIMESTAMP WITHOUT TIME ZONE` | `Date \| string` | `timestamp without time zone` |
| `TIMESTAMP WITH TIME ZONE` | `Date \| string` | `timestamp with time zone` |
| `TIMESTAMPTZ` | `Date \| string` | `timestamp with time zone`. An alias of the row above. |
| `ENUM` | `string \| number` | an enum type, see below |

Three notes on the TypeScript types:

- `BIGINT` is `string | number`. node-postgres returns a `bigint` column as a string, to avoid losing precision.
- `JSON` and `JSONB` are `unknown`. Cast a value when you read it.
- A type outside this table throws `Unknown column type` in both tools.

## Defaults

`default` is a literal value.

```typescript
const peopleColumns = {
	surname: {type: 'TEXT', default: 'Smith (Jr)'}, // DEFAULT 'Smith (Jr)'
	owner: {type: 'TEXT', default: 'current_user'}, // DEFAULT 'current_user', a string
	nickname: {type: 'TEXT', default: null}, // no default
	createdAt: {type: 'TIMESTAMPTZ', notNull: true, default: 'CURRENT_TIMESTAMP'}, // DEFAULT CURRENT_TIMESTAMP
	expiresAt: {type: 'TIMESTAMPTZ', default: sqlExpression("now() + interval '1 day'")},
	opensAt: {type: 'TIME WITHOUT TIME ZONE'},
} as const;
```

The rules:

- A string is a literal. It is written in quotes.
- Wrap an SQL expression in `sqlExpression('...')`. Import it from the package root: `import {sqlExpression} from 'pg-lightquery'`.
- Four strings are still read as expressions, for definitions written before `sqlExpression` existed: `now()`, `CURRENT_TIMESTAMP`, `CURRENT_DATE` and `gen_random_uuid()`. The string must equal one of them exactly. Upper and lower case both match.
- A number, a boolean and a `Date` are literals.
- A plain object is a literal too. It becomes a JSON string, which suits `JSON` and `JSONB` columns. An object such as `{sql: 'SELECT 1'}` is never read as an expression.
- `default: null` means no default, the same as leaving `default` out.

## Foreign keys and enum types

Declare a foreign key with `references`. The referenced table may be schema-qualified.

```typescript
export const postsColumns = {
	id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	userId: {
		type: 'INTEGER',
		notNull: true,
		references: {table: 'users', column: 'id'},
	},
	title: {type: 'TEXT', notNull: true},
} as const;
```

`references` also takes `onDelete` and `onUpdate`. Each is one of `NO ACTION`, `RESTRICT`, `CASCADE`, `SET NULL` or `SET DEFAULT`. The drift check compares an action only when the definition sets it.

An `ENUM` column is backed by a PostgreSQL enum type. `enumTypeName` names that type, optionally schema-qualified. It defaults to `<table>_<column>`, for example `posts_status`. When it is set, the drift check also verifies it.

```typescript
status: {type: 'ENUM', enum: ['active', 'blocked', 'archived'], enumTypeName: 'user_status'},
```

## `checkSchemaDrift`

It compares the definitions with the live catalog and returns every difference. It only reads. It never changes the database.

```typescript
const report = await checkSchemaDrift(tables, {query});

console.log(report.ok); // false
console.log(report.issues.map((issue) => issue.message));
// [
//   'public.users.bio: column does not exist (expected column, found nothing)',
//   'public.users.legacyBio: column is not in the definition (expected nothing, found column)',
// ]
```

What it compares, per column:

- that the table and the column exist, and which database columns the definition lacks
- the data type, with the `VARCHAR` length and the `NUMERIC` precision and scale when they are defined
- the enum labels of an `ENUM` column
- `NOT NULL`, the primary key, a single-column `unique`, and `autoIncrement`, which matches a serial or an identity column
- whether a default exists
- a single-column foreign key, with `onDelete` and `onUpdate` when they are defined

Each issue has a `kind`, the `table`, the `column`, what was `expected`, what was `actual`, and a `message`.

Options:

| Option | Default | Purpose |
|---|---|---|
| `defaultSchema` | `'public'` | Schema for table names without a schema prefix |
| `ignoreExtraColumns` | `false` | Skip database columns that the definition does not declare |
| `query` | the initialized `PostgresConnection` | The function that runs the catalog queries. Any function of the shape `(text, values) => Promise<{rows}>` works, for example a `pg` client. |

### In CI

Run it in a test against a migrated database. The check fails the build when a definition and the migrations disagree.

```typescript
it('table definitions match the database', async () => {
	const report = await checkSchemaDrift(tables, {query});
	expect(report.issues).toEqual([]);
	expect(report.ok).toBe(true);
});
```

### At startup

Without a `query` option the check uses the initialized `PostgresConnection`.

```typescript
import {PostgresConnection} from 'pg-lightquery';
import {checkSchemaDrift} from 'pg-lightquery/schema';

PostgresConnection.initialize({connectionString: process.env.DATABASE_URL});

const report = await checkSchemaDrift(tables);
if (!report.ok) {
	throw new Error(`Schema drift:\n${report.issues.map((issue) => issue.message).join('\n')}`);
}
```

This path, through `PostgresConnection`, is covered by types only. The tests pass a `pg` client as `query`.

## `generateMigration`

It runs the same comparison and turns the issues into steps. The result is a draft. Review it, then commit it to your migrations folder.

```typescript
const draft = await generateMigration(tables, {query, format: 'node-pg-migrate-ts'});

draft.hasChanges; // true when the definitions and the database differ
draft.needsReview; // true when at least one step is commented out
draft.steps; // [{sql, review, note}]
draft.issues; // the drift issues the steps come from
draft.content; // the file content, ready to write
```

It takes the options of `checkSchemaDrift`, plus `format`.

### Output formats

| `format` | Output |
|---|---|
| `'node-pg-migrate-ts'` | A TypeScript migration file for node-pg-migrate. This is the default. |
| `'node-pg-migrate-js'` | The same as a CommonJS file. |
| `'sql'` | Plain SQL statements. Any migration tool can run them. |

The generator emits plain SQL through `pgm.sql`, so the migration runs exactly the reviewed statements. For a definition that gained a `bio` column while the database still has a `legacyBio` column, the TypeScript format reads:

```typescript
// Generated by pg-lightquery generateMigration. Review before running.
import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.sql(`ALTER TABLE "public"."users" ADD COLUMN "bio" text`);

	// REVIEW: Dropping legacyBio deletes its data. If it was renamed, use: ALTER TABLE "public"."users" RENAME COLUMN "legacyBio" TO "bio"
	// pgm.sql(`ALTER TABLE "public"."users" DROP COLUMN "legacyBio"`);

	// No down migration is generated. Add one if you need rollbacks.
}
```

### The safety rule

- **Active steps only add things.** They create a type or a table, add a column, an enum label, a unique constraint or a foreign key, and set a default. If existing data conflicts, the step fails loudly when the migration runs.
- **Everything that removes or changes something is commented out.** That covers drops, `NOT NULL` changes, type changes, primary key and identity changes, removed enum labels and replaced foreign keys. Each one carries a note on what to check.

A definition that merely forgot a flag can therefore never silently remove a constraint.

More behavior worth knowing:

- Foreign keys are added at the end, after every table and column exists. Tables that reference each other work.
- Anything that depends on a review step becomes a review step too. An example is a table that uses an enum type whose labels are not defined yet.
- A renamed column looks like one dropped column and one new column. The note suggests a rename and lists the new columns of that table.
- A new `NOT NULL` column on a table with rows needs a default or a backfill. The step is active and carries a note.
- A new column on an existing enum type gets the labels the type lacks first, as `ALTER TYPE ... ADD VALUE`.
- A commented-out step stays commented out whatever text it carries. Notes and SQL go through one function that comments every line.

### A script to generate a draft

```typescript
// scripts/generate-migration.ts
import {writeFileSync} from 'fs';
import {Client} from 'pg';
import {generateMigration} from 'pg-lightquery/schema';
import {tables} from '../src/db/tables';

const client = new Client({connectionString: process.env.DATABASE_URL});
await client.connect();
const draft = await generateMigration(tables, {
	query: (text, values) => client.query(text, values),
	format: 'node-pg-migrate-ts',
});
await client.end();

if (!draft.hasChanges) {
	console.log('Definitions and database match.');
} else {
	writeFileSync(`migrations/${Date.now()}_${process.argv[2] ?? 'schema-change'}.ts`, draft.content);
	if (draft.needsReview) console.warn('Some steps are commented out and need a decision.');
}
```

Run it against a development database that already has every committed migration applied.

### Running the migrations with node-pg-migrate

This call was never run by the pg-lightquery tests. node-pg-migrate is not a dependency of this package. Treat the snippet as untested, and check it against the node-pg-migrate version you install.

```typescript
import {runner} from 'node-pg-migrate';

await runner({
	databaseUrl: process.env.DATABASE_URL!,
	dir: 'migrations',
	direction: 'up',
	migrationsTable: 'pgmigrations',
});
```

The generated files use only `pgm.sql` and an `up` export.

## Adopting the tools in a project with no migration tool yet

1. Run `checkSchemaDrift` against the existing database. Pass `ignoreExtraColumns: true` at first if the database has columns your definitions never declared.
2. Fix the definitions until the report is empty. At this stage the database is the truth, so change the definitions and not the database.
3. Add the check to CI, or run it at startup, so a later mismatch is caught at once.
4. From then on, edit the definitions first. Generate a draft for each change, review it, and apply it with your migration tool.

## Limits and failure modes

- Defaults are compared by presence only. PostgreSQL rewrites default expressions, so a changed default value is not detected and no step is generated for it.
- Composite unique constraints and composite foreign keys are not compared.
- The catalog queries need PostgreSQL 11 or newer. Adding an enum label inside a transaction needs PostgreSQL 12 or newer, and the new label cannot be used in the same migration.
- A name that contains a line break is rejected. This applies to tables, columns, types, enum labels, constraints and indexes, from a definition or from the database. `generateMigration` throws and names the value. PostgreSQL accepts such names, so a database that has one cannot be drafted until the name is changed. Default values may span lines.
- A column type outside the table above throws `Unknown column type`.
- Column names are matched exactly. An unquoted table name is folded to lower case, as PostgreSQL does.
- No down migration is generated.
