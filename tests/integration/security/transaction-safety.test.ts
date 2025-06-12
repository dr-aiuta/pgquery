import {setupTests, dbpg, usersTable} from '../pg-lightquery/test-setup';

describe('Security - Query Safety', () => {
	setupTests();

	it('safely handles concurrent operations', async () => {
		const expectedResult: any[] = [];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Test that multiple operations can be performed safely
		const userData1 = {name: 'User 1', email: 'user1@example.com'};
		const userData2 = {name: 'User 2', email: 'user2@example.com'};

		const {execute: insert1} = usersTable.insertUser(userData1, ['name', 'email'], 'id', false);
		const {execute: insert2} = usersTable.insertUser(userData2, ['name', 'email'], 'id', false);

		// Execute operations concurrently
		await Promise.all([insert1(), insert2()]);

		// Verify operations were executed with proper parameters
		expect(dbpg.query).toHaveBeenCalledTimes(2);
		expect(dbpg.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO users/), expect.any(Array));
	});

	it('properly escapes values in batch operations', async () => {
		const expectedResult: any[] = [];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const maliciousData = {
			name: "'; DROP TABLE users; --",
			email: 'test@example.com',
		};

		const {execute} = usersTable.insertUser(maliciousData, ['name', 'email'], 'id', false);
		await execute();

		// Verify that the query was parameterized properly (matches multiline format)
		expect(dbpg.query).toHaveBeenCalledWith(
			expect.stringMatching(/INSERT INTO users[\s\S]*VALUES[\s\S]*\$1,[\s\S]*\$2/),
			expect.arrayContaining([maliciousData.name, maliciousData.email])
		);
	});

	it('validates column access permissions', async () => {
		const expectedResult: any[] = [];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Test that only allowed columns are used in queries
		await usersTable.selectUsers({id: 1}, ['id', 'name']);

		// Verify that query only includes allowed columns
		expect(dbpg.query).toHaveBeenCalledWith(expect.stringMatching(/SELECT "id", "name"/), expect.any(Array));
	});
});
