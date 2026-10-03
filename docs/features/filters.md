# Filters, sorting and paging

The `where` object of `select` and `selectWithCustomSchema` carries three things: the filters, the sort keys and the paging keys of a query. The library turns them into `WHERE`, `ORDER BY`, `LIMIT` and `OFFSET`. Values are bound as parameters. Sort directions and paging numbers are validated before they reach the SQL text.

This page covers sorting and paging. The filter operators are listed in the [README](../../README.md#-smart-query-operators).

The examples use the `users` table from [`tests/tables`](../../tests/tables). There, `usersTable.selectUsers(allowedColumns, {where})` is a thin wrapper around `select`.

## Sorting

A key of the form `<column>.orderBy` sorts by that column. The value is `'ASC'` or `'DESC'`.

Since 0.4.7 a query can sort by more than one column. Sort keys keep the order of the object's keys.

```typescript
const query = usersTable.selectUsers(['id', 'name'], {
	where: {'name.orderBy': 'ASC', 'id.orderBy': 'DESC'},
});

console.log(query.query.sqlText);
// SELECT "id", "name" FROM users ORDER BY "name" ASC, "id" DESC

const rows = await query.execute();
```

Swap the two keys and the query sorts by `id` first:

```typescript
usersTable.selectUsers(['id', 'name'], {
	where: {'id.orderBy': 'DESC', 'name.orderBy': 'ASC'},
});
// SELECT "id", "name" FROM users ORDER BY "id" DESC, "name" ASC
```

## Paging

`limit` sets the page size. Since 0.4.7 `offset` skips rows. Before 0.4.7 `offset` was read as a filter on a column named `offset`, and the query failed.

```typescript
const page = usersTable.selectUsers(['id', 'name'], {
	where: {'id.orderBy': 'ASC', limit: 10, offset: 20} as any,
});

console.log(page.query.sqlText);
// SELECT "id", "name" FROM users ORDER BY "id" ASC LIMIT 10 OFFSET 20
console.log(page.query.values);
// []
```

Both keys go through the same check. Each must be a non-negative integer, given as a number or as a numeric string such as `'10'`. Anything else throws when the query is built.

Paging combines with filters:

```typescript
usersTable.selectUsers(['id', 'name'], {
	where: {name: 'Ann', 'id.orderBy': 'ASC', limit: '1', offset: '1'} as any,
});
```

## Paging a query with predefined SQL

Since 0.4.7 `limit` and `offset` also work in `selectWithCustomSchema` when `allowedColumns` is an explicit list. Before 0.4.7 they were dropped there, unless `allowedColumns` was `'*'`.

```typescript
// selectUserDetails passes its arguments to selectWithCustomSchema
const rows = await usersTable
	.selectUserDetails(['id', 'name'], {
		where: {'id.orderBy': 'ASC', limit: 2, offset: 1} as any,
	})
	.execute();
```

## Keys

| Key | Value | SQL | Since |
|---|---|---|---|
| `<column>.orderBy` | `'ASC'` or `'DESC'`, in any case | `ORDER BY "<column>" ASC` | several sort keys since 0.4.7 |
| `limit` | non-negative integer, as a number or a numeric string | `LIMIT n` | |
| `offset` | non-negative integer, as a number or a numeric string | `OFFSET m` | 0.4.7 |

## Limits and failure modes

- A `limit` or an `offset` that is not a non-negative integer throws `Invalid limit value` or `Invalid offset value`. The check runs when the query is built, before anything reaches the database.
- A sort direction other than `ASC` or `DESC` throws `Invalid orderBy direction`.
- `limit` and `offset` are paging keys. A table with a column named `limit` or `offset` cannot filter on that column through `where`.
- A sort key must name a column from `allowedColumns`. A key outside the list is ignored.
- `limit` and `offset` are not part of the `QueryParams` type. A TypeScript object literal that holds them needs a cast, as in the examples above. An object that comes from request input needs none.
- Paging without a sort key returns rows in no defined order. Pass a sort key with every paged query.
