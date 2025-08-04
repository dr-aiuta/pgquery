import {setupTests, dbpg, createMockQueryResult} from '../pg-lightquery/test-setup';
import {EnhancedTableBase} from '../../../src/core/table-base-extensions';
import {TableDefinition} from '../../../src/types/core-types';
import {DatabaseOperations} from '../../../src/core/database-operations';
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

// Test implementations of EnhancedTableBase
class TestUsersTable extends EnhancedTableBase<UsersSchema> {
	constructor() {
		super(usersTableDef);
		this.registerRelatedTable('posts', {tableDefinition: postsTableDef});
		this.registerRelatedTable('addresses', {tableDefinition: addressesTableDef});
	}

	// Make protected method public for testing
	public getRelatedTable<R extends Record<string, {type: any}>>(name: string): DatabaseOperations<R> {
		return super.getRelatedTable(name);
	}

	public createUserWithProfile(userData: Partial<UsersData>, includePost = false, includeAddress = false) {
		const postData: Partial<PostsData> = {
			title: 'Welcome Post',
			content: 'Welcome to our platform!',
		};

		const addressData: Partial<AddressesData> = {
			street: '123 Default St',
			neighborhood: 'Default Area',
			city: 'Default City',
		};

		return this.createChainedInsert()
			.insert('new_user', this.db, userData, {returnField: '*'})
			.insertWithReferenceIf(includePost, 'user_post', this.getRelatedTable('posts'), postData, {
				from: 'new_user',
				field: 'id',
				to: 'userId',
			})
			.insertWithReferenceIf(includeAddress, 'user_address', this.getRelatedTable('addresses'), addressData, {
				from: 'new_user',
				field: 'id',
				to: 'userId',
			})
			.selectFrom('new_user')
			.build();
	}

	public createUserWithMultiplePosts(userData: Partial<UsersData>, postTitles: string[]) {
		let builder = this.createChainedInsert().insert('new_user', this.db, userData, {returnField: '*'});

		postTitles.forEach((title, index) => {
			const postData: Partial<PostsData> = {
				title,
				content: `Content for post: ${title}`,
			};

			builder = builder.insertWithReference(`user_post_${index}`, this.getRelatedTable('posts'), postData, {
				from: 'new_user',
				field: 'id',
				to: 'userId',
			});
		});

		return builder.selectFrom('new_user').build();
	}

	// Example method showing integration with existing TableBase methods
	public createUserAndGetDetails(userData: Partial<UsersData>) {
		// First create the user with chained inserts
		const createResult = this.createUserWithProfile(userData, true, true);

		// Then use existing select methods for queries
		const selectResult = this.select<UsersData>({
			allowedColumns: '*',
			options: {where: {email: userData.email}},
		});

		return {
			create: createResult,
			select: selectResult,
		};
	}
}

// Another test table showing different patterns
class TestBlogTable extends EnhancedTableBase<PostsSchema> {
	constructor() {
		super(postsTableDef);
		this.registerRelatedTable('users', {tableDefinition: usersTableDef});
	}

	public createBlogPostWithAuthor(authorData: Partial<UsersData>, postData: Partial<PostsData>) {
		return this.createChainedInsert()
			.insert('new_author', this.getRelatedTable('users'), authorData, {returnField: '*'})
			.insertWithReference(
				'new_post',
				this.db,
				postData,
				{
					from: 'new_author',
					field: 'id',
					to: 'userId',
				},
				{returnField: '*'}
			)
			.selectFrom('new_post')
			.build();
	}
}

