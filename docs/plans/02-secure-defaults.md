# PR 2: Secure defaults and shrink (0.5.0)

| | |
|---|---|
| Pull request | new, branch from `main` after PR 1 and PR #14 are merged |
| Release | 0.5.0, together with PR #14 |
| Breaking | yes |
| Depends on | PR 1, PR #14 |
| Effort | about 3 days |

## Goal

Make the safe choice the default, remove what does not work, and put every breaking change in one release.

Consumers on `^0.4.x` do not receive 0.5.0 automatically. Consumer A and Consumer B upgrade by hand, each with its own checklist.

## Decisions

| Topic | Decision | Alternative | Why |
|---|---|---|---|
| `null` in data | Write NULL. Skip only `undefined`. | Keep skipping, add a marker for NULL | It matches SQL. It fixes S5. Both apps have a short, known list of sites to review. |
| Unknown where keys | Throw. `ignoreUnknownKeys: true` opts out. | Keep dropping | A misspelled filter must not widen a result. The 14 pass-through routes set the flag. |
| Unknown data keys | Keep dropping keys outside `allowedColumns` | Throw | Both apps spread objects with extra keys. The allow-list is the guard for writes. |
| `allowedColumns` | Required. `'*'` is valid when written out. | A per-column "secret" flag | A visible choice at each call site. Both apps already write `'*'` at almost every site. |
| `lastChangedBy` | Keep automatic | Opt-in per table | See §12. |
| Predefined SQL | Wrap as a subquery, remove `alias` | Keep appending | Consumer A wraps by hand today. It removes an injection sink. |
| `in` | One array parameter | Many placeholders with a cap | It fixes the empty-list error. |

## Changes

### 1. `allowedColumns` is required

Covers S1 and S3.

- Remove the default in `select`, `selectWithCustomSchema`, `insert` and `update` (`src/core/database-operations.ts:101`, `:147`, `:228`, `:314`). Remove the `?` from the option types in `src/utils/query-utils.ts:131` and `:163`. A missing value throws.
- `'*'` stays valid. The caller now has to write it.
- ChainedInsertBuilder passes `'*'` for every step (`src/utils/chained-insert-builder.ts:48`, `:85`, `:144`, `:183`). Add `allowedColumns` to each step's options and require it there too. One rule then holds everywhere: every write names its columns.

Tests. A call without `allowedColumns` throws for each method. A chained step with a list writes only those columns.

### 2. Filters fail closed

Covers S4 and bug 6.

- Unknown keys. `queryConstructor` drops a key that is not on the allow-list (`src/core/query-constructor.ts:43`). Throw instead.
- Opt-out. Add `ignoreUnknownKeys?: boolean` to the select options. When true, unknown column keys are dropped as today. Routes that pass a raw query string use it.
- Unknown operators. A suffix outside the supported list falls back to equality (`query-constructor.ts:65-67`). Throw instead, with or without `ignoreUnknownKeys`.
- `.null`. `true` and `'true'` mean IS NULL. `false` and `'false'` mean IS NOT NULL. Anything else throws. Today boolean `true` means IS NOT NULL (`src/utils/helpers.ts:97`). Add `'null'` to `ConditionSuffixes` in `src/types/core-types.ts:44`.

Tests. A misspelled key throws. The same key with `ignoreUnknownKeys` is dropped. `age.gte` throws in both modes. All four `.null` inputs produce the right clause.

### 3. `null` writes NULL

Covers bug 2 and S5.

`extractInsertAndUpdateAssignmentParts` and `extractUpdateParts` skip `null` (`src/utils/query-utils.ts:35`, `:77`). Skip only `undefined`.

Tests. An update with `{c: null}` produces `SET "c" = $1` with a null value. `{c: undefined}` is skipped. Run both against Postgres.

This is the change with the most consumer impact. See the checklists.

### 4. Delete the two stub builders

- Delete `src/utils/cte-transaction-builder.ts` and `src/utils/enhanced-cte-builder.ts`.
- Remove their exports from `src/index.ts:36-39`: `EnhancedCTEBuilder`, `createEnhancedCTE`, `CTETransactionBuilder`, `createCTETransaction`, `CTEReference`, `CTEConfig`, `CTEStep`, `CTEInsertConfig`.

