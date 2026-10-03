# PR 1: Safety patch (0.4.7)

| | |
|---|---|
| Pull request | new, branch from `main` at `0cbac14` |
| Release | 0.4.7, patch |
| Breaking | no |
| Depends on | nothing |
| Effort | about 2 days |

## Goal

Make the library safe under load and fix the SQL it gets wrong, without changing its API.

apihigia (`^0.4.5`) and ocaproperties (`^0.4.6`) receive this release on their next install. Every change below must keep a call that works today working the same way.

## Consumer impact

| Consumer | Code change needed | What improves |
|---|---|---|
| apihigia | none | Its 4 `transaction().add().execute()` calls become atomic, for example `deals.ts:71` and `trips.ts:140`. `places.ts:142` stops producing two ORDER BY clauses when a client also sorts. |
| ocaproperties | none | The properties sync upsert at `src/services/sync/properties/index.ts:31` stops failing with an empty `DO UPDATE SET`. |
| ocacrm | none | It does not load the library. |
| 0.0.x repos | none | No release reaches them. |

Checked against the survey: every `returnField` in both apps is a literal column name or `'*'`, so §4 rejects nothing they send.

## Changes

### 1. Run every transaction on one client

Covers bug 1 and S6.

Problem. `executeTransactionQuery` (`src/utils/query-executor.ts:56-74`) sends BEGIN, each statement and COMMIT through `PostgresConnection.query` (`src/connection/postgres-connection.ts:26-52`). That method checks out a pool client per call. Under concurrent load the statements land on different connections.

Change.

- Add an overload `PostgresConnection.transaction(queries: QueryObject[])`. It checks out one client, runs BEGIN, each statement and COMMIT on it, and releases it in `finally`.
- On failure it runs ROLLBACK and rethrows the original error. If ROLLBACK itself fails, it calls `client.release(error)` so the pool destroys the client.
- Keep the existing form `transaction(text, params)`. ocaproperties calls it at `src/schema/postgres/tableBases/property_capture.ts:242`.
- Point `executeTransactionQuery` at the new overload. `transaction()`, ChainedInsertBuilder and both CTE builders already go through that function.
- Stop wrapping errors. The existing form does `throw new Error(e.message)` at `postgres-connection.ts:73`, which loses the pg error code. Rethrow the original instead. apihigia depends on `DatabaseError` code `23505` at `WebhookProcessor.ts:112` and `:216`.

Tests.

- Unit: a fake pool records which client received each statement. Assert one client gets BEGIN through COMMIT, and that it is released once.
- Live: run two transactions concurrently, one of which fails on its second statement. Assert the failed one left no row. Assert `pg_stat_activity` shows no session in `idle in transaction` afterwards.

### 2. Upsert fixes

Covers bug 3, plus two new findings from ocaproperties.

- Composite keys. `src/utils/query-builder.ts:86` joins the key columns inside one pair of quotes. Join with `'", "'` so each column is quoted on its own.
- Nothing to update (new). When every column in `data` is a key column, the builder emits `DO UPDATE SET` with nothing after it. Emit `ON CONFLICT (...) DO NOTHING` in that case. ocaproperties hits this today, and an unawaited loop hides the error.
- Nothing to insert (new). When `data` yields no columns, the builder emits `INSERT INTO t ("") VALUES ()`. Emit `INSERT INTO t DEFAULT VALUES` instead. The ocaproperties chain starts with `data: {}` and works only because the table has a `lastChangedBy` column.

Tests. Assert the SQL text for each case. Run each against Postgres: an upsert on a two-column key, an upsert that sends only the key, and an insert with empty data.

### 3. Sorting and pagination

Covers bugs 4 and 5, plus one new finding.

- Two orderBy keys. `orderByField` (`src/utils/helpers.ts:59`) adds the keyword each time. Make it push `"col" ASC`, and have `queryConstructor` (`src/core/query-constructor.ts:79`) write `ORDER BY` once. Keys keep their object order.
- offset. `queryConstructor` handles only `limit` (`query-constructor.ts:44`). Handle `offset` the same way, with the same non-negative integer check. Emit `LIMIT n OFFSET m` in that order.
- limit in `selectWithCustomSchema` (new). That method drops `limit` unless the allow-list is the bare wildcard (`src/core/database-operations.ts:153-157`). Add `limit` and `offset` to its allow-list, as `select` does at `:238`.

