# PR plans

Four plans, one per pull request. Together they cover every change cited in the architecture review of 2 October 2026 (commit `0cbac14`). They also fold in what a survey of the consuming repos found.

## Order and releases

| Order | Plan | Pull request | Release | Breaking | Effort |
|---|---|---|---|---|---|
| 1 | [01-safety.md](01-safety.md) | new | 0.4.7 | no | about 2 days |
| 2 | [04-schema-pr14.md](04-schema-pr14.md) | #14, open | 0.5.0 | TypeScript types only | about 2 days |
| 3 | [02-secure-defaults.md](02-secure-defaults.md) | new | 0.5.0 | yes | about 3 days |
| 4 | [03-tidy.md](03-tidy.md) | new | 0.5.1 | no for valid calls | about 2 days |

Effort is a rough estimate for one engineer who knows the code.

The order has three reasons.

- PR 1 goes first because Consumer A and Consumer B pick up 0.4.7 on their next install. It also adds the CI job with Postgres that the later PRs need.
- PR #14 merges before PR 2. It is already written, and PR 2 is easier to write on top of it than the reverse. Both ship together in 0.5.0, so consumers migrate once.
- PR 3 goes last. It moves files, and a file move conflicts with every other open branch.

## Documentation the PRs create

Each PR also writes user documentation. The docs live in `docs/`, and the root `README.md` links to every page. They are written for any project that uses the library. They never name a consuming app.

```
docs/
├── features/
│   ├── filters.md                   where operators, allow-lists, sorting, paging
│   ├── writes.md                    insert, upsert, update, null, returnField
│   ├── transactions-and-chains.md   transaction(), chained inserts and updates
│   ├── connection.md                initialize, logger, end(), errors
│   └── schema.md                    column types, sqlExpression, drift check, migration drafts
├── upgrading/
│   ├── to-0.4.7.md                  from any 0.4.x
│   ├── to-0.5.0.md                  from 0.4.x, breaking
│   ├── to-0.5.1.md                  from 0.5.0
│   └── from-0.0.x.md                from the old DatabaseManager API
└── plans/                           these plans, for maintainers
```

Which PR writes what:

| File | Created by | Extended by |
|---|---|---|
| `README.md`, new "Documentation" section | PR 1 | every later PR adds its links |
| `docs/upgrading/to-0.4.7.md` | PR 1 | |
| `docs/features/filters.md` | PR 1 | PR 2 |
| `docs/features/transactions-and-chains.md` | PR 1 | PR 3 |
| `docs/features/connection.md` | PR 1 | PR 2 |
| `docs/features/schema.md` | PR #14 | |
| `docs/upgrading/to-0.5.0.md` | PR #14 | PR 2 |
| `docs/features/writes.md` | PR 2 | PR 3 |
| `docs/upgrading/from-0.0.x.md` | PR 2 | |
| `docs/upgrading/to-0.5.1.md` | PR 3 | |

Each plan has a "Documentation" section with the outline of its pages.

### Rules for every page

- Write for a reader who has never seen the consuming projects. Use the `users`, `posts` and `addresses` fixtures from `tests/tables/` in every example.
- Mark each feature with the version that introduced it, as "Since 0.5.0".
- Document what is new or changed. The root README keeps the basics and links here for the rest.
- Use relative links. They resolve on GitHub. Check them on the npm package page after the first publish.
- Take every code example from a test that runs in CI. An example with no test behind it goes stale.

### Template for an upgrade guide

Each file in `docs/upgrading/` has the same five parts.

1. **Who needs this.** The versions it starts from, and whether the upgrade is automatic under a caret range.
2. **What is new.** One line per feature, each linking to its page in `docs/features/`.
3. **Before you start.** Pin the current version, run the test suite, and note the result.
4. **Steps.** One per breaking or behavior change. Every step has four fixed parts:
   - *What changed*, in one or two sentences.
   - *Find it*: a search command or a compiler error that locates affected code in any repo.
   - *Change it*: a before and after example.
   - *Check it*: how to confirm the change is right.
