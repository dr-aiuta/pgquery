# Upgrading to 0.4.7

## Who needs this

Anyone on 0.4.x. A caret range such as `^0.4.5` installs 0.4.7 automatically on the next install. No code change is expected. Steps 3, 5 and 6 name the cases that need one.

## What is new

- Transactions run on one connection, and `PostgresConnection.transaction(queries)` takes a list of query objects. See [Transactions and chains](../features/transactions-and-chains.md).
- `offset` pages a select. See [Filters, sorting and paging](../features/filters.md#paging).
- A select can sort by more than one column. See [Filters, sorting and paging](../features/filters.md#sorting).
- `PostgresConnection.end()` closes the pool. See [Connection](../features/connection.md#end).

## Before you start

1. Pin the version you run now, for example `"pg-lightquery": "0.4.6"`.
2. Run your type check and your test suite.
3. Note the result. It is the baseline for the checks at the end.

## Steps

Most projects need no code change. Each step is a behavior note, with a way to find the code it touches and a way to check it.

Steps 3, 5 and 6 can change the result of a call that works today. The other steps change calls that failed before, or how they fail.

### 1. Transactions are now atomic

- **What changed.** `transaction().add(...).execute()` and a chained `.build().execute()` now run `BEGIN`, every statement and `COMMIT` on one connection. Before, each statement could land on a different pool connection, and a failed transaction could leave rows behind.
- **Find it.** Search for `transaction()` and for chained `.build()` calls:

  ```bash
  grep -rn "transaction()" src
  grep -rn "\.build()" src
  ```

- **Change it.** Nothing is required. Code that cleaned up after a partly applied transaction can be removed.
- **Check it.** Make one query of a transaction fail in a test. No row of that transaction is stored.

### 2. A failed single-statement transaction throws the original pg error

- **What changed.** `PostgresConnection.transaction(text, params)` used to throw a new plain `Error` with the message of the pg error. It now rethrows the pg error itself. The message is the same. For an error raised by the server, the class is pg's `DatabaseError` and `error.code` is set.
- **Find it.** Search for `catch` blocks around `PostgresConnection.transaction` that compare the error class:

  ```bash
  grep -rn "PostgresConnection.transaction" src
  ```

- **Change it.** Replace a check on the message text with a check on the code:

  ```typescript
  // before
  if (error.message.includes('duplicate key')) { ... }

  // after
  if (error.code === '23505') { ... }
  ```

- **Check it.** `error.code` is available in the `catch` block.

### 3. `returnField` must be a column of the table definition

- **What changed.** `returnField` accepts `'*'`, a column of the table definition, or an array of such columns. Anything else throws `Invalid returnField` when the query is built. Before, any text was written into the SQL.
- **Find it.** Search for `returnField`:

  ```bash
  grep -rn "returnField" src
  ```

  Look for a column that exists in the database and is missing from the table definition.
- **Change it.** Add the missing column to the table definition:

  ```typescript
  // before: the definition has no "email" column, and returnField: 'email' now throws
  const usersColumns = {
  	id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
  	name: {type: 'TEXT', notNull: true},
  } as const;

  // after
  const usersColumns = {
  	id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
  	name: {type: 'TEXT', notNull: true},
  	email: {type: 'TEXT', unique: true},
  } as const;
  ```

- **Check it.** The call no longer throws.

### 4. An upsert that sends only key columns does nothing on conflict

- **What changed.** An insert with `onConflict: true` whose data holds only primary key columns used to produce `DO UPDATE SET` with nothing after it, and PostgreSQL rejected it. It now produces `ON CONFLICT (...) DO NOTHING`. A related fix: every column of a composite key is quoted on its own. Step 7 covers an insert with no column.
- **Find it.** Search for `onConflict: true`:

  ```bash
  grep -rn "onConflict" src
  ```

  Look for calls whose data can hold nothing but the key, and for tables with more than one primary key column.
- **Change it.** Nothing is required. Code that caught the syntax error can be removed.
- **Check it.** Run the upsert twice in a test. The second call succeeds and returns no row.

### 5. `offset` now pages

- **What changed.** `offset` in a `where` object used to become a filter on a column named `offset`, and the query failed. It now emits `OFFSET n`. The value must be a non-negative integer.
- **Find it.** Search your table definitions for a column named `offset`:

  ```bash
  grep -rn "offset" src
  ```

- **Change it.** A table with such a column can no longer filter on it through `where`. Filter on it with predefined SQL instead. This is a judgement call only if you have that column. The question to answer: does any query filter on a column named `offset`?
- **Check it.** A select with `limit` and `offset` returns the expected page. Print `.query.sqlText` to read the SQL.

### 6. `selectWithCustomSchema` applies `limit` and `offset` with an explicit column list

- **What changed.** With `allowedColumns` as an explicit list, `selectWithCustomSchema` used to drop `limit` and `offset` from the `where` object without an error. It now applies them. With `allowedColumns: '*'` they were already applied.
- **Find it.** Search for `selectWithCustomSchema`:

  ```bash
  grep -rn "selectWithCustomSchema" src
  ```

  Look for calls that pass an explicit `allowedColumns` list together with a `where` object that can hold `limit` or `offset`. An object built from request input is the usual case.
- **Change it.** Nothing, when the caller wants the page it asked for. Two cases need a change:
  - A caller that sends `limit` and relies on getting every row. Stop sending `limit`.
  - Predefined SQL that ends in its own `LIMIT` or `OFFSET`. The query now gets a second one, and PostgreSQL rejects it. Remove one of the two.
- **Check it.** Print `.query.sqlText` of such a call with a `limit`. It ends in `LIMIT n`, and `LIMIT` appears once.

### 7. An insert with no usable column

- **What changed.** An insert whose data yields no column used to produce an empty column list, and PostgreSQL rejected it. There are now two cases:
  - Empty data, `data: {}`, inserts a row of defaults with `INSERT INTO ... DEFAULT VALUES`.
  - Data that has keys, none of which yields a column, throws `No valid columns provided for insert operation` when the query is built. A key yields no column when it is outside `allowedColumns`, when it is not in the table definition, or when its value is `null` or `undefined`.

  A table with a `lastChangedBy` column is not affected. That column is always inserted, as before.
- **Find it.** Search for inserts whose data comes from outside your code:

  ```bash
  grep -rn "\.insert(" src
  ```

- **Change it.** Nothing is required for a call that works today. Code that caught the syntax error now gets the new error. It is thrown when the query is built, before `execute()`.
- **Check it.** Build an insert with one misspelled key in a test. It throws.

## After the upgrade

1. Run your type check and your test suite again. Compare the result with the baseline.
2. To roll back, pin `0.4.6`.