Tests. Assert SQL text for two sort keys, for limit with offset, and for limit in `selectWithCustomSchema` with an explicit list. Run each against Postgres.

### 4. Validate returnField

Covers S2.

Problem. Insert and update wrap `returnField` in double quotes and never compare it with the schema (`query-builder.ts:66-79` and `:128-141`). A value that contains a double quote appends any expression.

Change. Replace the two copies with one function, `returningClause(returnField, columns)`. It accepts `'*'`, a schema column, or an array of schema columns. Anything else throws. `DatabaseOperations` passes `this.schema.columns`.

Tests. Assert that a value with a double quote throws for insert and for update. Assert that `'*'`, one column and a list still produce the same SQL as before.

### 5. Package contents

Covers S10 and the tooling gap "the package ships whatever is on disk".

Add `"files": ["dist"]` to `package.json`. npm always adds `package.json` and `README.md`.

Check. `npm pack --dry-run` lists only `dist/`, `package.json` and `README.md`. Today it lists 222 files in a local checkout.

### 6. Release pipeline

Covers S10.

- `.github/workflows/publish.yml:40` expands `inputs.tag` and `github.ref_name` inside a shell script. Pass both through `env:` and read `"$TAG"` in the script.
- `publish.yml:36` installs `npm@latest` in a job that holds `id-token: write`. Pin the major version: `npm install -g npm@11`. Trusted Publishing needs 11.5.1 or newer.

### 7. Checks on every push and pull request

Covers the tooling gap "pull requests run no checks".

Add `.github/workflows/ci.yml`.

- Triggers: `push` to `main`, and `pull_request`.
- Permissions: `contents: read`.
- A `postgres` service container. Any version from 12 up works. PR #14's live tests need 12 or newer.
- Steps: checkout, Node 22, `npm ci`, `npx tsc --noEmit`, `npm test`.
- Set `PGLIGHTQUERY_TEST_DATABASE_URL` for the test step. PR #14 already uses this name for its live tests, so both suites share one convention.

### 8. Jest configuration

Covers the tooling gap "Jest runs other worktrees' tests".

- Add `roots: ['<rootDir>/tests']` to `jest.config.js`. Jest finds 52 test files today, and 36 are copies under `.claude/worktrees`.
- Delete `tests/integration/chained-insert-builder/index.test.ts`. It re-imports four suites, so their tests run twice.

Check. `npx jest --listTests` prints 15 files plus the new live suite.

### 9. Live Postgres suite, and `end()`

Covers the tooling gaps "no test reaches Postgres" and "the pool cannot be closed".

- Add `PostgresConnection.end()`, a static method that closes the pool and clears the singleton. The review placed it in PR 2. It moves here because the live suite cannot exit cleanly without it. It is additive.
- Add `tests/integration/live/`. Each file is skipped when `PGLIGHTQUERY_TEST_DATABASE_URL` is unset.
- Each file creates its own schema with a random name, runs inside it, and drops it in `afterAll`. Transaction tests need real commits, so a rollback wrapper is not enough.
- Cases: one per fix in §1 to §4. Add a round trip of insert, select and update. Add one case per where operator: `.not`, `.like`, `.in`, `.null`, the date range pair and a JSON key.

## Out of scope

| Item | Goes to |
|---|---|
| null handling, unknown keys, boolean `.null` | PR 2. They change behavior. |
| `alias` and the chained builder's names | PR 2 and PR 3. |
| Removing dependencies | PR 2. It needs a lockfile update. |
| Prettier, `noUnusedLocals`, file moves | PR 3. |

## Done when

- CI is green, including the live suite.
- `npm pack --dry-run` lists only the build, `package.json` and `README.md`.
- `CHANGELOG.md` has a 0.4.7 entry that lists each fix.
- The tag `v0.4.7` is pushed and the publish workflow succeeds.
- apihigia and ocaproperties install 0.4.7 and pass their own type check. ocaproperties also passes its integration suite with `RUN_INTEGRATION=true`.

## Risks

- The transaction overload changes the error a failed single-statement transaction throws. It was a plain `Error`. It becomes the original pg error, which is still an `Error` with the same message.
- `returnField` validation rejects a column that exists in the database and is missing from the table definition. Neither app does this today.
- The multi-key sort and offset fixes change SQL text only for calls that Postgres rejects today.
