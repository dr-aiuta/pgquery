import {setupTests, dbpg, createMockQueryResult} from '../pg-lightquery/test-setup';
import {EnhancedTableBase} from '../../../src/core/table-base-extensions';
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

// Create test enhanced table classes
class TestUsersTable extends EnhancedTableBase<UsersSchema> {
	constructor() {
		super(usersTableDef);
		this.registerRelatedTable('posts', {tableDefinition: postsTableDef});
		this.registerRelatedTable('addresses', {tableDefinition: addressesTableDef});
	}

	public testUpdateWithRelatedTables(
		userId: number,
		userData: Partial<UsersData>,
		postData?: {id: number; data: Partial<PostsData>},
		addressData?: {id: number; data: Partial<AddressesData>}
	) {
		let chainedBuilder = this.createChainedInsert();

		// Update user
		chainedBuilder = chainedBuilder.update('user_update', this.db, userData, {id: userId}, {returnField: '*'});

		// Update post if provided
		if (postData) {
			chainedBuilder = chainedBuilder.updateTable(
				'post_update',
				'posts',
				postData.data,
				{id: postData.id},
				{returnField: '*'}
			);
		}

		// Update address if provided
		if (addressData) {
			chainedBuilder = chainedBuilder.updateTable(
				'address_update',
				'addresses',
				addressData.data,
				{id: addressData.id},
				{returnField: '*'}
			);
		}

		return chainedBuilder.selectFrom('user_update').build();
	}

	public testMixedOperations(newUserData: Partial<UsersData>, existingPostId: number, postUpdate: Partial<PostsData>) {
		return (
			this.createChainedInsert()
				// Insert new user
				.insert('new_user', this.db, newUserData, {returnField: '*'})
				// Update existing post with new user's ID
				.updateTableWithReference(
					'updated_post',
					'posts',
					postUpdate,
					{id: existingPostId},
					{from: 'new_user', field: 'id', to: 'userId'},
					{returnField: '*'}
				)
				.selectFrom('new_user')
				.build()
		);
	}

	public testConditionalUpdates(
		userId: number,
		userData: Partial<UsersData>,
		shouldUpdatePost: boolean,
		postData?: {id: number; data: Partial<PostsData>}
	) {
		return this.createChainedInsert()
			.update('user_update', this.db, userData, {id: userId}, {returnField: '*'})
			.updateTableIf(
				shouldUpdatePost && !!postData,
				'post_update',
				'posts',
				postData?.data || {},
				{id: postData?.id || 0},
				{returnField: '*'}
			)
			.selectFrom('user_update')
			.build();
	}

	// Public method to test type safety and method chaining
	public testTypeSafety() {
		return this.createChainedInsert()
			.insert('user1', this.db, {name: 'User 1'}, {returnField: '*'})
			.insertIntoTable('user2', 'posts', {title: 'Post 1'}, {returnField: '*'})
			.update('user3', this.db, {name: 'Updated'}, {id: 1})
			.updateTable('post1', 'posts', {title: 'Updated'}, {id: 1})
			.updateTableWithReference(
				'post2',
				'posts',
				{content: 'New content'},
				{id: 2},
				{from: 'user1', field: 'id', to: 'userId'}
			)
			.selectFrom('user1');
	}
}

describe('EnhancedTableBase - Update Operations', () => {
	setupTests();

	let testUsersTable: TestUsersTable;

	beforeEach(() => {
		testUsersTable = new TestUsersTable();
	});

	describe('Update with registered tables', () => {
		it('should update main table and related tables using registered names', async () => {
			const userData: Partial<UsersData> = {name: 'Updated Name'};
			const postData: Partial<PostsData> = {title: 'Updated Title'};
			const addressData: Partial<AddressesData> = {city: 'Updated City'};

			const expectedResults = [{id: 1, name: 'Updated Name', email: 'user@example.com'}];
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult(expectedResults));

			const result = testUsersTable.testUpdateWithRelatedTables(
				1,
				userData,
				{id: 10, data: postData},
				{id: 20, data: addressData}
			);

			// Verify SQL structure
			expect(result.queries).toHaveLength(1);
			const sql = result.queries[0].sqlText;
			expect(sql).toContain('WITH user_update AS');
			expect(sql).toContain('UPDATE users');
			expect(sql).toContain(',\npost_update AS');
			expect(sql).toContain('UPDATE posts');
			expect(sql).toContain(',\naddress_update AS');
			expect(sql).toContain('UPDATE addresses');
			expect(sql).toContain('SELECT * FROM user_update');

			// Execute and verify result
			const executionResult = await result.execute();
			expect(executionResult[0].rows).toEqual(expectedResults);
		});

		it('should handle updateTableWithReference correctly', async () => {
			const newUserData: Partial<UsersData> = {
				name: 'New User',
				email: 'newuser@example.com',
			};
			const postUpdate: Partial<PostsData> = {
				title: 'Post now owned by new user',
				content: 'Updated content',
			};

			const expectedResults = [{id: 1, ...newUserData}];
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult(expectedResults));

			const result = testUsersTable.testMixedOperations(
				newUserData,
				5, // existing post ID
				postUpdate
			);

			// Verify SQL structure
			const sql = result.queries[0].sqlText;
			expect(sql).toContain('WITH new_user AS');
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain(',\nupdated_post AS');
			expect(sql).toContain('UPDATE posts');
			expect(sql).toContain('(SELECT "id" FROM new_user)'); // Reference injection

			// Execute and verify result
			const executionResult = await result.execute();
			expect(executionResult[0].rows).toEqual(expectedResults);
		});

		it('should handle conditional updates with registered tables', async () => {
			const userData: Partial<UsersData> = {name: 'Updated User'};
			const postData = {id: 10, data: {title: 'Should not appear'} as Partial<PostsData>};

			const expectedResults = [{id: 1, name: 'Updated User'}];
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult(expectedResults));

			// Test with condition false
			const resultFalse = testUsersTable.testConditionalUpdates(
				1,
				userData,
				false, // Should not update post
				postData
			);

			let sql = resultFalse.queries[0].sqlText;
			expect(sql).toContain('WITH user_update AS');
			expect(sql).not.toContain('post_update');
			expect(sql).not.toContain('UPDATE posts');

			// Test with condition true
			const resultTrue = testUsersTable.testConditionalUpdates(
				1,
				userData,
				true, // Should update post
				postData
			);

			sql = resultTrue.queries[0].sqlText;
			expect(sql).toContain('WITH user_update AS');
			expect(sql).toContain(',\npost_update AS');
			expect(sql).toContain('UPDATE posts');
		});
	});

	describe('Type safety and method chaining', () => {
		it('should maintain type safety through method chains', async () => {
			// This test verifies that the type system works correctly
			// and we can chain methods without type errors
			const builder = testUsersTable.testTypeSafety();

			// Should compile without errors and build successfully
			const result = builder.build();
			expect(result.queries).toHaveLength(1);
			expect(result.queries[0].sqlText).toContain('WITH user1 AS');
		});
	});

	describe('Error handling', () => {
		it('should throw error for unregistered table', () => {
			// Add a public method to test error handling
			class TestErrorTable extends EnhancedTableBase<UsersSchema> {
				constructor() {
					super(usersTableDef);
				}

				public testUnregisteredTable() {
					return this.createChainedInsert().updateTable('update1', 'unregistered_table', {}, {id: 1}).build();
				}
			}

			const errorTable = new TestErrorTable();
			expect(() => {
				errorTable.testUnregisteredTable();
			}).toThrow("Related table 'unregistered_table' is not registered");
		});
	});
});
