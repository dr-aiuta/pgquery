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

Consumers on `^0.4.x` do not receive 0.5.0 automatically. apihigia and ocaproperties upgrade by hand, with the checklists at the end of this plan.

## Decisions

| Topic | Decision | Alternative | Why |
|---|---|---|---|
| `null` in data | Write NULL. Skip only `undefined`. | Keep skipping, add a marker for NULL | It matches SQL. It fixes S5. Both apps have a short, known list of sites to review. |
| Unknown where keys | Throw. `ignoreUnknownKeys: true` opts out. | Keep dropping | A misspelled filter must not widen a result. The 14 pass-through routes set the flag. |
| Unknown data keys | Keep dropping keys outside `allowedColumns` | Throw | Both apps spread objects with extra keys. The allow-list is the guard for writes. |
| `allowedColumns` | Required. `'*'` is valid when written out. | A per-column "secret" flag | A visible choice at each call site. Both apps already write `'*'` at almost every site. |
| `lastChangedBy` | Keep automatic | Opt-in per table | See §12. |
| Predefined SQL | Wrap as a subquery, remove `alias` | Keep appending | apihigia wraps by hand today. It removes an injection sink. |
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

Covers the `alias` part of S7. The wrapping is new, from apihigia.

Problem. `select` and `selectWithCustomSchema` append the generated WHERE to the predefined SQL (`database-operations.ts:167`, `:272`). That fails when the predefined SQL already has a WHERE, GROUP BY or ORDER BY. apihigia wraps its SQL as `SELECT * FROM (...) x` by hand to avoid this.

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

- ocaproperties has the column in all 9 tables and passes `idUser` on every write. Opt-in would stop its audit trail without an error.
- apihigia has no such column in any table. The behavior never triggers there.

Document the convention in the README instead. No code change.

### 13. Conflict target for upserts (new)

From ocaproperties. `onConflict: true` can only target the primary key. ocaproperties needs a unique column, and runs a collision check by hand at `tableBases/bookings.ts:92`.

Accept `onConflict: true | {target: (keyof T)[]}`. The target columns are validated against the schema. `true` keeps meaning the primary key.

### 14. One error class for bad input (new)

Export `QueryInputError extends Error`. Throw it for every validation failure: unknown key, unknown operator, bad `limit`, bad `orderBy`, bad `returnField`, missing `allowedColumns`.

An app can then map it to HTTP 400 in one place. Errors from Postgres still pass through unchanged.

## Considered and left out

| Idea | Source | Why not now |
|---|---|---|
| `delete()` | ocaproperties test notes | One mention. Raw SQL covers it. Revisit when a second app needs it. |
| Multi-row insert | ocaproperties "on hold" note | Same. |
| Batch updates in one transaction | apihigia `WebhookProcessor.ts:413` | `transaction().add()` already does this, and PR 1 makes it atomic. |
| Per-column "secret" flag | this review | Required allow-lists cover it with no new concept. |

## Done when

- CI is green, including new live cases for §3, §9 and §10.
- `CHANGELOG.md` has a 0.5.0 entry with one migration note per breaking change.
- The README documents `ignoreUnknownKeys`, `maxLimit`, the logger, `onConflict.target`, `QueryInputError` and the `lastChangedBy` convention.
- apihigia and ocaproperties compile against a local tarball of the branch after applying their checklists.

## Migration checklist: apihigia

Paths are under `/Users/dr/code/higia/apihigia`.

1. Add `allowedColumns` where it is omitted: the update at `contacts.ts:113`, and each step of the three chains at `charges.ts:223`, `transactions.ts:129` and `places.ts:65`.
2. Set `ignoreUnknownKeys: true` on the 12 routes that pass `req.query` as `where`. Examples are `contacts/controller.ts:16`, `deals/controller.ts:18` and `finance/accounts/controller.ts:20`. Replace `'*'` with an explicit list on each. `GET /finance/accounts` filters a table with personal data.
3. Do the same for the three custom-schema routes: `staffJobs.ts:123`, `otherExpenses.ts:149` and `trips.ts:196`.
4. Strip nulls before the update at `WebhookProcessor.ts:474-480`. The payment provider sends null for fields it does not know, and writing them would clear stored values.
5. Review the explicit nulls in chain inserts at `charges.ts:426`, `transactions.ts:157` and `:262`. They are skipped today and will be written.
6. Decide what null means on the six PATCH routes that pass the body as `data`. After the upgrade a null clears the column.
7. Map `QueryInputError` to 400 in the error middleware.
8. Optional: remove the hand-written `SELECT * FROM (...) x` wrappers.

Not affected: `charges.ts:258` spreads an array into update data. The keys `"0"`, `"1"` and so on are still dropped.

## Migration checklist: ocaproperties

Paths are under `/Users/dr/code/oca/ocaproperties`.

1. Add `allowedColumns` to the update at `tableBases/agreements.ts:73` and to both steps of the chain at `src/services/captures/insert.ts:111-139`. That update takes an unvalidated PATCH body, so use an explicit list.
2. Set `ignoreUnknownKeys: true` and an explicit list on the two pass-through routes: `services/bookings/select.ts:31` and `services/captures/select.ts:55`.
3. Check `services/bookings/select.ts:53`. It puts `platformName` and `checkInDate` into `where`. They must be columns of the predefined SQL's result.
4. Drop a null `idOcaBooking` before the bookings upsert (`adapters/gspreadsheet/index.ts:221`). Today the old value survives. After the upgrade a null would clear it.
5. Review the agreement inserts at `sync/captures/propertyCapture.ts:50`. They send null dates, which will be written as NULL.
6. Replace the collision check at `tableBases/bookings.ts:92` with `onConflict: {target: [...]}` if a unique constraint exists.
7. No change needed for `?x.null=true`. `src/app.ts:49` turns it into boolean `true`, which the library reads as IS NOT NULL today. After the upgrade it means IS NULL, which is what the client asked for.

New capability: the agreement PATCH at `services/captures/update.ts:33` can clear a date.

## Risks

- A missed null site clears data. The checklists name every site the survey found. Search for other spreads of external objects into `data` before upgrading.
- Wrapping predefined SQL changes query text for every filtered custom-schema call. The live suite must cover a join, a GROUP BY and a query with its own WHERE.
- `= ANY($1)` relies on Postgres inferring the array type from the column. The live suite covers integer, text and enum columns.
