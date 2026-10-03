# PR plans

Four plans, one per pull request. Together they cover every change cited in the architecture review of 2 October 2026 (commit `0cbac14`). They also fold in what a survey of the consuming repos found.

## Order and releases

| Order | Plan | Pull request | Release | Breaking | Effort |
|---|---|---|---|---|---|
| 1 | [01-safety.md](01-safety.md) | new | 0.4.7 | no | about 2 days |
| 2 | [04-schema-pr14.md](04-schema-pr14.md) | #14, open | 0.5.0 | TypeScript types only | about 2 days |
| 3 | [02-secure-defaults.md](02-secure-defaults.md) | new | 0.5.0 | yes | about 3 days |
| 4 | [03-tidy.md](03-tidy.md) | new | 0.5.1 | no | about 2 days |

Effort is a rough estimate for one engineer who knows the code.

The order has three reasons.

- PR 1 goes first because apihigia and ocaproperties pick up 0.4.7 on their next install. It also adds the CI job with Postgres that the later PRs need.
- PR #14 merges before PR 2. It is already written, and PR 2 is easier to write on top of it than the reverse. Both ship together in 0.5.0, so consumers migrate once.
- PR 3 goes last. It moves files, and a file move conflicts with every other open branch.

## Where the plans differ from the review

The review was written before the consumer survey. These points changed.

| Topic | Review said | Plans say | Why |
|---|---|---|---|
| PR #14 | Split it, release the generator in 0.6.0 | Fix it in place, release it whole in 0.5.0 | The fixes are about 2 days of work. One PR and one breaking release is simpler. Plan 04 keeps the split as a fallback. |
| `lastChangedBy` | Optionally make it opt-in | Keep it automatic, document it | ocaproperties relies on it in all 9 tables. apihigia has no such column. Opt-in would silently stop an audit trail. |
| `end()` | PR 2 | PR 1 | The live test suite cannot exit cleanly without it. |
| `alias` | Validate it | Remove it | No consumer uses it. Wrapping predefined SQL as a subquery makes it unnecessary. |
| `in` lists | Cap the length | Send one array parameter, plus a cap | It also fixes the syntax error on an empty list. |

The survey also added fixes the review did not have. They are marked "new" in the plans.

## Consumers

Paths are under `/Users/dr/code`. Counts come from a code survey on 2 October 2026.

| Repo | Version | Usage | Reached by |
|---|---|---|---|
| `higia/apihigia` | ^0.4.5 | 25 table classes, 3 chained inserts, 4 transactions, 12 routes that pass `req.query` as `where` | 0.4.7 automatically. 0.5.0 by hand. |
| `oca/ocaproperties` | ^0.4.6 | 8 table classes, 1 chained insert, direct `PostgresConnection.query` and `.transaction`, 2 routes that pass `req.query` | 0.4.7 automatically. 0.5.0 by hand. |
| `oca/ocacrm` | ^0.4.5 | Declared, never loaded | Nothing to do. The dependency can be removed. |
| `oca/apioca` | ^0.0.19 | One static select | No release reaches it. |
| `oca/ocafinance` | ^0.0.17 | 8 models, 22 call sites | No release reaches it. |
| `oca/ocawarriors` | ^0.0.19 | 5 select call sites | No release reaches it. |
| `oca/ocawebscraper` | ^0.0.19 | Declared, never imported | Nothing to do. |

A caret range on `0.0.x` matches one exact version. The 0.0.x repos use the old `DatabaseManager` API, which 0.4.x no longer has.

What the two active consumers rely on, and what the plans therefore protect:

- Named imports only: `TableBase`, `EnhancedTableBase`, `PostgresConnection`, `createChainedInsert`, `QueryObject`, `QueryParams`, `ColumnDefinition`, `SchemaToData`, `Mutable`, `TableDefinition`. These exports stay.
- `PostgresConnection.transaction(text, params)` in ocaproperties. The signature stays.
- Raw pg errors. apihigia checks `DatabaseError` code `23505`. The library never wraps errors.
- Keys in `data` that are outside `allowedColumns` are dropped. Both apps spread objects with extra keys. This stays.
- The chained-insert result shape. ocaproperties reads `results[0].rows[0]`. This stays.
- The name-based chain methods `insertIntoTable`, `insertIntoTableWithReference` and `updateTable`. apihigia uses them. These stay.

## Decisions to confirm

Each plan records its decisions. These are the ones with real consequences for the two apps.

| Decision | Recommended | Alternative | Plan |
|---|---|---|---|
| `null` in insert or update data | Write NULL. Skip only `undefined`. | Keep skipping null and add an explicit marker for NULL. | 02 §3 |
| Unknown `where` keys | Throw. Pass-through routes set `ignoreUnknownKeys: true`. | Keep dropping them silently. | 02 §2 |
| `allowedColumns` | Required everywhere. `'*'` stays valid when written out. | Keep the default and add a per-column "secret" flag. | 02 §1 |
| PR #14 | Fix in place, ship in 0.5.0. | Split out `generateMigration` and ship it later. | 04 |

## Coverage

Every change cited in the review, and where it lands.