5. **After the upgrade.** The checks to run, and how to roll back by pinning the previous version.

A step that needs a judgement call says so. It states the question the reader must answer about their own code.

### Template for a feature page

- What it does, in two or three sentences.
- A minimal example.
- Options, in a table.
- Limits and failure modes.

### How the app checklists relate

PR 2 has one checklist for Consumer A and one for Consumer B. They are the generic guide applied to those two projects. Each checklist item names the step of `docs/upgrading/to-0.5.0.md` it comes from. The checklists describe private projects. They are kept outside this repository and are never copied into `docs/upgrading/`.

## Where the plans differ from the review

The review was written before the consumer survey. These points changed.

| Topic | Review said | Plans say | Why |
|---|---|---|---|
| PR #14 | Split it, release the generator in 0.6.0 | Fix it in place, release it whole in 0.5.0 | The fixes are about 2 days of work. One PR and one breaking release is simpler. Plan 04 keeps the split as a fallback. |
| `lastChangedBy` | Optionally make it opt-in | Keep it automatic, document it | Consumer B relies on it in all 9 tables. Consumer A has no such column. Opt-in would silently stop an audit trail. |
| `end()` | PR 2 | PR 1 | The live test suite cannot exit cleanly without it. |
| `alias` | Validate it | Remove it | No consumer uses it. Wrapping predefined SQL as a subquery makes it unnecessary. |
| `in` lists | Cap the length | Send one array parameter, plus a cap | It also fixes the syntax error on an empty list. |

The survey also added fixes the review did not have. They are marked "new" in the plans.

## Consumers

The consumers are private projects, named here by letter. Counts come from a code survey on 2 October 2026.

| Consumer | Version | Usage | Reached by |
|---|---|---|---|
| Consumer A | ^0.4.5 | 25 table classes, 3 chained inserts, 4 transactions, 12 routes that pass `req.query` as `where` | 0.4.7 automatically. 0.5.0 by hand. |
| Consumer B | ^0.4.6 | 8 table classes, 1 chained insert, direct `PostgresConnection.query` and `.transaction`, 2 routes that pass `req.query` | 0.4.7 automatically. 0.5.0 by hand. |
| Consumer C | ^0.4.5 | Declared, never loaded | Nothing to do. The dependency can be removed. |
| Consumer D | ^0.0.19 | One static select | No release reaches it. |
| Consumer E | ^0.0.17 | 8 models, 22 call sites | No release reaches it. |
| Consumer F | ^0.0.19 | 5 select call sites | No release reaches it. |
| Consumer G | ^0.0.19 | Declared, never imported | Nothing to do. |

A caret range on `0.0.x` matches one exact version. The 0.0.x repos use the old `DatabaseManager` API, which 0.4.x no longer has.

What the two active consumers rely on, and what the plans therefore protect:

- Named imports only: `TableBase`, `EnhancedTableBase`, `PostgresConnection`, `createChainedInsert`, `QueryObject`, `QueryParams`, `ColumnDefinition`, `SchemaToData`, `Mutable`, `TableDefinition`. These exports stay.
- `PostgresConnection.transaction(text, params)` in Consumer B. The signature stays.
- Raw pg errors. Consumer A checks `DatabaseError` code `23505`. The library never wraps errors.
- Keys in `data` that are outside `allowedColumns` are dropped. Both apps spread objects with extra keys. This stays.
- The chained-insert result shape. Consumer B reads `results[0].rows[0]`. This stays.
- The name-based chain methods `insertIntoTable`, `insertIntoTableWithReference` and `updateTable`. Consumer A uses them. These stay.

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

The survey also found problems inside the consuming projects. No pg-lightquery release fixes them. They concern private projects, so they are tracked outside this repository.
