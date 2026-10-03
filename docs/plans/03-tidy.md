# PR 3: Tidy (0.5.1)

| | |
|---|---|
| Pull request | new, branch from `main` after 0.5.0 is released |
| Release | 0.5.1, patch |
| Breaking | no for valid calls. Raw SQL in chain names or `selectFrom` columns is rejected, see §1. |
| Depends on | PR 1, PR 2, PR #14 |
| Effort | about 2 days |

## Goal

Remove duplication and dead code, rebuild the chained builder without regex, and move files into a layout that matches what the code does. Valid calls behave the same. Two additions let consumers delete boilerplate. Two new checks reject input that was raw SQL or could never have run.

This PR goes last because it moves files. A file move conflicts with every other open branch.

## Consumer impact

| Consumer | Code change needed | What improves |
|---|---|---|
| apihigia | none | Three classes can delete their `get dbOperations()` getter. The 3 `EnhancedTableBase` classes keep compiling and can switch to `TableBase` at any time. |
| ocaproperties | none | All 8 classes can delete their `get dbOperations()` getter. |

Two things must not change, because the apps depend on them:

- The chained builder returns `{queries, execute}`, and `execute()` resolves to an array of pg results. ocaproperties reads `results[0].rows[0]`.
- The method names `insertIntoTable`, `insertIntoTableWithReference` and `updateTable` keep working. apihigia uses all three.

## Changes

### 1. One identifier helper

Covers the rest of S7.

- Add `ident(name)` in `src/sql/identifiers.ts`. It accepts only `^[A-Za-z_][A-Za-z0-9_]*$` and returns the name in double quotes. Anything else throws `QueryInputError`.
- Use it at every site that writes a column, a CTE name or a reference field. That includes the chained builder's `cteName`, `reference.from`, `reference.field` and `reference.to` (`src/utils/chained-insert-builder.ts:288`, `:387`, `:388`, `:418`, `:421`).
- `selectFrom(cteName, columns)` takes raw text today (`chained-insert-builder.ts:251`, `:307`). Accept `'*'`, one column name, or an array of column names, each passed through `ident`. All four chains in apihigia and ocaproperties pass `'*'` or nothing.
- Table names are validated and not quoted. Quoting would stop Postgres from folding case, which would break a table defined with capitals. A schema-qualified name is split on the dot and each part is checked.

Tests. A CTE name with a space throws. A `selectFrom` column list with a subquery throws. Existing chains produce the same SQL.

### 2. Rebuild chained references without regex

Covers bug 7.

Problem. The builder generates an INSERT, then parses it back with a regex to add the referenced column (`chained-insert-builder.ts:403-434`). The rebuilt statement drops ON CONFLICT. Updates are handled the same way at `:372-398`. Inserts are always emitted before updates (`:286-299`), whatever the call order.

Change.

- Let `insert` and `update` accept an `SqlExpression` as a value. It is written into the SQL text and is not bound. The marker comes from PR #14 (`sqlExpression`).
- A reference becomes ordinary data: `{[reference.to]: sqlExpression('(SELECT ' + ident(field) + ' FROM ' + ident(from) + ')')}`.
- Delete `injectReference`, `injectUpdateReference`, `processInsertStep` and `processUpdateStep`.
- Keep one array of steps in call order.

The marker is branded with a registered symbol. JSON from a request cannot carry a symbol key, so request data cannot forge an expression.

Tests. A referenced insert with `onConflict: true` keeps its ON CONFLICT clause. An insert that references an earlier update runs against Postgres. The three apihigia chains and the ocaproperties chain are reproduced as fixtures, and their SQL is asserted.

### 3. Chains accept a table class (new)

From both apps. `insert(name, table, data)` takes a `DatabaseOperations`. A table class cannot pass another table's protected `db`, so 11 classes expose it with a `get dbOperations()` getter.

Accept a `TableBase` instance as well. The builder reads its `db` through a module-internal accessor. The getters become unnecessary.

### 4. Return `this`, and fold the name-based methods into the one builder

- Declare every builder method as returning `this`. Delete the nine overrides in `EnhancedChainedInsertBuilder` (`src/core/table-base-extensions.ts:127-268`). They exist only to change the return type.
- Move `insertIntoTable`, `insertIntoTableWithReference`, `insertIntoTableWithReferenceIf`, `updateTable`, `updateTableWithReference` and `updateTableIf` into `ChainedInsertBuilder`. The builder takes an optional registry. A name-based call without a registry throws a clear error.
- Delete `EnhancedChainedInsertBuilder`. It is not exported from `src/index.ts`.