| Review item | Plan |
|---|---|
| Bug 1, transactions split across connections | 01 §1 |
| Bug 2, null is silently ignored | 02 §3 |
| Bug 3, composite keys break ON CONFLICT | 01 §2 |
| Bug 4, two orderBy keys | 01 §3 |
| Bug 5, offset becomes a filter | 01 §3 |
| Bug 6, unknown operators and `.null: true` | 02 §2 |
| Bug 7, ChainedInsertBuilder regex rewriting and step order | 03 §2 |
| Bug 8, update with predefinedSQL | 02 §5 |
| S1, every column filterable by default | 02 §1 |
| S2, returnField unchecked | 01 §4 |
| S3, writes accept every column | 02 §1 |
| S4, filters fail open | 02 §2 |
| S5, clearing a secret with null | 02 §3 |
| S6, transactions mix requests | 01 §1 |
| S7, alias and builder names are raw SQL | 02 §9 (alias), 03 §1 (the rest) |
| S8, logs print bound values | 02 §8 |
| S9, no ceiling on result size | 02 §10, §11 |
| S10, unused dependency | 02 §7 |
| S10, workflow inputs and unpinned npm | 01 §6 |
| S10, missing `files` field | 01 §5 |
| P1, review-only steps can become live | 04 §1 |
| P2, default heuristic | 04 §2 |
| PR #14, `default: null` reports drift forever | 04 §3 |
| PR #14, missing ADD VALUE on an existing enum type | 04 §4 |
| PR #14, type changes need 0.5.0 and a changelog entry | 04 §8 |
| PR #14, ship schema features as `pg-lightquery/schema` | 04 §7 |
| PR #14, review branches covered only by live tests | 04 §9 |
| Delete CTETransactionBuilder and EnhancedCTEBuilder | 02 §4 |
| Return-type overrides in EnhancedChainedInsertBuilder | 03 §4 |
| Unused helpers in query-builder.ts | 03 §8 |
| Remove query-executor.ts | 03 §8 |
| Remove `sql-ddl-to-json-schema` and `mocklogs` | 02 §7 |
| Placeholder renumbering written six times | 03 §6 |
| predefinedSQL merge block written three times | 03 §7 |
| Merge select and selectWithCustomSchema | 03 §7 |
| TableBase exported under three names | 02 §6 |
| `pgUtilsDb` and `pgUtilsHelpers` on the public API | 02 §6 |
| Package ships whatever is on disk | 01 §5 |
| Pull requests run no checks | 01 §7 |
| No test reaches Postgres | 01 §9 |
| Jest runs worktree copies, `index.test.ts` runs suites twice | 01 §8 |
| Enable `noUnusedLocals` | 03 §12 |
| Library logs every query | 02 §8 |
| Prettier configured but not installed | 03 §13 |
| Pool cannot be closed | 01 §9 |
| Folder layout, `sql/` purity rule | 03 §9 |
| Option types belong in `types` | 03 §9 |
| Rename `tests/integration` | 03 §11 |
| `tests/examples` and `tests/unit/example.ts` | 03 §11 |
| Remove the `@/` path alias | 03 §10 |
| Merge EnhancedTableBase into TableBase | 03 §5 |
| Merge name-based chained methods into one builder | 03 §4 |
| `lastChangedBy` opt-in | 02 §12, decided against |
| Optional maximum for `limit` | 02 §11 |
| Cap `in` lists | 02 §10 |
| Per-query console logging cut | 02 §8 |

## Consumer follow-ups outside these plans

These are problems in the consuming repos. No pg-lightquery release fixes them. The first three are security issues.

1. **ocawarriors and ocafinance can be exploited today.** Both run 0.0.x, which puts `limit` and the `.orderBy` direction into the SQL text unescaped. Both pass the whole `req.query` as the where object, on routes without authentication. Both also interpolate request values in their own SQL, for example `ocawarriors/utils/databases/postgres/pgConfig.js:277`. Leaving them pinned does not remove the injection. The options are a `0.0.20` backport of the advisory fix, or validating `req.query` in each app. Either one needs an edit in each repo.
2. **ocaproperties interpolates a request value into SQL.** `src/services/properties/select.ts:141` builds `"idProperty" = ${params.idProperty}`. `src/services/sync/captures/propertyLeaving.ts:32` does the same with a spreadsheet value. Both should use bound parameters.
3. **ocaproperties has a stale install.** Its lockfile pins 0.4.6, but the local `node_modules` holds 0.4.5, which predates the advisory fix. A fresh `npm ci` corrects it.
4. **ocacrm and ocawebscraper declare the dependency and never use it.** Remove it.
5. **apihigia has bugs the survey found in passing.** A chain's `execute()` is never awaited at `banks/charges/insert.ts:207`. `charges.ts:152` passes values to SQL that has no placeholder. `chargesRef.ts:144` ignores its id. Five default `orderBy` setters run after the query is built, for example `contacts.ts:33`. Four wrappers ignore their `allowedColumns` argument, for example `charges.ts:121`.

Items 1 and 2 were confirmed by reading the cited lines. The rest come from the survey and were not re-checked.
