# Upgrading to 0.5.0

## Who needs this

Anyone on 0.4.x. The upgrade is not automatic. A caret range such as `^0.4.7` never installs 0.5.0, so you choose when to move.

0.5.0 has breaking changes. Each step below says how to find the code it affects, in any project.

Projects on 0.0.x use a different API. Read [Upgrading from 0.0.x](from-0.0.x.md) instead.

## What is new

- `ignoreUnknownKeys` for routes that pass request input. See [Filters: the allow-list](../features/filters.md#the-allow-list).
- `maxLimit` per table. See [Filters: maxLimit](../features/filters.md#maxlimit).
- Predefined SQL may end in its own `WHERE`, `GROUP BY` or `ORDER BY`, and `columnsToReturn` works with it. See [Filters: predefined SQL](../features/filters.md#predefined-sql).
- `null` clears a column. See [Writes: null and undefined](../features/writes.md#null-and-undefined).
- `onConflict: {target}` upserts on a unique column that is not the primary key. See [Writes: upserts](../features/writes.md#upserts).
- `QueryInputError`, one error class for every rejected input. See [Connection: errors](../features/connection.md#errors).
- An optional logger. See [Connection: logging](../features/connection.md#logging).
- More column types, each with a concrete TypeScript type. See [Schema: column types](../features/schema.md#column-types).
- `sqlExpression(...)` marks an SQL expression in a column default. See [Schema: defaults](../features/schema.md#defaults).
- `checkSchemaDrift` and `generateMigration`, served from `pg-lightquery/schema`. See [Schema](../features/schema.md).

## Before you start

1. Upgrade to 0.4.7 first, if you are on an older 0.4.x. See [Upgrading to 0.4.7](to-0.4.7.md).
2. Pin that version, for example `"pg-lightquery": "0.4.7"`.
3. Run your type check and your test suite.
4. Note the result. It is the baseline for the checks at the end.
5. Print `.query` for a few representative calls and keep the SQL. You compare it after the upgrade.

## Steps

### 1. Name the columns on every call

- **What changed.** `allowedColumns` has no default. `select`, `selectWithCustomSchema`, `insert`, `update` and every step of a chained insert throw without it. Before, a call without it allowed every column.
- **Find it.** Run the type check. It reports each call without `allowedColumns`.

  ```bash
  npx tsc --noEmit
  ```

  In a JavaScript project, search for the calls and for each step of a chain:

  ```bash
  grep -rnE "\.(select|insert|update|selectWithCustomSchema)\(" src
  grep -rnE "\.(insertWithReference|insertWithReferenceIf|updateWithReference|updateIf|insertIntoTable|updateTable)" src
  ```

- **Change it.** Pass a list. Pass `'*'` only when your own code builds the object.

  ```typescript
  // before
  this.update({options: {data: body, where: {id}}});
  createChainedInsert().insert('new_user', usersDb, userData, {returnField: '*'});

  // after
  this.update({allowedColumns: ['name', 'email'], options: {data: body, where: {id}}});
  createChainedInsert().insert('new_user', usersDb, userData, {allowedColumns: ['name', 'email'], returnField: '*'});
  ```

- **Check it.** Write a test that sends a field outside the list. The field is not written, and it cannot be filtered on.

### 2. Request input passed as `where`

- **What changed.** A `where` key whose column is not in `allowedColumns` throws. Before, it was dropped in silence.
- **Find it.** Search for request objects, and for any object spread into `where`:

  ```bash
  grep -rnE "req\.query|req\.body|ctx\.query" src
  grep -rnE "where: ?\{ ?\.\.\." src
  ```

- **Change it.** Four changes, per route:
  1. Pass an explicit column list as `allowedColumns`.
  2. Set `ignoreUnknownKeys: true` if the route should ignore extra parameters.
  3. Set `maxLimit` on the table definition.
  4. Map `QueryInputError` to HTTP 400 where your application handles errors.

  ```typescript
  // before
  this.select({allowedColumns: '*', options: {where: req.query}});

  // after
  this.select({
  	allowedColumns: ['id', 'name', 'email'],
  	options: {where: req.query, ignoreUnknownKeys: true, columnsToReturn: ['id', 'name']},
  });
  ```

  The full pattern is in [Filters: passing request input safely](../features/filters.md#passing-request-input-safely).

  This step needs a judgement call. The question to answer for each route: should an unknown parameter be ignored or rejected?
- **Check it.** A request with an unknown parameter gets the response you chose. A `limit` above the maximum gets 400.

### 3. `null` now writes NULL

- **What changed.** In insert and update data, only `undefined` is skipped. A `null` value writes `NULL`. Before, `null` was skipped like `undefined`.
- **Find it.** Search for every place where an object from outside your code becomes `data`. Typical sources are request bodies, webhook payloads and imported rows. Also search for `null` literals in `data`.

  ```bash
  grep -rnE "data: ?(req\.|body|payload|row)" src
  grep -rnE ": null" src
  ```

- **Change it.** Where `null` means "keep what is stored", remove the null keys before the call. Where `null` means "clear this column", change nothing.

  ```typescript
  // before: nulls in the payload were skipped
  this.update({allowedColumns: ['name', 'email'], options: {data: payload, where: {id}}});

  // after: keep the old behavior for this payload
  const data = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null));
  this.update({allowedColumns: ['name', 'email'], options: {data, where: {id}}});
  ```

  This step needs a judgement call. The question to answer for each site: what does `null` mean in this payload?

  Note for inserts: a `null` is now written as `NULL`, where it used to leave the column default in place.
- **Check it.** A test that updates with `null` clears the column. A test with the key removed leaves it alone.

### 4. `.null` and unknown operators

- **What changed.** `'<column>.null': true` means `IS NULL`, and `false` means `IS NOT NULL`. Before, boolean `true` meant `IS NOT NULL`. The strings `'true'` and `'false'` keep their meaning. An operator outside the supported list throws. Before, it fell back to equality.
- **Find it.** Search for `.null` and for where keys that contain a dot:

  ```bash
  grep -rnE "\.null['\"]" src
  grep -rnE "'[A-Za-z_]+\.[A-Za-z]+'" src
  ```

- **Change it.** Pass `false` where the old code passed boolean `true` and expected `IS NOT NULL`.

  ```typescript
  // before: boolean true produced IS NOT NULL
  {'email.null': true}

  // after
  {'email.null': false}
  ```

  The supported operators are `not`, `like`, `in`, `null`, `startDate`, `endDate` and `orderBy`. A filter on a JSON key is an object value: `{settings: {theme: 'dark'}}`.
- **Check it.** Print `.query.sqlText` for one call of each kind and read the clause.

### 5. Removed exports

- **What changed.** The default export, `QueryBuilder`, `pgUtilsDb`, `pgUtilsHelpers`, `CTETransactionBuilder`, `createCTETransaction`, `EnhancedCTEBuilder` and `createEnhancedCTE` are gone, with the types `CTEStep`, `CTEInsertConfig`, `CTEReference` and `CTEConfig`.
- **Find it.** Search the imports from `pg-lightquery`. The type check reports each one.

  ```bash
  grep -rnE "from 'pg-lightquery'" src
  ```

- **Change it.** Import `{TableBase}` by name. Replace either CTE builder with `createChainedInsert`.

  ```typescript
  // before
  import QueryBuilder from 'pg-lightquery';

  // after
  import {TableBase} from 'pg-lightquery';
  ```

  | Removed | Replacement |
  |---|---|
  | `import X from 'pg-lightquery'` | `import {TableBase} from 'pg-lightquery'` |
  | `QueryBuilder` | `TableBase` |
  | `pgUtilsDb`, `pgUtilsHelpers` | none. They were internals. |
  | `createCTETransaction()`, `createEnhancedCTE()` | `createChainedInsert()` |
  | `insertCTE({name, table, data, options})`, `addInsert({name, table, data, options})` | `insert(name, table, data, options)` |
  | `insertCTE` with `useValueFrom`, `addInsert` with `references` | `insertWithReference(name, table, data, {from, field, to}, options)` |
  | `conditionalInsertCTE({condition, ...})`, `addConditionalInsert(condition, config)` | `insertWithReferenceIf(condition, name, table, data, reference, options)` |
  | `finalSelect(cteName, columns)`, `build({cteName, columns})` | `selectFrom(cteName, columns)`, then `build()` |
  | `build()` | `build()`. It returns the same `{queries, execute}` shape. |

- **Check it.** The type check passes.

### 6. `update` no longer takes `predefinedSQL`

- **What changed.** `update` throws when it gets `predefinedSQL`. The option never worked: it joined two commands with a semicolon, and PostgreSQL rejects that in a prepared statement.
- **Find it.** Search for `predefinedSQL` next to `update`:

  ```bash
  grep -rn -B5 "predefinedSQL" src | grep -n "update"
  ```

- **Change it.** Run the update on its own, or send the whole statement through `PostgresConnection.query`.
- **Check it.** The call no longer throws.

### 7. Predefined SQL is wrapped, and `alias` is gone

- **What changed.** When `select` or `selectWithCustomSchema` adds a filter, a sort key, a paging key or a column list to predefined SQL, it wraps the predefined SQL as a subquery. Filters therefore apply to the columns of the predefined query's result. Before, the clause was appended to the predefined SQL. The `alias` option is removed.
- **Find it.** Search for `alias:` and for predefined SQL you wrapped in a subquery by hand:

  ```bash
  grep -rnE "alias:" src
  grep -rnE "SELECT \* FROM \(" src
  ```

  Also look for predefined SQL that ends in `WHERE 1=1` so a filter could be appended.
- **Change it.** Remove `alias`. Remove the hand-written wrapper if you want. Pass `.orderBy` when a filtered query must be ordered. Filter on result column names, not on names inside the predefined query.

  ```typescript
  // before: the filter was appended, so it needed the alias of the inner table
  this.select({allowedColumns: ['name'], predefinedSQL: {sqlText: 'SELECT * FROM users u'}, options: {where, alias: 'u'}});

  // after: the filter names a column of the result
  this.select({allowedColumns: ['name'], predefinedSQL: {sqlText: 'SELECT * FROM users u'}, options: {where}});
  ```

- **Check it.** Print `.query` for one filtered call and read the SQL.

### 8. `in` lists

- **What changed.** A list is sent as one array parameter: `"id" = ANY($1)`. An empty list returns no rows, where it failed before. A list above 10,000 values throws. A value that is neither an array nor a string throws.
- **Find it.** Search for `.in'`:

  ```bash
  grep -rnE "\.in['\"]" src
  ```

- **Change it.** Usually nothing. Code that skipped the query for an empty list can drop that guard. Code that reads `.query.values` now finds one array where it found one value per item.
- **Check it.** A call with an empty list returns no rows.

### 9. The library no longer logs

- **What changed.** The library prints nothing. Before, it wrote `Executed Query` for every statement and a `[SLOW ...]` line, with bound values, for slow ones.
- **Find it.** Check whether anything reads those lines: a log filter, an alert, a dashboard.
- **Change it.** Pass a logger to `initialize`.

  ```typescript
  PostgresConnection.initialize(config, {
  	logger: (entry) => console.log(entry.sqlText, entry.durationMs, entry.rowCount),
  	slowQueryMs: 500,
  });
  ```

- **Check it.** Your log shows one entry per statement, and no bound values.

### 10. Column types are now typed

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

### 11. Only the package entry points can be imported

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

### 12. String defaults are literals

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
2. Print `.query` for the same representative calls as before, and compare the SQL with what you kept. Expect three kinds of difference: `= ANY($n)` in place of `IN (...)`, a subquery around predefined SQL, and `NULL` written where a `null` value used to be skipped.
3. To roll back, pin `0.4.7`.