Neither app uses them. They have no tests and no README section.

### 5. Remove `predefinedSQL` from update

Covers bug 8.

`update()` joins the predefined SQL and the UPDATE with a semicolon (`database-operations.ts:366-393`). Postgres rejects two commands in one prepared statement. Remove the option from the update input type and delete the branch. Neither app uses it.

### 6. One name per export

- Keep the named export `TableBase`. Remove the default export and the `QueryBuilder` alias (`src/index.ts:45`, `:48`).
- Remove `pgUtilsDb` and `pgUtilsHelpers` (`src/index.ts:30-31`).

Neither app uses any of the four. Both import by name only.

### 7. Remove unused dependencies

Covers S10.

- Remove `sql-ddl-to-json-schema` from `dependencies`. Nothing imports it, and it installs three more packages into every consumer.
- Remove `mocklogs` once §8 lands.
- Remove `@types/json-schema` from `devDependencies`.

Updating `package-lock.json` needs network access. Ask before running it.

### 8. Optional logger, silent by default

Covers S8 and the tooling gap "the library logs every query".

- `PostgresConnection.initialize(config, options?)` takes `options.logger` and `options.slowQueryMs`.
- The logger receives the SQL text, the duration and the row count. It never receives bound values.
- Without a logger the library prints nothing. Remove every `console.*` and `loggerMock` call from `src/connection/postgres-connection.ts` and `src/utils/query-executor.ts`.

Both apps log in their own wrappers and do not read the library's output. Passing their logger once at `initialize` lets them shorten those wrappers later.

### 9. Wrap predefined SQL as a subquery, and remove `alias`

Covers the `alias` part of S7. The wrapping is new, from Consumer A.

Problem. `select` and `selectWithCustomSchema` append the generated WHERE to the predefined SQL (`database-operations.ts:167`, `:272`). That fails when the predefined SQL already has a WHERE, GROUP BY or ORDER BY. Consumer A wraps its SQL as `SELECT * FROM (...) x` by hand to avoid this.

Change.

- When the generated clause is not empty, emit `SELECT <columns> FROM (<predefined>) AS q <clause>`. When it is empty, send the predefined SQL as it is.
- `columnsToReturn` then also works with predefined SQL.
- Remove the `alias` option. It is raw text in the SQL (`query-constructor.ts:35`), and no app uses it.

Tests. Predefined SQL with its own WHERE plus a filter runs against Postgres. Predefined SQL with no filter is sent unchanged.

Risk. Wrapping moves an ORDER BY inside the subquery. Postgres keeps that order for a plain outer filter in practice, but the standard does not promise it. Callers that need an order should pass `.orderBy`.

### 10. `in` sends one array parameter

Covers S9. The empty-list fix is new.

`inField` builds one placeholder per value (`helpers.ts:73-84`). An empty list produces `IN ()`, which is a syntax error. Emit `"col" = ANY($n)` with the array as one parameter. Comma-separated strings are still split. Throw above 10,000 values.

Tests. An empty list returns no rows. A list of integers, of strings and of enum values each match against Postgres.

### 11. Optional `maxLimit` per table

Covers S9.

Add `maxLimit?: number` to `TableDefinition`. A `limit` above it throws. Without it, behavior is unchanged. Routes that pass a raw query string are the intended users.

### 12. `lastChangedBy` stays automatic

The review listed opt-in as optional. The survey decides against it.

- Consumer B has the column in all 9 tables and passes `idUser` on every write. Opt-in would stop its audit trail without an error.
- Consumer A has no such column in any table. The behavior never triggers there.

Document the convention in the README instead. No code change.

### 13. Conflict target for upserts (new)

From Consumer B. `onConflict: true` can only target the primary key. Consumer B needs a unique column, and runs a collision check by hand.

Accept `onConflict: true | {target: (keyof T)[]}`. The target columns are validated against the schema. `true` keeps meaning the primary key.

### 14. One error class for bad input (new)

