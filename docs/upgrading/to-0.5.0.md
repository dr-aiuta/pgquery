# Upgrading to 0.5.0

## Who needs this

Anyone on 0.4.x. The upgrade is not automatic. A caret range such as `^0.4.7` never installs 0.5.0, so you choose when to move.

0.5.0 has breaking changes. Each step below says how to find the code it affects.

## What is new

- More column types, and each one maps to a concrete TypeScript type. See [Schema: column types](../features/schema.md#column-types).
- `sqlExpression(...)` marks an SQL expression in a column default. See [Schema: defaults](../features/schema.md#defaults).
- Typed foreign keys with `references`, and `enumTypeName` for enum columns. See [Schema: foreign keys and enum types](../features/schema.md#foreign-keys-and-enum-types).
- `checkSchemaDrift` compares your table definitions with a live database. See [Schema: checkSchemaDrift](../features/schema.md#checkschemadrift).
- `generateMigration` drafts a migration from the differences. See [Schema: generateMigration](../features/schema.md#generatemigration).
- The schema tools are served from a second entry point, `pg-lightquery/schema`.

## Before you start

1. Upgrade to 0.4.7 first, if you are on an older 0.4.x. See [Upgrading to 0.4.7](to-0.4.7.md).
2. Pin that version, for example `"pg-lightquery": "0.4.7"`.
3. Run your type check and your test suite.
4. Note the result. It is the baseline for the checks at the end.

## Steps

### Column types are now typed

- **What changed.** Column types such as `BOOLEAN`, `UUID`, `BIGINT`, `JSON` and `JSONB` now map to concrete TypeScript types. Before, a column of such a type accepted any value. Code that passed any value for those columns may stop compiling.
- **Find it.** Run the type check. Each error names the column.

  ```bash
  npx tsc --noEmit
  ```

- **Change it.** Fix the type of the value, or remove a cast that is no longer needed.

  ```typescript
  // A users definition with a BOOLEAN and a UUID column
  const accountColumns = {
  	...usersColumns,
  	externalId: {type: 'UUID'},
  	active: {type: 'BOOLEAN'},
  } as const;
  type AccountData = Mutable<SchemaToData<typeof accountColumns>>;

  // before: compiled on 0.4.x, because BOOLEAN and UUID were not typed
  const data: Partial<AccountData> = {active: 'yes', externalId: 7};

  // after: BOOLEAN is boolean, UUID is string
  const data: Partial<AccountData> = {active: true, externalId: '7f1b0c0e-8f43-4a36-9a5e-0d7d6f0f1a11'};
  ```

  A typed column also stops taking `null` unless its type allows it. `{active: null}` no longer compiles.

  `BIGINT` is `string | number`, because node-postgres returns it as a string. `JSON` and `JSONB` are `unknown` and need a cast when you read them. The full table is in [Schema: column types](../features/schema.md#column-types).
- **Check it.** The type check passes, with fewer `as any` casts than before.

### Only the package entry points can be imported

- **What changed.** The package now has an `exports` map. Only `pg-lightquery` and `pg-lightquery/schema` can be imported. An import of an inner path such as `pg-lightquery/dist/...` fails.
- **Find it.** Search for `pg-lightquery/` followed by anything other than `schema`:

  ```bash
  grep -rnE "pg-lightquery/[^s'\"]|pg-lightquery/s[^c]" src
  ```

- **Change it.** Import from one of the two entry points.

  ```typescript
  // before
  import {TableBase} from 'pg-lightquery/dist/core/table-base';

  // after
  import {TableBase} from 'pg-lightquery';
  import {checkSchemaDrift} from 'pg-lightquery/schema';
  ```

- **Check it.** The type check passes and the process starts. A blocked import fails at load time with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

### String defaults are literals

- **What changed.** A string `default` in a table definition is a literal value. Four strings are still read as SQL expressions: `now()`, `CURRENT_TIMESTAMP`, `CURRENT_DATE` and `gen_random_uuid()`, in any case. No query reads `default`. It matters only to `checkSchemaDrift` and `generateMigration`.
- **Find it.** Search the table definitions for `default:` with a string value:

  ```bash
  grep -rnE "default: ?['\"]" src
  ```

- **Change it.** Wrap an expression in `sqlExpression(...)`.

  ```typescript
  import {sqlExpression} from 'pg-lightquery';

  // before: meant as an expression, now read as the string 'current_user'
  owner: {type: 'TEXT', default: 'current_user'},

  // after
  owner: {type: 'TEXT', default: sqlExpression('current_user')},
  ```

  This step needs a judgement call. The question to answer for each string default: is it a value, or SQL to evaluate?
- **Check it.** Generate a draft for a new table and read the `DEFAULT` clauses. See [Schema: defaults](../features/schema.md#defaults).

## After the upgrade

1. Run your type check and your test suite again. Compare the result with the baseline.
2. To roll back, pin `0.4.7`.