### 5. Merge EnhancedTableBase into TableBase

- Move `registerRelatedTable`, `getRelatedTable`, `createChainedInsert` and `chainedInsert` into `TableBase`. Create the registry on first use.
- Keep `EnhancedTableBase` as a deprecated alias of `TableBase`. apihigia's three classes keep compiling.

There is then one base class to choose.

### 6. One placeholder function

Placeholder renumbering is written six times: `adjustPlaceholders` (`src/utils/query-utils.ts:97`), and inline copies at `src/utils/query-builder.ts:122` and `chained-insert-builder.ts:326` and `:353`. The other two were in the builders PR 2 deleted.

- Keep one `renumber(sql, offset)` and one `maxPlaceholder(sql)` in `src/sql/placeholders.ts`.
- Add a check (new): when predefined SQL has `values`, their count must match its highest placeholder. A mismatch throws when the query is built. apihigia has one such call at `charges.ts:152`, which fails only when it reaches Postgres.

### 7. One select implementation

- The block that merges predefined SQL appears in `select` and in `selectWithCustomSchema` (`src/core/database-operations.ts:163-168`, `:259-275`). The third copy was in `update` and left with PR 2.
- `select` and `selectWithCustomSchema` share most of their body. Move it into one private function that takes the schema to check against. Both public methods stay.

### 8. Delete dead code and the executor

- Delete `constructCondition`, `buildWhere`, `buildNull` and `buildOrderBy` from `src/utils/query-builder.ts:4-38`. Nothing calls them.
- Delete `src/utils/query-executor.ts`. After PR 2 removed its logging, three of its four functions return `result.rows`. `DatabaseOperations` calls `PostgresConnection.query` directly. The transaction already lives on the connection since PR 1.
- Stop reading the unused `includeMetadata` option (`database-operations.ts:148`, `:229`). Leave it in the type, marked deprecated.

### 9. File layout

Covers the folder decisions and "option types belong in types".

Target:

```
src/
├── index.ts               one name per export
├── types.ts               schema types and option types
├── connection.ts          pool, query, transaction, end
├── table-base.ts          TableBase, EnhancedTableBase alias
├── database-operations.ts insert, select, update
├── chained-insert.ts      the only CTE builder
├── schema/                from PR #14, served as pg-lightquery/schema
└── sql/                   pure, never imports connection
    ├── where.ts           operators to WHERE text
    ├── write.ts           INSERT and UPDATE text
    ├── placeholders.ts    $n renumbering
    ├── identifiers.ts     ident()
    └── expression.ts      sqlExpression marker
```

Moves:

