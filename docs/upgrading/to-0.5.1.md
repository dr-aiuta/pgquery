# Upgrading to 0.5.1

## Who needs this

Anyone on 0.5.0. A caret range such as `^0.5.0` installs 0.5.1 automatically on the next install. Most projects change nothing.

Two checks are new. They reject input that was raw SQL, or that could never have run. Steps 1 and 2 tell you whether your code is affected.

## What is new

- A chain step takes a table class instance, not only its operations object. See [Transactions and chains: chained inserts](../features/transactions-and-chains.md#chained-inserts-and-updates).
- A chain keeps `ON CONFLICT` on a referenced insert, and writes its steps in the order they are called. See [Transactions and chains: references](../features/transactions-and-chains.md#references).
- One base class. `TableBase` has `registerRelatedTable` and `createChainedInsert`. See [Transactions and chains: registered tables](../features/transactions-and-chains.md#registered-tables).
- `sqlExpression(...)` is accepted as a value in insert and update data. See [Writes: SQL expressions as values](../features/writes.md#sql-expressions-as-values).

## Before you start

1. Pin the version you run now, `"pg-lightquery": "0.5.0"`.
2. Run your type check and your test suite.
3. Note the result. It is the baseline for the checks at the end.

## Steps

The first two steps can throw for unusual input. The last two are optional clean-ups.

### 1. Chain names and columns must be plain identifiers

- **What changed.** The name of a chain step, the `from` and `field` of a reference, and each `selectFrom` column must match `^[A-Za-z_][A-Za-z0-9_]*$`. Anything else throws `QueryInputError`. `selectFrom` no longer accepts an expression. It takes `'*'`, one column name, or an array of column names, and it writes each column in double quotes. A table name in a table definition must be a plain name too, optionally with a schema in front.
- **Find it.** Search for `selectFrom(` and read the second argument. Search for step names with spaces or quotes.

  ```bash
  grep -rnE "selectFrom\([^)]*," src
  grep -rnE "\.(insert|update)[A-Za-z]*\(\s*['\"][^'\"]*[^A-Za-z0-9_'\"]" src
  ```

- **Change it.** Pass `'*'` or column names. Compute expressions in a follow-up select.

  ```typescript
  // before: raw text
  .selectFrom('new_user', 'id, name')

  // after: column names
  .selectFrom('new_user', ['id', 'name'])
  ```

- **Check it.** The chain builds. Print `.queries[0].sqlText` and read the last line.

### 2. Predefined SQL values must match its placeholders

- **What changed.** When `predefinedSQL` has `values`, their count must equal the highest placeholder of its SQL. A mismatch throws `QueryInputError` when the query is built. Before, it failed in PostgreSQL. A placeholder inside a string literal or a comment is not counted.
- **Find it.** Search for `predefinedSQL` with a `values` array:

  ```bash
  grep -rn -A4 "predefinedSQL" src | grep -n "values"
  ```

- **Change it.** Remove the unused values, or add the missing placeholder.

  ```typescript
  // before: one value, no placeholder
  predefinedSQL: {sqlText: 'SELECT id FROM users', values: [name]}

  // after
  predefinedSQL: {sqlText: 'SELECT id FROM users WHERE name = $1', values: [name]}
  ```

- **Check it.** The call no longer throws.

### 3. Optional: pass table classes to chains

- **What changed.** A chain step accepts a table class instance. A getter that exposed `this.db` for chains is no longer needed.
- **Find it.** Search your table classes for a getter that returns `this.db`:

  ```bash
  grep -rnE "return this\.db;?" src
  ```

- **Change it.** Pass the table instance to the step, and delete the getter.

  ```typescript
  // before
  createChainedInsert().insert('new_user', usersTable.dbOperations, data, options);

  // after
  createChainedInsert().insert('new_user', usersTable, data, options);
  ```

- **Check it.** The chain builds the same SQL as before.

### 4. Optional: use `TableBase` everywhere

- **What changed.** `TableBase` has `registerRelatedTable`, `getRelatedTable` and `createChainedInsert`. `EnhancedTableBase` is the same class under its old name. It keeps working and is marked deprecated.
- **Find it.** Search for `EnhancedTableBase`:

  ```bash
  grep -rn "EnhancedTableBase" src
  ```

- **Change it.** Extend `TableBase`.

  ```typescript
  // before
  class UsersTable extends EnhancedTableBase<UsersSchema> {}

  // after
  class UsersTable extends TableBase<UsersSchema> {}
  ```

- **Check it.** The type check passes.

## What else changed in the SQL

A chain now writes its steps in the order they are called. Before, every insert came first and every update after them. A chain that called an update between two inserts gets its statements in a different order, with the placeholders renumbered to match. The statements themselves are the same.

A referenced insert with `onConflict` now keeps its `ON CONFLICT` clause. Before, the clause was dropped in silence.

## After the upgrade

1. Run your type check and your test suite again. Compare the result with the baseline.
2. To roll back, pin `0.5.0`.
