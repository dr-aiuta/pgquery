import {setupTests, dbpg, createMockQueryResult} from '../pg-lightquery/test-setup';
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

describe('ChainedInsertBuilder - Update Operations', () => {
	setupTests();

	let usersDb: DatabaseOperations<UsersSchema>;
	let postsDb: DatabaseOperations<PostsSchema>;
	let addressesDb: DatabaseOperations<AddressesSchema>;

	beforeEach(() => {
		usersDb = new DatabaseOperations(usersTableDef);
		postsDb = new DatabaseOperations(postsTableDef);
		addressesDb = new DatabaseOperations(addressesTableDef);
	});

	describe('Basic Update Functionality', () => {
		it('should create a simple update operation', async () => {
			const updateData: Partial<UsersData> = {
				name: 'Updated Name',
				email: 'updated@example.com',
			};
			const whereClause: Partial<UsersData> = {
				id: 1,
			};

			const expectedUser = {id: 1, ...updateData};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedUser]));

			const chainedUpdate = createChainedInsert()
				.update('updated_user', usersDb, updateData, whereClause, {returnField: '*'})
				.selectFrom('updated_user')
				.build();

			// Verify SQL structure
			expect(chainedUpdate.queries).toHaveLength(1);
			expect(chainedUpdate.queries[0].sqlText).toContain('WITH updated_user AS');
			expect(chainedUpdate.queries[0].sqlText).toContain('UPDATE users');
			expect(chainedUpdate.queries[0].sqlText).toContain('SET');
			expect(chainedUpdate.queries[0].sqlText).toContain('WHERE');
			expect(chainedUpdate.queries[0].sqlText).toContain('SELECT * FROM updated_user');

			// Execute and verify result
			const result = await chainedUpdate.execute();
			expect(result[0].rows).toEqual([expectedUser]);
		});

		it('should handle multiple update operations in one transaction', async () => {
			const userUpdate: Partial<UsersData> = {name: 'Updated User'};
			const postUpdate: Partial<PostsData> = {title: 'Updated Title', content: 'Updated content'};

			const expectedResults = [{id: 1, name: 'Updated User', email: 'user@example.com'}];
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult(expectedResults));

			const chainedUpdate = createChainedInsert()
				.update('user_update', usersDb, userUpdate, {id: 1}, {returnField: '*'})
				.update('post_update', postsDb, postUpdate, {id: 10}, {returnField: '*'})
				.selectFrom('user_update')
				.build();

			const sql = chainedUpdate.queries[0].sqlText;
			expect(sql).toContain('WITH user_update AS');
			expect(sql).toContain(',\npost_update AS');
			expect(sql).toContain('UPDATE users');
			expect(sql).toContain('UPDATE posts');
			expect(sql).toContain('SELECT * FROM user_update');

			const result = await chainedUpdate.execute();
			expect(result[0].rows).toEqual(expectedResults);
		});
	});

	describe('Update with References', () => {
		it('should update a table with reference to a previous CTE', async () => {
			const userData: Partial<UsersData> = {name: 'New User', email: 'new@example.com'};
			const postUpdate: Partial<PostsData> = {
				title: 'Updated Post',
				content: 'This post now belongs to the new user',
			};

			const expectedResults = [{id: 1, ...userData}];
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult(expectedResults));

			const chainedOps = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.updateWithReference(
					'updated_post',
					postsDb,
					postUpdate,
					{id: 5}, // WHERE post id = 5
					{from: 'new_user', field: 'id', to: 'userId'},
					{returnField: '*'}
				)
				.selectFrom('new_user')
				.build();

			const sql = chainedOps.queries[0].sqlText;
			expect(sql).toContain('WITH new_user AS');
			expect(sql).toContain('INSERT INTO users');
			expect(sql).toContain(',\nupdated_post AS');
			expect(sql).toContain('UPDATE posts SET');
			expect(sql).toContain('(SELECT "id" FROM new_user)'); // Reference injection

			const result = await chainedOps.execute();
			expect(result[0].rows).toEqual(expectedResults);
		});
	});

	describe('Conditional Update Operations', () => {
		it('should skip update when condition is false', async () => {
			const userData: Partial<UsersData> = {name: 'Test User'};
			const postUpdate: Partial<PostsData> = {title: 'Should not appear'};

			const expectedResults = [{id: 1, ...userData}];
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult(expectedResults));

			const shouldUpdatePost = false;

			const chainedOps = createChainedInsert()
				.insert('new_user', usersDb, userData, {returnField: '*'})
				.updateIf(shouldUpdatePost, 'post_update', postsDb, postUpdate, {id: 1}, {returnField: '*'})
				.selectFrom('new_user')
				.build();

			const sql = chainedOps.queries[0].sqlText;
			expect(sql).toContain('WITH new_user AS');
			expect(sql).not.toContain('post_update'); // Should not include update CTE
			expect(sql).not.toContain('UPDATE posts');
		});
	});

	describe('Error Handling', () => {
		it('should throw error when no operations are defined', () => {
			expect(() => {
				createChainedInsert().build();
			}).toThrow('No insert or update steps defined');
		});
	});
});