Export `QueryInputError extends Error`. Throw it for every validation failure: unknown key, unknown operator, bad `limit`, bad `orderBy`, bad `returnField`, missing `allowedColumns`.

An app can then map it to HTTP 400 in one place. Errors from Postgres still pass through unchanged.

### 15. Documentation

This PR writes most of the 0.5.0 documentation. The structure and the page templates are in the [plans index](README.md#documentation-the-prs-create). The guide must work for a project the maintainers have never seen, so every step says how to find affected code.

`docs/upgrading/to-0.5.0.md`

PR #14 created this file with three steps. Add the steps below and put all of them in this order. Each step has the four fixed parts.

1. **Name the columns on every call.**
   - *What changed*: `allowedColumns` has no default.
   - *Find it*: run the type check. It reports each call without it. In a JavaScript project, search for `.select(`, `.insert(`, `.update(` and `selectWithCustomSchema(`, and for each step of a chain.
   - *Change it*: pass a list. Pass `'*'` only when your own code builds the object.
   - *Check it*: a test that sends a field outside the list shows it is not written or filtered.
2. **Request input passed as `where`.**
   - *What changed*: an unknown key throws.
   - *Find it*: search for `req.query`, `req.body` and `ctx.query`, and for any object spread into `where`.
   - *Change it*: pass an explicit column list. Set `ignoreUnknownKeys: true` if the route should ignore extra parameters. Set `maxLimit` on the table. Map `QueryInputError` to HTTP 400.
   - *Check it*: a request with an unknown parameter gets the response you chose. A `limit` above the maximum gets 400.
   - The question to answer for each route: should an unknown parameter be ignored or rejected?
3. **`null` now writes NULL.**
   - *What changed*: only `undefined` is skipped.
   - *Find it*: search for every place where an object from outside your code becomes `data`. Typical sources are request bodies, webhook payloads and imported rows. Also search for `null` literals in `data`.
   - *Change it*: where null means "keep what is stored", remove the null keys before the call. Where null means "clear this column", change nothing.
   - *Check it*: a test that updates with `null` clears the column. A test with the key removed leaves it alone.
   - The question to answer for each site: what does null mean in this payload?
   - Note for inserts: a null is now written as NULL, where it used to leave the column default in place.
4. **`.null` and unknown operators.**
   - *What changed*: `.null: true` means IS NULL. A suffix outside the supported list throws.
   - *Find it*: search for `.null` and for where keys that contain a dot.
   - *Change it*: pass `false` where the old code passed boolean `true` and expected IS NOT NULL.
5. **Removed exports.**
   - *What changed*: the default export, `QueryBuilder`, `pgUtilsDb`, `pgUtilsHelpers`, `CTETransactionBuilder` and `EnhancedCTEBuilder` are gone.
   - *Find it*: search the imports from `pg-lightquery`. The type check reports each one.
   - *Change it*: import `{TableBase}` by name. Replace either CTE builder with `createChainedInsert`. The guide carries a table that maps each removed method to its replacement.
6. **`update` no longer takes `predefinedSQL`.**
   - *Find it*: search for `predefinedSQL` next to `update`.
   - *Change it*: run the update on its own, or send the whole statement through `PostgresConnection.query`.
7. **Predefined SQL is wrapped, and `alias` is gone.**
   - *What changed*: filters apply to the columns of the predefined query's result.
   - *Find it*: search for `alias:` and for predefined SQL you wrapped in a subquery by hand.
   - *Change it*: remove `alias`. Remove the hand-written wrapper if you want. Pass `.orderBy` when a filtered query must be ordered.
   - *Check it*: print `.query` for one filtered call and read the SQL.
8. **`in` lists.**
   - *What changed*: an empty list returns no rows, where it failed before. A list above 10,000 values throws.
   - *Find it*: search for `.in'`.
9. **The library no longer logs.**
   - *Find it*: check whether anything reads the `Executed Query` or slow-query lines.
   - *Change it*: pass a logger to `initialize`.

After the upgrade: run the type check and the tests. Then print `.query` for a few representative calls on the old and the new version and compare the SQL. To roll back, pin `0.4.7`.

`docs/features/filters.md`, extended

- The operator table, including what `.null` accepts.
- The allow-list, what happens to an unknown key, and `ignoreUnknownKeys`.
- `in` with arrays and with comma-separated strings.
- `maxLimit`.
- Predefined SQL: how it is wrapped, and that filters name result columns.
- A section "Passing request input safely" that puts the four pieces together: an explicit list, `ignoreUnknownKeys`, `maxLimit`, and a 400 for `QueryInputError`.

`docs/features/writes.md`, new

- `allowedColumns` for writes, and that keys outside it are dropped.
- `null` against `undefined`.
- Upserts: `onConflict: true`, `onConflict: {target}`, and what happens when there is nothing to update.
- `returnField`.
- The `lastChangedBy` convention from §12: a table with a column of that name gets `idUser` written to it on every insert and update.

`docs/features/connection.md`, extended

- The `logger` and `slowQueryMs` options, and that a logger never receives bound values.
- Errors: `QueryInputError` for bad input, and pg errors passed through unchanged with their `code`.

`docs/upgrading/from-0.0.x.md`, new

For projects on the old `DatabaseManager(dbConfig, modelsConfig)` API. No release reaches them through a caret range, so this guide is the only path.

- Who needs this, and why now: 0.0.x writes `limit`, the `orderBy` direction and JSON keys into the SQL text unescaped. A project that lets request input reach a where object should upgrade, or validate that input first.
- A stopgap for projects that cannot upgrade yet: check that `limit` is an integer, that a sort direction is `ASC` or `DESC`, and that every key is a known column, before the object reaches the library.
- A table that maps the old API to the new one: the models config to one table definition and one `TableBase` class per table, a named query with its own SQL to `select` with `predefinedSQL`, and `(allowedColumns, whereObj)` to `allowedColumns` and `options.where`.
- Differences in behavior to check: how a `null` value filters, how `limit` is allowed, and how `.in` splits a string.
- Steps: initialize the connection, write the table definitions, write one class per model, move one query at a time, and compare `.query` output with the old SQL for each.

Verify every row of the mapping table against the 0.0.19 source before publishing. The outline above comes from a survey of three consumers, and nobody has run a migration yet.

`README.md`

- Add the links for the new pages and the rows for 0.5.0 and 0.0.x to the upgrade table.
- Shorten "Smart Query Operators", "Security & Projection Control" and "Safe Update Operations" to a few lines each, with links to the feature pages.

## Considered and left out

| Idea | Source | Why not now |
|---|---|---|
| `delete()` | Consumer B test notes | One mention. Raw SQL covers it. Revisit when a second app needs it. |
| Multi-row insert | Consumer B "on hold" note | Same. |
| Batch updates in one transaction | Consumer A | `transaction().add()` already does this, and PR 1 makes it atomic. |
| Per-column "secret" flag | this review | Required allow-lists cover it with no new concept. |

## Done when

- CI is green, including new live cases for §3, §9 and §10.
- `CHANGELOG.md` has a 0.5.0 entry with one migration note per breaking change.
- The pages in §15 exist. Together they document `ignoreUnknownKeys`, `maxLimit`, the logger, `onConflict.target`, `QueryInputError` and the `lastChangedBy` convention. The README links to each page, and the changelog entry links to the guide.
- Someone who has only `docs/upgrading/to-0.5.0.md` can produce the two consumer checklists from the two projects. That is the test that the guide is general enough.
- Consumer A and Consumer B compile against a local tarball of the branch after applying their checklists.

## Migration checklists

There is one checklist per consumer: `docs/upgrading/to-0.5.0.md` applied to Consumer A and to Consumer B. Each item ends with the guide step it comes from. The checklists describe private projects, so they are kept outside this repository.

## Risks

- A missed null site clears data. The checklists name every site the survey found. Search for other spreads of external objects into `data` before upgrading.
- Wrapping predefined SQL changes query text for every filtered custom-schema call. The live suite must cover a join, a GROUP BY and a query with its own WHERE.
- `= ANY($1)` relies on Postgres inferring the array type from the column. The live suite covers integer, text and enum columns.
