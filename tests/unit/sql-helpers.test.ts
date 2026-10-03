import {ident, isIdentifier, plainName, tableName} from '../../src/sql/identifiers';
import {maxPlaceholder, renumber} from '../../src/sql/placeholders';
import {DatabaseOperations} from '../../src/database-operations';
import {QueryInputError} from '../../src/sql/identifiers';
import {usersColumns} from '../tables/definitions/users';

describe('sql/identifiers', () => {
	const valid = ['id', 'userId', 'new_user', '_private', 'special_user_123', 'A'];
	const invalid = [
		'',
		'1st',
		'new user',
		'user-id',
		'id"; DROP TABLE users; --',
		'id) FROM users; --',
		'a.b',
		'(SELECT 1)',
		'café',
		'id\n',
		null,
		undefined,
		1,
		{},
	];

	it('accepts letters, digits and underscores, not starting with a digit', () => {
		for (const name of valid) {
			expect(isIdentifier(name)).toBe(true);
			expect(ident(name)).toBe(`"${name}"`);
			expect(plainName(name)).toBe(name);
		}
	});

	it('rejects everything else with QueryInputError', () => {
		for (const name of invalid) {
			expect(isIdentifier(name)).toBe(false);
			expect(() => ident(name)).toThrow(QueryInputError);
			expect(() => plainName(name)).toThrow(QueryInputError);
		}
		expect(() => ident('new user', 'reference field')).toThrow('Invalid reference field: new user.');
	});

	it('checks a table name part by part and returns it unquoted', () => {
		expect(tableName('users')).toBe('users');
		expect(tableName('Users')).toBe('Users');
		expect(tableName('auth.users')).toBe('auth.users');

		for (const name of ['', 'users; DROP TABLE users', 'auth.', '.users', 'a.b c', '"Users"', 'users u', null]) {
			expect(() => tableName(name)).toThrow(/Invalid table name/);
		}
	});

	it('rejects a table definition whose name is not a plain name', () => {
		const define = (name: string) => new DatabaseOperations({tableName: name, schema: {columns: usersColumns}});

		expect(define('users').tableName).toBe('users');
		expect(define('public.users').tableName).toBe('public.users');
		expect(() => define('users; DROP TABLE users')).toThrow(QueryInputError);
		expect(() => define('users u')).toThrow(/Invalid table name: users u/);
	});
});

describe('sql/placeholders', () => {
	describe('maxPlaceholder', () => {
		it('returns the highest placeholder, or 0', () => {
			expect(maxPlaceholder('SELECT 1')).toBe(0);
			expect(maxPlaceholder('SELECT * FROM users WHERE id = $1')).toBe(1);
			expect(maxPlaceholder('WHERE a = $2 AND b = $10 AND c = $3')).toBe(10);
			expect(maxPlaceholder('WHERE a = $1 OR b = $1')).toBe(1);
			expect(maxPlaceholder('WHERE a = ANY($1) AND b=$2')).toBe(2);
		});

		it('ignores a placeholder inside a string literal, a quoted name or a comment', () => {
			expect(maxPlaceholder(`SELECT 'costs $5' FROM users WHERE id = $1`)).toBe(1);
			expect(maxPlaceholder(`SELECT 'it''s $7' AS note WHERE id = $2`)).toBe(2);
			expect(maxPlaceholder(`SELECT "price$3" FROM items WHERE id = $1`)).toBe(1);
			expect(maxPlaceholder('SELECT 1 -- uses $9\nWHERE id = $1')).toBe(1);
			expect(maxPlaceholder('SELECT 1 /* $8 and $9 */ WHERE id = $2')).toBe(2);
			expect(maxPlaceholder('SELECT $$ $4 $$, $tag$ $6 $tag$ WHERE id = $1')).toBe(1);
			expect(maxPlaceholder('SELECT price$3 FROM items WHERE id = $1')).toBe(1);
		});

		it('survives text that never closes', () => {
			expect(maxPlaceholder(`SELECT $1, 'open`)).toBe(1);
			expect(maxPlaceholder('SELECT $1 /* open')).toBe(1);
			expect(maxPlaceholder('SELECT $1, $$ open $2')).toBe(1);
		});
	});

	describe('renumber', () => {
		it('adds the offset to every placeholder', () => {
			expect(renumber('WHERE "id" = $1 AND "name" = $2', 3)).toBe('WHERE "id" = $4 AND "name" = $5');
			expect(renumber('WHERE "id" = ANY($1) LIMIT 5', 10)).toBe('WHERE "id" = ANY($11) LIMIT 5');
			expect(renumber('VALUES ($1, $2, $10)', 1)).toBe('VALUES ($2, $3, $11)');
		});

		it('returns the text unchanged for offset 0 and for text without placeholders', () => {
			expect(renumber('WHERE "id" = $1', 0)).toBe('WHERE "id" = $1');
			expect(renumber('ORDER BY "id" ASC', 4)).toBe('ORDER BY "id" ASC');
			expect(renumber('', 4)).toBe('');
		});

		it('leaves quoted text and comments alone', () => {
			expect(renumber(`SET "note" = 'costs $5', "price$1" = $1 WHERE "id" = $2`, 2)).toBe(
				`SET "note" = 'costs $5', "price$1" = $3 WHERE "id" = $4`
			);
		});
	});
});
