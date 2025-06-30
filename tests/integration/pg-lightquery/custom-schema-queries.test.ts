import {setupTests, dbpg, usersTable} from './test-setup';
import {SelectUserDetailsInterface} from '../../tables/views/selectUserDetails';

describe('Table Operations - Custom Schema Queries', () => {
	setupTests();

	describe('selectWithCustomSchema functionality', () => {
		it('can filter by joined columns that are not in the original table schema', async () => {
			// This is the key test case - filtering by 'posts' which is a joined/aggregated column
			// that doesn't exist in the original users table
			const expectedResult = [
				{
					id: 1,
					name: 'John Doe',
					email: 'john.doe@example.com',
					posts: [
						{
							id: 1,
							title: 'First Post',
							content: 'This is my first post',
							createdAt: '2023-01-01T00:00:00.000Z',
							authorName: 'John Doe',
						},
					],
					addresses: [
						{
							id: 1,
							street: 'Main St',
							neighborhood: 'Downtown',
							city: 'New York',
							userId: '1',
						},
					],
				},
			];

			(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

			// Filter by posts (a joined/aggregated column) - this wouldn't work with the old select method
			// Using the 'not' operator to demonstrate filtering on joined data
			const result = await usersTable
				.selectUserDetails('*', {
					where: {
						'posts.not': null, // Filter for users who have posts
					},
				})
				.execute();

			expect(result).toEqual(expectedResult);

			// Verify the query was constructed correctly
			expect(dbpg.query).toHaveBeenCalledWith(
				expect.stringContaining('WITH user_posts AS'),
				expect.arrayContaining([null])
			);
		});

		it('can filter by nested address data in the joined result', async () => {
			const expectedResult = [
				{
					id: 2,
					name: 'Jane Doe',
					email: 'jane.doe@example.com',
					posts: null,
					addresses: [
						{
							id: 2,
							street: 'Broadway',
							neighborhood: 'Manhattan',
							city: 'New York',
							userId: '2',
						},
					],
				},
			];

			(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

			// Filter by addresses (another joined/aggregated column)
			// Using the 'not' operator to filter for users who have addresses
			const result = await usersTable
				.selectUserDetails('*', {
					where: {
						'addresses.not': null, // Filter for users who have addresses
					},
				})
				.execute();

			expect(result).toEqual(expectedResult);
		});

		it('allows selecting specific columns from the joined result', async () => {
			const expectedResult = [
				{
					id: 1,
					name: 'John Doe',
					posts: [
						{
							id: 1,
							title: 'First Post',
							content: 'This is my first post',
							createdAt: '2023-01-01T00:00:00.000Z',
							authorName: 'John Doe',
						},
					],
				},
			];

			(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

			// Select only specific columns from the joined result
			const result = await usersTable
				.selectUserDetails(['id', 'name', 'posts'], {
					where: {id: 1},
				})
				.execute();

			expect(result).toEqual(expectedResult);
		});

		it('works with complex filtering conditions on joined data', async () => {
			const expectedResult = [
				{
					id: 3,
					name: 'Alice Smith',
					email: 'alice.smith@example.com',
					posts: [
						{
							id: 3,
							title: 'Tech Article',
							content: 'Advanced database techniques',
							createdAt: '2023-02-15T00:00:00.000Z',
							authorName: 'Alice Smith',
						},
					],
					addresses: [
						{
							id: 3,
							street: 'Tech Drive',
							neighborhood: 'Silicon Valley',
							city: 'San Francisco',
							userId: '3',
						},
					],
				},
			];

			(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

			// Complex filtering with multiple conditions on joined data
			const result = await usersTable
				.selectUserDetails('*', {
					where: {
						'name.like': '%Alice%',
						'addresses.not': null, // Filter for users who have addresses
						'posts.not': null, // Filter for users who have posts
					},
				})
				.execute();

			expect(result).toEqual(expectedResult);
		});

		it('returns query object that can be inspected before execution', async () => {
			const selectResult = usersTable.selectUserDetails(['id', 'name', 'email'], {
				where: {
					'posts.not': null, // Filter for users who have posts
				},
			});

			// Verify we can inspect the query before execution
			expect(selectResult.query.sqlText).toContain('WITH user_posts AS');
			expect(selectResult.query.sqlText).toContain('LEFT JOIN posts_agg');
			expect(selectResult.query.sqlText).toContain('LEFT JOIN addresses_agg');
			// The query values array should be properly constructed
			expect(Array.isArray(selectResult.query.values)).toBe(true);

			// Verify it's still executable
			const mockResult = [
				{
					id: 1,
					name: 'Test User',
					email: 'test@example.com',
				},
			];
			(dbpg.query as jest.Mock).mockResolvedValue({rows: mockResult});

			const result = await selectResult.execute();
			expect(result).toEqual(mockResult);
		});

		it('handles empty result sets correctly', async () => {
			(dbpg.query as jest.Mock).mockResolvedValue({rows: []});

			const result = await usersTable
				.selectUserDetails('*', {
					where: {
						'name.like': '%NonExistent%', // Filter for users with non-existent name pattern
					},
				})
				.execute();

			expect(result).toEqual([]);
		});

		it('works with additional where clause conditions', async () => {
			const expectedResult = [
				{
					id: 1,
					name: 'John Doe',
					email: 'john.doe@example.com',
					posts: [],
					addresses: [],
				},
			];

			(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

			const result = await usersTable
				.selectUserDetails('*', {
					where: {id: 1},
					whereClause: 'u."createdAt" > NOW() - INTERVAL \'30 days\'',
				})
				.execute();

			expect(result).toEqual(expectedResult);

			// Verify both where conditions and whereClause are applied
			expect(dbpg.query).toHaveBeenCalledWith(
				expect.stringContaining('AND u."createdAt" > NOW() - INTERVAL \'30 days\''),
				expect.arrayContaining([1])
			);
		});

		it('demonstrates filtering by multiple joined columns with in operator', async () => {
			const expectedResult = [
				{
					id: 1,
					name: 'John Doe',
					email: 'john.doe@example.com',
					posts: [
						{
							id: 1,
							title: 'First Post',
							content: 'This is my first post',
							createdAt: '2023-01-01T00:00:00.000Z',
							authorName: 'John Doe',
						},
					],
					addresses: [
						{
							id: 1,
							street: 'Main St',
							neighborhood: 'Downtown',
							city: 'New York',
							userId: '1',
						},
					],
				},
			];

			(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

			// Using 'in' operator to filter by specific IDs and combined with joined data filtering
			const result = await usersTable
				.selectUserDetails(['id', 'name', 'email', 'posts', 'addresses'], {
					where: {
						'id.in': [1, 2, 3],
						'posts.not': null, // Only users with posts
						'addresses.not': null, // Only users with addresses
					},
				})
				.execute();

			expect(result).toEqual(expectedResult);

			// Verify the query parameters
			expect(dbpg.query).toHaveBeenCalledWith(
				expect.stringContaining('WITH user_posts AS'),
				expect.arrayContaining([1, 2, 3, null, null])
			);
		});
	});

	describe('comparison with original select method limitations', () => {
		it('demonstrates the limitation of the original select method', async () => {
			// This test shows what would happen if we tried to use the original select method
			// with joined columns - it would fail because 'posts' is not in the UsersSchema

			const expectedResult = [
				{
					id: 1,
					name: 'John Doe',
					email: 'john.doe@example.com',
				},
			];

			(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

			// Using the original selectUsers method - can only filter by columns in UsersSchema
			const result = await usersTable
				.selectUsers(['id', 'name', 'email'], {
					where: {
						id: 1,
						name: 'John Doe',
						// Can't filter by 'posts' here - would cause TypeScript error
						// 'posts.not': null // ❌ This would fail - 'posts' is not in UsersSchema
					},
				})
				.execute();

			expect(result).toEqual(expectedResult);
		});
	});
});
