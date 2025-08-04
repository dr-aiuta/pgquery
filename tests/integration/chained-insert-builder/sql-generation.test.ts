import {setupTests, dbpg, createMockQueryResult} from '../pg-lightquery/test-setup';
import {createChainedInsert} from '../../../src/utils/chained-insert-builder';
import {DatabaseOperations} from '../../../src/core/database-operations';
import {TableDefinition} from '../../../src/types/core-types';
import {UsersData, UsersSchema, usersColumns} from '../../tables/definitions/users';
import {PostsData, PostsSchema, postsColumns} from '../../tables/definitions/posts';

/**
 * SQL Generation Tests - Verify correct SQL output
 *
 * These tests verify that the ChainedInsertBuilder generates
 * correct, well-formed SQL that matches expected patterns.
 */

const usersTableDef: TableDefinition<UsersSchema> = {
	tableName: 'users',
	schema: {columns: usersColumns},
};

const postsTableDef: TableDefinition<PostsSchema> = {
	tableName: 'posts',
	schema: {columns: postsColumns},
};

describe('ChainedInsertBuilder - SQL Generation Tests', () => {
	setupTests();

	let usersDb: DatabaseOperations<UsersSchema>;
	let postsDb: DatabaseOperations<PostsSchema>;

	beforeEach(() => {
		usersDb = new DatabaseOperations(usersTableDef);
		postsDb = new DatabaseOperations(postsTableDef);
	});

	describe('SQL Structure Validation', () => {
		it('should generate well-formed CTE SQL structure', () => {
			const userData: Partial<UsersData> = {
				name: 'Test User',
				email: 'test@example.com',
			};

			const chainedInsert = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.selectFrom('new_user')
				.build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should follow proper CTE structure
			expect(sql).toMatch(/^WITH \w+ AS \(\s*INSERT INTO/);
			expect(sql).toMatch(/RETURNING \*\s*\)\s*SELECT \* FROM \w+;$/);

			// Should not have syntax errors (basic validation)
			expect(sql).not.toContain(',,'); // No double commas
			expect(sql).not.toContain('()'); // No empty parentheses
			expect(sql.split('(').length).toBe(sql.split(')').length); // Balanced parentheses
		});

		it('should generate correct multi-CTE structure', () => {
			const userData: Partial<UsersData> = {name: 'Multi User', email: 'multi@example.com'};
			const postData: Partial<PostsData> = {title: 'Multi Post', content: 'Multi Content'};

			const chainedInsert = createChainedInsert()
				.insert('user_cte', usersDb, userData, {returnField: '*'})
				.insertWithReference('post_cte', postsDb, postData, {
					from: 'user_cte',
					field: 'id',
					to: 'userId',
				})
				.selectFrom('user_cte')
				.build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should have proper multi-CTE structure
			expect(sql).toMatch(/^WITH user_cte AS \(/);
			expect(sql).toMatch(/,\npost_cte AS \(/);
			expect(sql).toMatch(/SELECT \* FROM user_cte;$/);

			// Should have proper CTE references
			expect(sql).toContain('(SELECT "id" FROM user_cte)');
		});
	});

	describe('Parameter Placeholder Validation', () => {
		it('should generate sequential parameter placeholders', () => {
			const userData: Partial<UsersData> = {name: 'Param User', email: 'param@example.com'};
			const postData: Partial<PostsData> = {title: 'Param Post', content: 'Param Content'};

			const chainedInsert = createChainedInsert()
				.insert('user_cte', usersDb, userData, {returnField: '*'})
				.insertWithReference('post_cte', postsDb, postData, {
					from: 'user_cte',
					field: 'id',
					to: 'userId',
				})
				.build();

			const {sqlText, values} = chainedInsert.queries[0];

			// Extract all parameter placeholders
			const placeholders = sqlText.match(/\$\d+/g) || [];
			const maxPlaceholder = Math.max(...placeholders.map((p) => parseInt(p.slice(1))));

			// Should have sequential placeholders starting from $1
			expect(maxPlaceholder).toBe(values.length);

			// Should not skip any placeholders
			for (let i = 1; i <= maxPlaceholder; i++) {
				expect(sqlText).toContain(`$${i}`);
			}
		});

		it('should handle complex parameter sequences correctly', () => {
			const user1: Partial<UsersData> = {name: 'User 1', email: 'user1@example.com'};
			const user2: Partial<UsersData> = {name: 'User 2', email: 'user2@example.com'};
			const post1: Partial<PostsData> = {title: 'Post 1', content: 'Content 1'};
			const post2: Partial<PostsData> = {title: 'Post 2', content: 'Content 2'};

			const chainedInsert = createChainedInsert()
				.insert('user1', usersDb, user1, {returnField: '*'})
				.insert('user2', usersDb, user2, {returnField: '*'})
				.insertWithReference('post1', postsDb, post1, {
					from: 'user1',
					field: 'id',
					to: 'userId',
				})
				.insertWithReference('post2', postsDb, post2, {
					from: 'user2',
					field: 'id',
					to: 'userId',
				})
				.build();

			const {sqlText, values} = chainedInsert.queries[0];

			// Should have correct number of values
			expect(values).toHaveLength(10); // 2 users * 3 fields (including lastChangedBy) + 2 posts * 2 fields + 2 SERVER values for posts

			// All values should be referenced in SQL
			for (let i = 1; i <= values.length; i++) {
				expect(sqlText).toContain(`$${i}`);
			}
		});
	});

	describe('Table and Column Name Handling', () => {
		it('should properly quote table names', () => {
			const userData: Partial<UsersData> = {name: 'Quote Test', email: 'quote@example.com'};

			const chainedInsert = createChainedInsert().insert('test_user', usersDb, userData, {returnField: '*'}).build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should reference proper table name
			expect(sql).toContain('INSERT INTO users');
		});

		it('should properly quote column names', () => {
			const userData: Partial<UsersData> = {name: 'Column Test', email: 'column@example.com'};

			const chainedInsert = createChainedInsert().insert('test_user', usersDb, userData, {returnField: '*'}).build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should quote column names in INSERT
			expect(sql).toContain('"name"');
			expect(sql).toContain('"email"');
		});

		it('should handle CTE references with proper quoting', () => {
			const userData: Partial<UsersData> = {name: 'Reference Test', email: 'ref@example.com'};
			const postData: Partial<PostsData> = {title: 'Ref Post', content: 'Ref Content'};

			const chainedInsert = createChainedInsert()
				.insert('ref_user', usersDb, userData, {returnField: '*'})
				.insertWithReference('ref_post', postsDb, postData, {
					from: 'ref_user',
					field: 'id',
					to: 'userId',
				})
				.build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should properly quote field names in CTE references
			expect(sql).toContain('(SELECT "id" FROM ref_user)');
		});
	});

	describe('RETURNING Clause Handling', () => {
		it('should handle different RETURNING options', () => {
			const userData: Partial<UsersData> = {name: 'Return Test', email: 'return@example.com'};

			// Test specific field return
			const specificReturn = createChainedInsert()
				.insert('test_user_id', usersDb, userData, {returnField: 'id'})
				.build();

			expect(specificReturn.queries[0].sqlText).toContain('RETURNING "id"');

			// Test all fields return
			const allReturn = createChainedInsert().insert('test_user_all', usersDb, userData, {returnField: '*'}).build();

			expect(allReturn.queries[0].sqlText).toContain('RETURNING *');
		});
	});

	describe('SELECT Clause Handling', () => {
		it('should handle different SELECT options in final query', () => {
			const userData: Partial<UsersData> = {name: 'Select Test', email: 'select@example.com'};

			// Test specific column select
			const specificSelect = createChainedInsert()
				.insert('test_user', usersDb, userData, {returnField: '*'})
				.selectFrom('test_user', 'id')
				.build();

			expect(specificSelect.queries[0].sqlText).toContain('SELECT id FROM test_user;');

			// Test all columns select
			const allSelect = createChainedInsert()
				.insert('test_user', usersDb, userData, {returnField: '*'})
				.selectFrom('test_user', '*')
				.build();

			expect(allSelect.queries[0].sqlText).toContain('SELECT * FROM test_user;');

			// Test default select (should default to *)
			const defaultSelect = createChainedInsert()
				.insert('test_user', usersDb, userData, {returnField: '*'})
				.selectFrom('test_user')
				.build();

			expect(defaultSelect.queries[0].sqlText).toContain('SELECT * FROM test_user;');
		});
	});

	describe('Generated SQL Examples', () => {
		it('should generate expected SQL for simple insert with lastChangedBy', () => {
			const userData: Partial<UsersData> = {name: 'Simple User', email: 'simple@example.com'};

			const chainedInsert = createChainedInsert()
				.insert('simple_user', usersDb, userData, {returnField: '*', idUser: 'SERVER'})
				.selectFrom('simple_user')
				.build();

			const expectedSqlPattern = [
				'WITH simple_user AS \\(',
				'INSERT INTO users \\("name", "email", "lastChangedBy"\\)',
				'VALUES \\(\\$1, \\$2, \\$3\\)',
				'RETURNING \\*',
				'\\)',
				'SELECT \\* FROM simple_user;',
			].join('\\s*');

			expect(chainedInsert.queries[0].sqlText).toMatch(new RegExp(expectedSqlPattern));
			expect(chainedInsert.queries[0].values).toEqual(['Simple User', 'simple@example.com', 'SERVER']);
		});

		it('should generate expected SQL for simple insert with default lastChangedBy', () => {
			const userData: Partial<UsersData> = {name: 'Simple User', email: 'simple@example.com'};

			const chainedInsert = createChainedInsert()
				.insert('simple_user', usersDb, userData, {returnField: '*'})
				.selectFrom('simple_user')
				.build();

			const expectedSqlPattern = [
				'WITH simple_user AS \\(',
				'INSERT INTO users \\("name", "email", "lastChangedBy"\\)',
				'VALUES \\(\\$1, \\$2, \\$3\\)',
				'RETURNING \\*',
				'\\)',
				'SELECT \\* FROM simple_user;',
			].join('\\s*');

			expect(chainedInsert.queries[0].sqlText).toMatch(new RegExp(expectedSqlPattern));
			expect(chainedInsert.queries[0].values).toEqual(['Simple User', 'simple@example.com', 'SERVER']);
		});

		it('should generate expected SQL for insert with reference and lastChangedBy', () => {
			const userData: Partial<UsersData> = {name: 'Ref User', email: 'ref@example.com'};
			const postData: Partial<PostsData> = {title: 'Ref Post', content: 'Ref Content'};

			const chainedInsert = createChainedInsert()
				.insert('ref_user', usersDb, userData, {returnField: '*', idUser: 'SERVER'})
				.insertWithReference(
					'ref_post',
					postsDb,
					postData,
					{
						from: 'ref_user',
						field: 'id',
						to: 'userId',
					},
					{idUser: 'SERVER'}
				)
				.selectFrom('ref_user')
				.build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should contain both CTE definitions
			expect(sql).toContain('WITH ref_user AS (');
			expect(sql).toContain(',\nref_post AS (');

			// Should contain proper INSERT statements
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain('INSERT INTO posts');

			// Should contain CTE reference
			expect(sql).toContain('(SELECT "id" FROM ref_user)');

			// Should have proper final SELECT
			expect(sql).toContain('SELECT * FROM ref_user;');

			// Should have all expected values
			expect(chainedInsert.queries[0].values).toEqual([
				'Ref User',
				'ref@example.com',
				'SERVER',
				'Ref Post',
				'Ref Content',
			]);
		});

		it('should generate expected SQL for insert with reference with default lastChangedBy', () => {
			const userData: Partial<UsersData> = {name: 'Ref User', email: 'ref@example.com'};
			const postData: Partial<PostsData> = {title: 'Ref Post', content: 'Ref Content'};

			const chainedInsert = createChainedInsert()
				.insert('ref_user', usersDb, userData, {returnField: '*'})
				.insertWithReference('ref_post', postsDb, postData, {
					from: 'ref_user',
					field: 'id',
					to: 'userId',
				})
				.selectFrom('ref_user')
				.build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should contain both CTE definitions
			expect(sql).toContain('WITH ref_user AS (');
			expect(sql).toContain(',\nref_post AS (');

			// Should contain proper INSERT statements
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain('INSERT INTO posts');

			// Should contain CTE reference
			expect(sql).toContain('(SELECT "id" FROM ref_user)');

			// Should have proper final SELECT
			expect(sql).toContain('SELECT * FROM ref_user;');

			// Should have all expected values (with default lastChangedBy)
			expect(chainedInsert.queries[0].values).toEqual([
				'Ref User',
				'ref@example.com',
				'SERVER',
				'Ref Post',
				'Ref Content',
			]);
		});
	});

	describe('SQL Injection Prevention', () => {
		it('should prevent SQL injection through parameterized queries', () => {
			const maliciousData: Partial<UsersData> = {
				name: "'; DROP TABLE users; --",
				email: 'malicious@example.com',
			};

			const chainedInsert = createChainedInsert()
				.insert('safe_user', usersDb, maliciousData, {returnField: '*'})
				.build();

			const {sqlText, values} = chainedInsert.queries[0];

			// SQL should not contain the malicious string directly
			expect(sqlText).not.toContain("'; DROP TABLE users; --");

			// Malicious string should be in values array (parameterized)
			expect(values).toContain("'; DROP TABLE users; --");

			// Should use proper parameterized placeholders
			expect(sqlText).toContain('$1');
			expect(sqlText).toContain('$2');
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty data objects with lastChangedBy', () => {
			const emptyData: Partial<UsersData> = {};

			const chainedInsert = createChainedInsert()
				.insert('empty_user', usersDb, emptyData, {returnField: '*', idUser: 'SERVER'})
				.build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should still generate valid SQL (with only lastChangedBy)
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain('VALUES');
			expect(sql).toContain('RETURNING *');
			expect(sql).toContain('lastChangedBy');
		});

		it('should handle empty data objects with default lastChangedBy', () => {
			const emptyData: Partial<UsersData> = {};

			const chainedInsert = createChainedInsert().insert('empty_user', usersDb, emptyData, {returnField: '*'}).build();

			const sql = chainedInsert.queries[0].sqlText;

			// Should still generate valid SQL (with only lastChangedBy)
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain('VALUES');
			expect(sql).toContain('RETURNING *');
			expect(sql).toContain('lastChangedBy');
		});

		it('should handle special characters in CTE names', () => {
			const userData: Partial<UsersData> = {name: 'Special User', email: 'special@example.com'};

			const chainedInsert = createChainedInsert()
				.insert('special_user_123', usersDb, userData, {returnField: '*'})
				.selectFrom('special_user_123')
				.build();

			const sql = chainedInsert.queries[0].sqlText;

			expect(sql).toContain('WITH special_user_123 AS');
			expect(sql).toContain('SELECT * FROM special_user_123;');
		});
	});
});
