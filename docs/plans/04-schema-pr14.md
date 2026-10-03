# PR #14: Schema drift and migration drafts (0.5.0)

| | |
|---|---|
| Pull request | [#14](https://github.com/dr-aiuta/pgquery/pull/14), open, branch `worktree-migration-bridge` at `0f8235f` |
| Release | 0.5.0, together with PR 2 |
| Breaking | TypeScript types only |
| Depends on | PR 1, for the CI job with Postgres |
| Effort | about 2 days |

## Goal

Make PR #14 safe to merge, and ship it whole in 0.5.0.

The PR adds column types, typed foreign keys, `sqlExpression`, `checkSchemaDrift` and `generateMigration`. Its query path is untouched, its catalog queries are constant SQL with bound names, and its generated DDL quotes and escapes correctly. One defect blocks the merge: a review-only step can become live. This plan lists what must change in the PR before it merges.

## Decision

| Option | What it means | Verdict |
|---|---|---|
| Fix in place | Add the fixes below to this PR. Merge it after PR 1. Release in 0.5.0. | Recommended |
| Split | Move `generateMigration` to a second PR. Ship the rest in 0.5.0 and the generator in 0.6.0. | Fallback |

The review recommended the split. Fixing in place is simpler: one PR, one breaking release, and the generator still never ships with the defect. Fall back to the split only if §1 is not done when PR 2 is ready to release.

## Consumer impact

Neither active app has a migration tool, so both gain from this PR.

| Consumer | Situation | What they gain |
|---|---|---|
| apihigia | Schema managed by hand. `dev/pending-improvements.md` lists adopting node-pg-migrate as item 14. No tests. | `generateMigration` drafts node-pg-migrate files from the 25 table definitions. `checkSchemaDrift` catches a definition that no longer matches the database. |
| ocaproperties | No migration tool. Table DDL lives in a legacy repo. | `checkSchemaDrift` in CI, against its 9 table definitions. |

What the survey found in their definitions, and what it means here:

- apihigia uses `TIMESTAMPTZ` and `TIME WITHOUT TIME ZONE`. The PR knows neither. See §6.
- apihigia has `default: 'CURRENT_TIMESTAMP'` at `tableDefinitions/tasks.ts:60` and `default: true` at `:55`. See §2.
- ocaproperties uses `UUID` in 9 columns and `BOOLEAN` in 2. The PR gives both a concrete TypeScript type. See §8.
- Both apps resolve modules with `Node16`, so a `pg-lightquery/schema` subpath resolves with its types. Neither imports a deep path. See §7.

## Changes needed in the PR

Line numbers refer to the PR branch at `0f8235f`.

### 1. Review-only steps must stay inert

Covers P1. This blocks the merge.

Problem. The generator comments out every destructive step. It writes the review note raw (`src/schema/migration-generator.ts:499`, `:511`) and prefixes the SQL line by line, split on `\n` only (`:484-489`, `:494-498`). Notes carry text read from the database: column names (`:313`), type names (`:322`) and enum labels (`:362`). A newline in any of them escapes the comment. In JavaScript output, `\r`, U+2028 and U+2029 also end a `//` comment.

A database column named `x⏎DROP TABLE users; --` produces an active `DROP TABLE users;` in the SQL file. In the TypeScript file, `up()` issues it. Anyone who can create a column or an enum label in the source database can run code wherever migrations run.

Change.

- Reject `\r`, `\n`, U+2028 and U+2029 in every identifier, type name, enum label and constraint name the generator emits, whether it comes from a definition or from the catalog. Throw with the offending name.
- Comment out notes with the same function as the SQL.
- Make that function split on all four terminators, as a second layer.
- A default value may legitimately contain a newline. Inside a review step, such a default is emitted through the same comment function, so every resulting line is commented.

Tests. For each of column name, type name, enum label, unique constraint name and default: feed the payload from the catalog side and from the definition side. Use `\n`, `\r`, U+2028 and U+2029. Assert all three formats. For TS and JS, run the rendered file against the existing fake `pgm` and assert it issues only the active steps.

### 2. Replace the default heuristic

Covers P2.

Problem. `defaultToSql` emits a string as raw SQL when it looks like `name(...)` or matches one of six keywords (`migration-generator.ts:74-75`, `:88-90`). `'Smith (Jr)'` becomes `DEFAULT Smith (Jr)`. `'current_user'` and `'version()'` silently become function calls. `"now() + interval '1 day'"` becomes a quoted string.

Change.

- A string is a literal. An expression needs `sqlExpression(...)`.
- Keep a short compatibility list, matched exactly and without regard to case: `now()`, `CURRENT_TIMESTAMP`, `CURRENT_DATE`, `gen_random_uuid()`. apihigia has `default: 'CURRENT_TIMESTAMP'` today.
- Update the comment on `ColumnDefinition.default` in `src/types/core-types.ts` and the README section.

Tests. Each list entry is emitted raw in upper and lower case. `'Smith (Jr)'`, `'current_user'` and `'version()'` are emitted as quoted literals.

### 3. `default: null` means no default

Problem. Drift reports "expected default null, found no default", and the generator emits `SET DEFAULT NULL` (`migration-generator.ts:446`). Postgres stores no default for NULL, so the report never clears.

Change. Treat `default: null` and a missing `default` the same, in the drift check and in the generator.

Test. A definition with `default: null` against a column with no default reports no drift.

### 4. Add missing labels to an existing enum type

Problem. `ensureEnumType` returns early when the type exists (`migration-generator.ts:156`). A new column that uses an existing type and needs a new label gets `ADD COLUMN` with no `ADD VALUE`. The migration fails when it runs.

Change. When the type exists, compare labels and emit `ALTER TYPE ... ADD VALUE` for each missing one before the column is added.

Test. A new column on an existing type with one missing label produces the ADD VALUE step first.

### 5. Keep `\r` intact in active steps

Problem. An active step is written into a template literal. A `\r` inside a default becomes `\n` when the file is read back, so the applied default differs from the definition.

Change. Escape `\r` as `\\r` in the literal, next to the existing escapes for backslash, backtick and `${` (`migration-generator.ts:508-509`).

Test. Extend the existing escaping test: the SQL issued by the rendered file equals `step.sql` for a default that contains `\r`.

### 6. Type names the consumers use (new)

Problem. An unknown type falls back to its raw string (`src/schema/schema-drift.ts:181`). apihigia's two `TIMESTAMPTZ` columns and two `TIME WITHOUT TIME ZONE` columns would be reported as drift.

Change.

- Add `TIMESTAMPTZ` to `ColumnTypeMapping` and `SQL_DATA_TYPES` as an alias of `TIMESTAMP WITH TIME ZONE`.
- Add `TIME WITHOUT TIME ZONE`, typed as `string`.
- Make the fallback in `expectedType` throw for a type that is in neither table. A silent fallback produces false drift.

Acceptance. `checkSchemaDrift` runs over apihigia's 25 definitions and ocaproperties' 9 definitions without throwing on a type name.

### 7. Serve the schema tools from `pg-lightquery/schema`

Problem. The PR exports `checkSchemaDrift`, `generateMigration` and their types from the root entry (`src/index.ts:44-60`). The query layer then carries about 1,000 lines most consumers never call.

Change.

- Add `src/schema/index.ts` and export the schema tools and their types from it.
- Remove those exports from `src/index.ts`. Keep `sqlExpression` on the root, because PR 3 uses it in the query path.
- Add an `exports` map to `package.json`:

  ```json
  "exports": {
  	".": {"types": "./dist/index.d.ts", "default": "./dist/index.js"},
  	"./schema": {"types": "./dist/schema/index.d.ts", "default": "./dist/schema/index.js"},
  	"./package.json": "./package.json"
  }
  ```

- An `exports` map blocks imports of any other path inside the package. No consumer has one. Say so in the changelog.
- Nothing under `src/core`, `src/utils` or `src/connection` imports from `src/schema`.

Test. A compiled smoke test requires `pg-lightquery` and `pg-lightquery/schema` from a packed tarball.

### 8. Changelog and the type break

Problem. The PR changes `ColumnTypeMapping`. Columns such as `BOOLEAN`, `UUID` and `BIGINT` get concrete types. `insert({flag: null})` on a BOOLEAN column compiles on `main` and fails on the PR. The PR has no changelog entry.

Change.

- Add a 0.5.0 section to `CHANGELOG.md`. List each new column type with its TypeScript type. State that `BIGINT` is `string | number` and that `JSON` and `JSONB` are `unknown`.
- Do not bump `package.json` in this PR. The version changes once, when 0.5.0 is released after PR 2.

Acceptance. apihigia and ocaproperties compile against a local tarball of the branch. Record every error they hit in the changelog entry. ocaproperties has 18 `as any` casts on `where` and `data`, and some of them exist because `UUID` and `BOOLEAN` were untyped.

### 9. Cover the review branches without a database

Problem. Lines 317 to 474 of `migration-generator.ts`, which hold every ALTER and review branch, run only in the live tests. Without a database, line coverage of the generator is 64%.

Change. Add unit tests that feed hand-built drift issues to the step builder. Cover each issue kind once: extra column, type change, NOT NULL change, primary key change, removed enum value, replaced foreign key, removed unique constraint.

### 10. Rebase and CI

- Rebase onto `main` after PR 1 merges. The PR touches none of PR 1's files except `src/index.ts` and `package.json`.
- PR 1's `ci.yml` sets `PGLIGHTQUERY_TEST_DATABASE_URL`, so the PR's 9 live tests run in CI from then on.
- The live suites already sit in `tests/integration/schema-drift/`. Leave them there. PR 3 later moves the mocked suites out of `tests/integration/`, so that folder holds only tests that reach Postgres.

### 11. Documentation

The PR adds a 148-line "Migrations & Schema Drift" section to the root README. Move it into `docs/`, following the structure and templates in the [plans index](README.md#documentation-the-prs-create).

`docs/features/schema.md`, new

- Move the README section here. The README keeps one paragraph and a link.
- Change the import paths to `pg-lightquery/schema`.
- Column types: a table of every type with its TypeScript type and its Postgres type, including the aliases from §6.
- Defaults: the rule from §2, with `sqlExpression` and the compatibility list.
- Foreign keys and `enumTypeName`.
- `checkSchemaDrift`: what it compares, that it only reads, and how to run it in CI or at startup with any query function.
- `generateMigration`: the three output formats, and the rule that active steps only add and everything else is commented out for review.
- Workflow for a project with no migration tool yet: run the drift check against the existing database first, fix the definitions until it reports nothing, then adopt generated drafts for new changes.
- Limits: the three documented limits listed below.
- The `runner` call for node-pg-migrate was never run. Either run it once against a local database or mark it as untested.

`docs/upgrading/to-0.5.0.md`, new

This PR creates the file with the parts it owns. PR 2 adds the rest.

- Who needs this: anyone on 0.4.x. The upgrade is not automatic under a caret range.
- Step "Column types are now typed":
  - *What changed*: column types such as `BOOLEAN`, `UUID`, `BIGINT`, `JSON` and `JSONB` map to concrete TypeScript types. Code that passed any value for those columns may stop compiling.
  - *Find it*: run the type check. Each error names the column.
  - *Change it*: fix the value's type, or remove a cast that is no longer needed. `BIGINT` is `string | number`. `JSON` and `JSONB` are `unknown` and need a cast when read.
  - *Check it*: the type check passes with fewer `as any` casts than before.
- Step "Only the package entry points can be imported":
  - *What changed*: the package now has an `exports` map. Imports of inner paths such as `pg-lightquery/dist/...` fail.
  - *Find it*: search for `pg-lightquery/` followed by anything other than `schema`.
  - *Change it*: import from `pg-lightquery` or `pg-lightquery/schema`.
- Step "String defaults are literals":
  - *What changed*: a string `default` in a table definition is a literal unless it is on the compatibility list from §2.
  - *Find it*: search the table definitions for `default:` with a string value.
  - *Change it*: wrap an expression in `sqlExpression(...)`.

`README.md`

- Add the links to `docs/features/schema.md` and the 0.5.0 row to the upgrade table that PR 1 created.

`CHANGELOG.md`

- The 0.5.0 entry from §8 links to `docs/upgrading/to-0.5.0.md`.

## Kept as documented limits

The PR description lists these. They stay out of scope.

- Defaults are compared by presence only.
- Composite unique constraints and composite foreign keys are skipped.
- The catalog queries need PostgreSQL 11 or newer. Adding an enum value inside a transaction needs 12 or newer.

## Done when

- The reproduction for §1 no longer produces an active statement, in all three formats.
- CI is green with the live tests running.
- `tsc --noEmit` passes.
- The changelog entry exists, and `package.json` has the `exports` map.
- `docs/features/schema.md` exists, `docs/upgrading/to-0.5.0.md` has the three steps from §11, and the README links to both.
- apihigia and ocaproperties compile against a local tarball.

## Risks

- §1 rejects names that Postgres itself accepts. A database with a newline in a column name cannot be drafted. That is the intended trade.
- §2 changes what a string default means for definitions outside the compatibility list. `main` never reads `default`, so no running query depends on it.
- §7 changes import paths for a feature that was never released. No consumer is affected.