describe('EnhancedTableBase - Advanced Reusability Tests', () => {
	setupTests();

	let usersTable: TestUsersTable;
	let blogTable: TestBlogTable;

	beforeEach(() => {
		usersTable = new TestUsersTable();
		blogTable = new TestBlogTable();
	});

	describe('Related Table Registration', () => {
		it('should register and retrieve related tables', () => {
			// Verify tables were registered in constructor
			expect(() => usersTable.getRelatedTable('posts')).not.toThrow();
			expect(() => usersTable.getRelatedTable('addresses')).not.toThrow();

			// Should throw for unregistered tables
			expect(() => usersTable.getRelatedTable('nonexistent')).toThrow("Related table 'nonexistent' is not registered");
		});
	});

	describe('Business Logic Methods', () => {
		it('should create user with optional profile components', async () => {
			const userData: Partial<UsersData> = {
				name: 'Profile User',
				email: 'profile@example.com',
			};

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			// Test with both post and address
			const fullProfile = usersTable.createUserWithProfile(userData, true, true);
			const fullSql = fullProfile.queries[0].sqlText;

			expect(fullSql).toContain('WITH new_user AS');
			expect(fullSql).toContain(',\nuser_post AS');
			expect(fullSql).toContain(',\nuser_address AS');
			expect(fullSql).toContain('INSERT INTO users');
			expect(fullSql).toContain('INSERT INTO posts');
			expect(fullSql).toContain('INSERT INTO addresses');

			const result = await fullProfile.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});

		it('should create user with selective profile components', async () => {
			const userData: Partial<UsersData> = {
				name: 'Selective User',
				email: 'selective@example.com',
			};

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			// Test with only post, no address
			const partialProfile = usersTable.createUserWithProfile(userData, true, false);
			const partialSql = partialProfile.queries[0].sqlText;

			expect(partialSql).toContain('WITH new_user AS');
			expect(partialSql).toContain(',\nuser_post AS');
			expect(partialSql).not.toContain('user_address AS');
			expect(partialSql).toContain('INSERT INTO users');
			expect(partialSql).toContain('INSERT INTO posts');
			expect(partialSql).not.toContain('INSERT INTO addresses');

			const result = await partialProfile.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});

		it('should create user with multiple posts dynamically', async () => {
			const userData: Partial<UsersData> = {
				name: 'Prolific Writer',
				email: 'writer@example.com',
			};

			const postTitles = ['First Post', 'Second Post', 'Third Post'];
			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const multiPost = usersTable.createUserWithMultiplePosts(userData, postTitles);
			const multiSql = multiPost.queries[0].sqlText;

			expect(multiSql).toContain('WITH new_user AS');
			expect(multiSql).toContain(',\nuser_post_0 AS');
			expect(multiSql).toContain(',\nuser_post_1 AS');
			expect(multiSql).toContain(',\nuser_post_2 AS');

			// Should have three INSERT INTO posts statements
			const postInserts = multiSql.match(/INSERT INTO posts/g);
			expect(postInserts).toHaveLength(3);

			const result = await multiPost.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});
	});

	describe('Different Table Base Classes', () => {
		it('should work with different table types (blog posts)', async () => {
			const authorData: Partial<UsersData> = {
				name: 'Blog Author',
				email: 'author@blog.com',
			};

			const postData: Partial<PostsData> = {
				title: 'My Blog Post',
				content: 'This is a great blog post about testing.',
			};

			const expectedPost = {id: 1, userId: 1, ...postData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedPost]));

			const blogPost = blogTable.createBlogPostWithAuthor(authorData, postData);
			const blogSql = blogPost.queries[0].sqlText;

			expect(blogSql).toContain('WITH new_author AS');
			expect(blogSql).toContain(',\nnew_post AS');
			expect(blogSql).toContain('INSERT INTO users');
			expect(blogSql).toContain('INSERT INTO posts');
			expect(blogSql).toContain('SELECT * FROM new_post'); // Different final select

			const result = await blogPost.execute();
			expect(result[0].rows).toEqual([expectedPost]);
		});
	});

	describe('Integration with Existing TableBase Methods', () => {
		it('should combine chained inserts with regular table operations', async () => {
			const userData: Partial<UsersData> = {
				name: 'Integration User',
				email: 'integration@example.com',
			};

			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const combined = usersTable.createUserAndGetDetails(userData);

			// Should have both create and select operations
			expect(combined.create).toBeDefined();
			expect(combined.select).toBeDefined();

			// Create operation should use chained inserts
			const createSql = combined.create.queries[0].sqlText;
			expect(createSql).toContain('WITH new_user AS');

			// Select operation should use regular TableBase methods
			const selectSql = combined.select.query.sqlText;
			expect(selectSql).toContain('SELECT * FROM users');
			expect(selectSql).toContain('WHERE');

			// Both should be executable
			const createResult = await combined.create.execute();
			const selectResult = await combined.select.execute();

			expect(createResult[0].rows).toEqual([expectedUser]);
			expect(selectResult).toEqual([expectedUser]);
		});
	});

	describe('Real-world Scenario Simulation', () => {
		it('should handle complex user onboarding flow', async () => {
			// Simulate a complete user onboarding with welcome post and default address
			const newUserData: Partial<UsersData> = {
				name: 'New Customer',
				email: 'newcustomer@company.com',
			};

			const expectedUser = {id: 1, ...newUserData, createdAt: new Date(), updatedAt: new Date()};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			// Create user with full onboarding
			const onboarding = usersTable.createUserWithProfile(newUserData, true, true);

			// Verify the transaction includes all onboarding steps
			const sql = onboarding.queries[0].sqlText;
			expect(sql).toContain('INSERT INTO posts'); // Should contain posts insert
			expect(sql).toContain('INSERT INTO addresses'); // Should contain addresses insert

			// Execute onboarding
			const result = await onboarding.execute();
			expect(result[0].rows).toEqual([expectedUser]);

			// Verify transaction was called with correct structure
			expect(dbpg.query).toHaveBeenCalled();
			const calls = (dbpg.query as jest.Mock).mock.calls;
			// Find the call with the actual query (not BEGIN/COMMIT)
			const queryCall = calls.find(([sql]) => sql.includes('WITH new_user AS'));
			expect(queryCall).toBeDefined();
			const [sqlArg, valuesArg] = queryCall;
			expect(valuesArg).toContain(newUserData.name);
			expect(valuesArg).toContain(newUserData.email);
		});

		it('should handle content creation workflow', async () => {
			// Simulate creating multiple posts for an author
			const authorData: Partial<UsersData> = {
				name: 'Content Creator',
				email: 'creator@content.com',
			};

			const postTitles = [
				'Getting Started with Our Platform',
				'Advanced Features You Should Know',
				'Tips and Tricks for Power Users',
			];

			const expectedUser = {id: 1, ...authorData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const contentCreation = usersTable.createUserWithMultiplePosts(authorData, postTitles);
			const sql = contentCreation.queries[0].sqlText;

			// Should contain all post titles in the values
			postTitles.forEach((title) => {
				expect(contentCreation.queries[0].values).toContain(title);
			});

			// Should create the correct CTE structure
			expect(sql).toContain('WITH new_user AS');
			expect(sql).toContain('user_post_0 AS');
			expect(sql).toContain('user_post_1 AS');
			expect(sql).toContain('user_post_2 AS');

			const result = await contentCreation.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});
	});

	describe('Performance and Optimization', () => {
		it('should generate efficient SQL for large chains', async () => {
			const userData: Partial<UsersData> = {
				name: 'Performance Test User',
				email: 'performance@test.com',
			};

			// Create a large number of posts to test parameter handling
			const manyPosts = Array.from({length: 10}, (_, i) => `Post ${i + 1}`);
			const expectedUser = {id: 1, ...userData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const largChain = usersTable.createUserWithMultiplePosts(userData, manyPosts);
			const query = largChain.queries[0];

			// Should only generate one combined query (not multiple separate queries)
			expect(largChain.queries).toHaveLength(1);

			// Should have correct number of parameters
			const paramCount = query.values.length;
			expect(paramCount).toBeGreaterThan(20); // User data + 10 posts * 2 fields each + server values

			// Should have correct parameter placeholders
			const maxParam = Math.max(...(query.sqlText.match(/\$(\d+)/g) || []).map((p) => parseInt(p.slice(1))));
			expect(maxParam).toBe(paramCount);

			const result = await largChain.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});
	});
});
