import {setupTests, dbpg, usersTable} from './test-setup';

describe('Table Operations - Advanced Query Operations', () => {
	setupTests();

	it('gets users whose name contains a specific string', async () => {
		const nameSubstring = '%Doe%';
		const expectedResult = [
			{id: 1, name: 'John Doe', email: 'john.doe@example.com'},
			{id: 2, name: 'Jane Doe', email: 'jane.doe@example.com'},
		];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable
			.selectUsers(['id', 'name', 'email'], {
				where: {'name.like': nameSubstring},
			})
			.execute();

		expect(result).toEqual(expectedResult);
	});

	it('handles object params with nested properties correctly', async () => {
		const objParams = {'addresses.not': null}; // Filter for users who have addresses
		const expectedResult = [
			{
				id: 1,
				name: 'John Doe',
				email: 'john.doe@example.com',
				addresses: [
					{
						id: 1,
						street: 'Av Atlantica',
						neighborhood: 'COPACABANA',
						city: 'Rio de Janeiro',
						userId: '1',
					},
				],
			},
			{
				id: 2,
				name: 'Rita Ora',
				email: 'rita.ora@example.com',
				addresses: [
					{
						id: 2,
						street: 'Rua Bolivar',
						neighborhood: 'COPACABANA',
						city: 'Rio de Janeiro',
						userId: '2',
					},
				],
			},
		];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable
			.selectUserDetails('*', {
				where: objParams,
			})
			.execute();

		expect(result).toEqual(expectedResult);
	});

	it('allows inspection of complex queries before execution', async () => {
		const nameSubstring = '%Doe%';

		const selectResult = usersTable.selectUsers(['id', 'name', 'email'], {
			where: {'name.like': nameSubstring},
		});

		expect(selectResult.query.sqlText).toContain('SELECT');
		expect(selectResult.query.sqlText).toContain('FROM users');
		expect(selectResult.query.values).toContain(nameSubstring);

		const expectedResult = [{id: 1, name: 'John Doe', email: 'john.doe@example.com'}];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await selectResult.execute();
		expect(result).toEqual(expectedResult);
	});

	it('handles predefined SQL with new interface', async () => {
		const expectedResult = [
			{
				id: 1,
				name: 'John Doe',
				email: 'john.doe@example.com',
				addresses: [],
			},
		];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable
			.selectUserDetails('*', {
				where: {id: 1},
				whereClause: 'created_at > NOW() - INTERVAL 30 DAY',
			})
			.execute();

		expect(result).toEqual(expectedResult);
	});

	it('gets users whose id is in a specific set', async () => {
		const ids = [1, 3, 5];
		const expectedResult = [
			{id: 1, name: 'John Doe', email: 'john.doe@example.com'},
			{id: 3, name: 'Alice Smith', email: 'alice.smith@example.com'},
			{id: 5, name: 'Bob Johnson', email: 'bob.johnson@example.com'},
		];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const selectResult = usersTable.selectUsers(['id', 'name', 'email'], {
			where: {'id.in': ids},
		});

		// The list is sent as one array parameter.
		expect(selectResult.query.sqlText).toContain('WHERE "id" = ANY($1)');
		expect(selectResult.query.values).toEqual([ids]);

		const result = await selectResult.execute();
		expect(result).toEqual(expectedResult);
	});

	it('demonstrates the new selectWithCustomSchema functionality for joined data', async () => {
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

		// This demonstrates filtering by joined data columns that don't exist in the original table
		const result = await usersTable
			.selectUserDetails('*', {
				where: {
					'posts.not': null, // Filter for users who have posts (posts column from join)
					'addresses.not': null, // Filter for users who have addresses (addresses column from join)
				},
			})
			.execute();

		expect(result).toEqual(expectedResult);

		// The key point: we can filter by 'posts' and 'addresses' which don't exist in the users table schema
		// but are available in the joined result from the predefined SQL query
	});
	describe('sorting and paging SQL', () => {
		it('writes ORDER BY once for two sort keys, in the order of the object keys', () => {
			const byNameThenId = usersTable.selectUsers(['id', 'name'], {
				where: {'name.orderBy': 'ASC', 'id.orderBy': 'DESC'},
			});
			expect(byNameThenId.query.sqlText).toBe('SELECT "id", "name" FROM users ORDER BY "name" ASC, "id" DESC');

			const byIdThenName = usersTable.selectUsers(['id', 'name'], {
				where: {'id.orderBy': 'DESC', 'name.orderBy': 'ASC'},
			});
			expect(byIdThenName.query.sqlText).toBe('SELECT "id", "name" FROM users ORDER BY "id" DESC, "name" ASC');
		});

		it('pages with LIMIT and OFFSET, in that order', () => {
			const page = usersTable.selectUsers(['id', 'name'], {
				where: {'id.orderBy': 'ASC', offset: 20, limit: 10} as any,
			});

			expect(page.query.sqlText).toBe('SELECT "id", "name" FROM users ORDER BY "id" ASC LIMIT 10 OFFSET 20');
			// offset is a paging key. It is no longer bound as a filter value.
			expect(page.query.values).toEqual([]);
		});

		it('accepts offset alone and as a numeric string', () => {
			const page = usersTable.selectUsers(['id', 'name'], {where: {name: 'John Doe', offset: '5'} as any});

			expect(page.query.sqlText).toBe('SELECT "id", "name" FROM users WHERE "name" = $1 OFFSET 5');
			expect(page.query.values).toEqual(['John Doe']);
		});

		it('rejects an offset that is not a non-negative integer', () => {
			const payloads = ['1; DELETE FROM users', '(SELECT pg_sleep(5))', '-1', '1.5', '', null, true, {}];
			for (const offset of payloads) {
				expect(() => usersTable.selectUsers(['id', 'name'], {where: {offset} as any})).toThrow(
					/Invalid offset value/
				);
			}
		});

		it('keeps limit and offset in selectWithCustomSchema with an explicit column list', () => {
			const page = usersTable.selectUserDetails(['id', 'name'], {
				where: {'name.like': 'J%', 'id.orderBy': 'ASC', limit: 10, offset: 20} as any,
			});

			expect(page.query.sqlText).toMatch(/WHERE "name" LIKE \$1 ORDER BY "id" ASC LIMIT 10 OFFSET 20$/);
			expect(page.query.values).toEqual(['J%']);
		});
	});
});