| Today | Goes to |
|---|---|
| `core/query-constructor.ts`, `utils/helpers.ts` | `sql/where.ts` |
| `utils/query-builder.ts` | `sql/write.ts` |
| `utils/query-utils.ts` | `types.ts`, `sql/placeholders.ts`, `sql/write.ts` |
| `utils/sql-expression.ts` (from PR #14) | `sql/expression.ts` |
| `connection/postgres-connection.ts` | `connection.ts` |
| `core/table-base.ts`, `core/table-base-extensions.ts` | `table-base.ts` |
| `core/database-operations.ts`, `utils/array-utils.ts`, `utils/class-utils.ts` | `database-operations.ts` |
| `utils/chained-insert-builder.ts` | `chained-insert.ts` |
| `types/*.ts` | `types.ts` |

Rules:

- Do the move in its own commit with no other change, so the history follows each file.
- Files in `sql/` never import `connection.ts`. Add a CI step that fails when `grep -rn "connection" src/sql` finds a match.
- `src/index.ts` keeps exporting the same names. No consumer imports a deep path, so the move is invisible to them.

### 10. Remove the path aliases

Remove `"@/*"` and `"@tests/*"` from `tsconfig.json:12-13`, and both mappings from `jest.config.js:11-12`. The compiler does not rewrite aliases in the JavaScript it emits, so one `@/` import in `src/` would break the published build. Nothing uses `@tests/`.

Three test files use `@/` and switch to relative imports: `tests/tables/definitions/posts.ts`, `tests/tables/definitions/addresses.ts` and `tests/integration/postgres-connection.test.ts`.

### 11. Test folders

- Move the mocked suites from `tests/integration/` to `tests/unit/`. They test SQL generation with a mocked connection.
- `tests/integration/` keeps only the suites that reach Postgres: `live/` from PR 1 and `schema-drift/` from PR #14.
- Delete `tests/unit/example.ts`. It is commented out from top to bottom.
- Move what is useful in `tests/examples/returnField-usage.ts` into the README, then delete the folder.
- `tests/tables/` stays. Rename nothing there.

### 12. `noUnusedLocals`

Add `"noUnusedLocals": true` to `tsconfig.json`. It reports 23 unused declarations on `main` today. After §8 and §9 the remaining ones are unused imports. Remove them.

### 13. Prettier

`prettier.config.js` exists, and Prettier is not installed.

- Add `prettier` to `devDependencies`. This needs network access. Ask before running it.
- Add the scripts `format` and `format:check`.
- Format the repo in one commit that changes nothing else. List that commit in `.git-blame-ignore-revs`.
- Add `npm run format:check` to `ci.yml`.

### 14. Documentation

The structure and the page templates are in the [plans index](README.md#documentation-the-prs-create).

`docs/upgrading/to-0.5.1.md`, new

- Who needs this: anyone on 0.5.0. A caret range installs it automatically. Most projects change nothing.
- What is new: chains accept table classes, chains keep ON CONFLICT on referenced inserts, and one base class.
- Steps. The first two can throw for unusual input. The last two are optional clean-ups.
  1. **Chain names and columns must be plain identifiers.**
     - *What changed*: a CTE name, a reference field and each `selectFrom` column must match `^[A-Za-z_][A-Za-z0-9_]*$`. `selectFrom` no longer accepts an expression.
     - *Find it*: search for `selectFrom(` and read the second argument. Search for chain step names with spaces or quotes.
     - *Change it*: pass `'*'` or column names. Compute expressions in a follow-up select.
  2. **Predefined SQL values must match its placeholders.**
     - *What changed*: a mismatch throws when the query is built, where it used to fail in Postgres.
     - *Find it*: search for `predefinedSQL` with a `values` array.
     - *Change it*: remove the unused values, or add the missing placeholder.
  3. **Optional: pass table classes to chains.**
     - *Find it*: search your table classes for a getter that returns `this.db`.
     - *Change it*: pass the table instance to `insert` and delete the getter.
  4. **Optional: use `TableBase` everywhere.**
     - *Find it*: search for `EnhancedTableBase`.
     - *Change it*: extend `TableBase`. The old name keeps working and is marked deprecated.
- After the upgrade: run the type check and the tests. To roll back, pin `0.5.0`.

`docs/features/transactions-and-chains.md`, extended

- Chains: steps run in the order they are called, a reference keeps its ON CONFLICT clause, and a step takes a table class or a registered table name.
- `registerRelatedTable` on `TableBase`.
- The result shape of `build()` and `execute()`.

`docs/features/writes.md`, extended

- `sqlExpression` as a value in insert and update data, with the note that request data cannot forge one.

`README.md`

- Add the 0.5.1 row to the upgrade table.
- Replace the "Chained Insert & Update Builder" and "Enhanced TableBase" sections with a short example and a link to the feature page. Those two sections are 170 lines today.

`CHANGELOG.md`

- The 0.5.1 entry links to `docs/upgrading/to-0.5.1.md`.

## Out of scope

Nothing here changes generated SQL, apart from §2 keeping the ON CONFLICT clause and emitting steps in call order.

## Done when

- CI is green, including the format check and the `sql/` purity check.
- `tsc --noEmit` passes with `noUnusedLocals`.
- `src/` has the layout in §9.
- The pages in §14 exist, and every link from `README.md` into `docs/` resolves.
- The SQL fixtures for the four consumer chains are unchanged, except where §2 fixes them.
- apihigia and ocaproperties compile against a local tarball without any change.

## Risks

- A file move hides logic changes in review. Keep the move in its own commit.
- §3 gives the builder access to a protected member through an internal accessor. Keep that accessor out of `src/index.ts`.
- The placeholder check in §6 can misread a `$1` inside a string literal in predefined SQL. Count only placeholders outside quotes, or skip the check when the SQL contains a quote.
