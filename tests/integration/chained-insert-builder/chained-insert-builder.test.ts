import {
	setupTests,
	dbpg,
	usersTable,
	postsTable,
	addressesTable,
	createMockQueryResult,
} from '../pg-lightquery/test-setup';
import {createChainedInsert} from '../../../src/utils/chained-insert-builder';
import {DatabaseOperations} from '../../../src/core/database-operations';
import {TableDefinition} from '../../../src/types/core-types';
import {UsersData, UsersSchema, usersColumns} from '../../tables/definitions/users';
import {PostsData, PostsSchema, postsColumns} from '../../tables/definitions/posts';
import {AddressesData, AddressesSchema, addressesColumns} from '../../tables/definitions/addresses';

// Define test table definitions
const usersTableDef: TableDefinition<UsersSchema> = {
	tableName: 'users',
	schema: {columns: usersColumns},
};

const postsTableDef: TableDefinition<PostsSchema> = {
	tableName: 'posts',
	schema: {columns: postsColumns},
};

const addressesTableDef: TableDefinition<AddressesSchema> = {
	tableName: 'addresses',
	schema: {columns: addressesColumns},
};

describe('ChainedInsertBuilder - Reusability Tests', () => {
	setupTests();

	let usersDb: DatabaseOperations<UsersSchema>;
	let postsDb: DatabaseOperations<PostsSchema>;
	let addressesDb: DatabaseOperations<AddressesSchema>;

	beforeEach(() => {
		usersDb = new DatabaseOperations(usersTableDef);
		postsDb = new DatabaseOperations(postsTableDef);
		addressesDb = new DatabaseOperations(addressesTableDef);
	});

	describe('Basic Chained Insert Functionality', () => {
		it('should create a simple chained insert with one CTE', async () => {
			const userData: Partial<UsersData> = {
				name: 'John Doe',
				email: 'john@example.com',
			};

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.selectFrom('new_user')
				.build();

			// Verify SQL structure
			expect(chainedInsert.queries).toHaveLength(1);
			expect(chainedInsert.queries[0].sqlText).toContain('WITH new_user AS');
			expect(chainedInsert.queries[0].sqlText).toContain('INSERT INTO users');
			expect(chainedInsert.queries[0].sqlText).toContain('SELECT * FROM new_user');

			// Execute and verify result
			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});

		it('should handle multiple independent CTEs', async () => {
			const userData: Partial<UsersData> = {name: 'Jane Doe', email: 'jane@example.com'};
			const userData2: Partial<UsersData> = {name: 'Bob Smith', email: 'bob@example.com'};

			const expectedResults = [
				{id: 1, ...userData},
				{id: 2, ...userData2},
			];
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult(expectedResults));

			const chainedInsert = createChainedInsert()
				.insert('user1', usersDb, userData, {returnField: '*'})
				.insert('user2', usersDb, userData2, {returnField: '*'})
				.selectFrom('user1')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('WITH user1 AS');
			expect(sql).toContain(',\nuser2 AS');
			expect(sql).toContain('SELECT * FROM user1');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual(expectedResults);
		});
	});

	describe('Chained Inserts with References', () => {
		it('should create user and related post in one transaction', async () => {
			const userData: Partial<UsersData> = {name: 'Author Name', email: 'author@example.com'};
			const postData: Partial<PostsData> = {title: 'My First Post', content: 'Post content here'};

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.insertWithReference(
					'new_post',
					postsDb,
					postData,
					{
						from: 'new_user',
						field: 'id',
						to: 'userId',
					},
					{returnField: '*'}
				)
				.selectFrom('new_user')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('WITH new_user AS');
			expect(sql).toContain(',\nnew_post AS');
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain('INSERT INTO posts');
			expect(sql).toContain('(SELECT "id" FROM new_user)');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});

		it('should create user with multiple related records', async () => {
			const userData: Partial<UsersData> = {name: 'User With Data', email: 'user@example.com'};
			const postData: Partial<PostsData> = {title: 'User Post', content: 'Content'};
			const addressData: Partial<AddressesData> = {
				street: '123 Main St',
				neighborhood: 'Downtown',
				city: 'Anytown',
			};

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.insertWithReference('new_post', postsDb, postData, {
					from: 'new_user',
					field: 'id',
					to: 'userId',
				})
				.insertWithReference('new_address', addressesDb, addressData, {
					from: 'new_user',
					field: 'id',
					to: 'userId',
				})
				.selectFrom('new_user')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('WITH new_user AS');
			expect(sql).toContain(',\nnew_post AS');
			expect(sql).toContain(',\nnew_address AS');
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain('INSERT INTO posts');
			expect(sql).toContain('INSERT INTO addresses');

			// Should have two CTE references
			const cteReferences = sql.match(/\(SELECT "[^"]*" FROM [^)]+\)/g);
			expect(cteReferences).toHaveLength(2);

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});
	});

	describe('Conditional Chained Inserts', () => {
		it('should conditionally insert based on true condition', async () => {
			const userData: Partial<UsersData> = {name: 'Conditional User', email: 'conditional@example.com'};
			const postData: Partial<PostsData> = {title: 'Conditional Post', content: 'Content'};

			const shouldCreatePost = true;
			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.insertWithReferenceIf(shouldCreatePost, 'new_post', postsDb, postData, {
					from: 'new_user',
					field: 'id',
					to: 'userId',
				})
				.selectFrom('new_user')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('WITH new_user AS');
			expect(sql).toContain(',\nnew_post AS');
			expect(sql).toContain('INSERT INTO posts');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});

		it('should skip conditional insert when condition is false', async () => {
			const userData: Partial<UsersData> = {name: 'User Only', email: 'useronly@example.com'};
			const postData: Partial<PostsData> = {title: 'Skipped Post', content: 'Content'};

			const shouldCreatePost = false;
			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.insertWithReferenceIf(shouldCreatePost, 'new_post', postsDb, postData, {
					from: 'new_user',
					field: 'id',
					to: 'userId',
				})
				.selectFrom('new_user')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('WITH new_user AS');
			expect(sql).not.toContain('new_post AS');
			expect(sql).not.toContain('INSERT INTO posts');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});
	});

	describe('Different Return Field Options', () => {
		it('should return specific field from CTE', async () => {
			const userData: Partial<UsersData> = {name: 'Specific Return', email: 'specific@example.com'};
			const expectedId = {id: 42};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedId]));

			const chainedInsert = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: 'id'})
				.selectFrom('new_user', 'id')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('RETURNING "id"');
			expect(sql).toContain('SELECT id FROM new_user');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedId]);
		});

		it('should return all fields when using asterisk', async () => {
			const userData: Partial<UsersData> = {name: 'Full Return', email: 'full@example.com'};
			const expectedUser = {
				id: 1,
				name: 'Full Return',
				email: 'full@example.com',
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.selectFrom('new_user', '*')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('RETURNING *');
			expect(sql).toContain('SELECT * FROM new_user');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});
	});

	describe('Parameter Handling and SQL Safety', () => {
		it('should properly handle parameter placeholders across multiple CTEs', async () => {
			const userData: Partial<UsersData> = {name: 'Param User', email: 'param@example.com'};
			const postData: Partial<PostsData> = {title: 'Param Post', content: 'Param Content'};
			const addressData: Partial<AddressesData> = {street: 'Param St', neighborhood: 'Param Hood', city: 'Param City'};

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('user', usersDb, userData, {returnField: '*'})
				.insertWithReference('post', postsDb, postData, {from: 'user', field: 'id', to: 'userId'})
				.insertWithReference('address', addressesDb, addressData, {from: 'user', field: 'id', to: 'userId'})
				.selectFrom('user')
				.build();

			const query = chainedInsert.queries[0];

			// Should have proper parameter placeholders ($1, $2, $3, etc.)
			const parameterMatches = query.sqlText.match(/\$\d+/g);
			expect(parameterMatches).toBeTruthy();
			expect(parameterMatches!.length).toBeGreaterThan(0);

			// Should have corresponding values
			expect(query.values).toContain('Param User');
			expect(query.values).toContain('param@example.com');
			expect(query.values).toContain('Param Post');
			expect(query.values).toContain('Param Content');
			expect(query.values).toContain('Param St');
			expect(query.values).toContain('Param Hood');
			expect(query.values).toContain('Param City');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});

		it('should handle special characters and prevent SQL injection', async () => {
			const userData: Partial<UsersData> = {
				name: "O'Reilly; DROP TABLE users; --",
				email: 'potentially.malicious@example.com',
			};

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('safe_user', usersDb, userData, {returnField: '*'})
				.selectFrom('safe_user')
				.build();

			const query = chainedInsert.queries[0];

			// Should use parameterized queries, not direct string interpolation
			expect(query.sqlText).not.toContain("O'Reilly; DROP TABLE users; --");
			expect(query.sqlText).toContain('$1');
			expect(query.values).toContain("O'Reilly; DROP TABLE users; --");

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});
	});

	describe('Complex Business Logic Scenarios', () => {
		it('should handle a complex e-commerce-like scenario', async () => {
			// Simulate creating a user, their first post, and conditionally their address
			const userData: Partial<UsersData> = {name: 'New Customer', email: 'customer@shop.com'};
			const welcomePost: Partial<PostsData> = {title: 'Welcome!', content: 'Thanks for joining!'};
			const billingAddress: Partial<AddressesData> = {
				street: '123 Billing St',
				neighborhood: 'Commerce District',
				city: 'Business City',
			};

			const hasShippingAddress = true;
			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				// Create the user account
				.insert('new_customer', usersDb, userData, {returnField: '*'})
				// Create welcome post
				.insertWithReference('welcome_post', postsDb, welcomePost, {
					from: 'new_customer',
					field: 'id',
					to: 'userId',
				})
				// Conditionally create shipping address
				.insertWithReferenceIf(hasShippingAddress, 'billing_address', addressesDb, billingAddress, {
					from: 'new_customer',
					field: 'id',
					to: 'userId',
				})
				.selectFrom('new_customer')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('WITH new_customer AS');
			expect(sql).toContain(',\nwelcome_post AS');
			expect(sql).toContain(',\nbilling_address AS');
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain('INSERT INTO posts');
			expect(sql).toContain('INSERT INTO addresses');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});

		it('should handle chain with mixed conditional logic', async () => {
			const userData: Partial<UsersData> = {name: 'Mixed User', email: 'mixed@example.com'};
			const postData: Partial<PostsData> = {title: 'Maybe Post', content: 'Maybe Content'};
			const addressData: Partial<AddressesData> = {street: 'Maybe St', neighborhood: 'Maybe Hood', city: 'Maybe City'};

			const createPost = true;
			const createAddress = false;
			const createSecondPost = true;

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedInsert = createChainedInsert()
				.insert('user', usersDb, userData, {returnField: '*'})
				.insertWithReferenceIf(createPost, 'post1', postsDb, postData, {
					from: 'user',
					field: 'id',
					to: 'userId',
				})
				.insertWithReferenceIf(createAddress, 'address', addressesDb, addressData, {
					from: 'user',
					field: 'id',
					to: 'userId',
				})
				.insertWithReferenceIf(
					createSecondPost,
					'post2',
					postsDb,
					{...postData, title: 'Second Post'},
					{
						from: 'user',
						field: 'id',
						to: 'userId',
					}
				)
				.selectFrom('user')
				.build();

			const sql = chainedInsert.queries[0].sqlText;
			expect(sql).toContain('WITH user AS');
			expect(sql).toContain(',\npost1 AS');
			expect(sql).not.toContain('address AS'); // Should be skipped
			expect(sql).toContain(',\npost2 AS');

			const result = await chainedInsert.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});
	});

	describe('Error Handling', () => {
		it('should throw error when no CTEs are defined', () => {
			expect(() => {
				createChainedInsert().build();
			}).toThrow('No insert steps defined');
		});

		it('should handle database errors gracefully', async () => {
			const userData: Partial<UsersData> = {name: 'Error User', email: 'error@example.com'};
			const dbError = new Error('Database connection failed');
			(dbpg.query as jest.Mock).mockRejectedValue(dbError);

			const chainedInsert = createChainedInsert()
				.insert('error_user', usersDb, userData, {returnField: '*'})
				.selectFrom('error_user')
				.build();

			await expect(chainedInsert.execute()).rejects.toThrow('Database connection failed');
		});
	});
});
