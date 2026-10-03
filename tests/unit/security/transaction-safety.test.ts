import {setupTests, dbpg, usersTable} from '../pg-lightquery/test-setup';

describe('Security - Query Safety', () => {
	setupTests();

	it('safely handles concurrent operations', async () => {
		const expectedResult: any[] = [];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Test that multiple operations can be performed safely
		const userData1 = {name: 'User 1', email: 'user1@example.com'};
		const userData2 = {name: 'User 2', email: 'user2@example.com'};

		// NEW STANDARDIZED PATTERN:
		const insert1 = usersTable.insertUser(['name', 'email'], {
			data: userData1,
			returnField: 'id',
			onConflict: false,
		});
		const insert2 = usersTable.insertUser(['name', 'email'], {
			data: userData2,
			returnField: 'id',
			onConflict: false,
		});

		// Execute operations concurrently
		await Promise.all([insert1.execute(), insert2.execute()]);

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

		// NEW STANDARDIZED PATTERN:
		const insertResult = usersTable.insertUser(['name', 'email'], {
			data: maliciousData,
			returnField: 'id',
			onConflict: false,
		});

		await insertResult.execute();

		// Verify that the query was parameterized properly (matches multiline format)
		expect(dbpg.query).toHaveBeenCalledWith(
			expect.stringMatching(/INSERT INTO users[\s\S]*VALUES[\s\S]*\$1,[\s\S]*\$2/),
			expect.arrayContaining([maliciousData.name, maliciousData.email])
		);
	});

	it('validates column access permissions', async () => {
		const expectedResult: any[] = [];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		await usersTable
			.selectUsers(['id', 'name'], {
				where: {id: 1},
			})
			.execute();

		// Verify that query only includes allowed columns
		expect(dbpg.query).toHaveBeenCalledWith(expect.stringMatching(/SELECT "id", "name"/), expect.any(Array));
	});

	// NEW TEST: Transaction Builder Pattern
	it('safely handles transaction operations with builder pattern', async () => {
		const expectedResult: any[] = [];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED TRANSACTION PATTERN:
		const insertQuery1 = usersTable.insertUser(['name', 'email'], {
			data: {name: 'User 1', email: 'user1@example.com'},
			returnField: 'id',
		});

		const insertQuery2 = usersTable.insertUser(['name', 'email'], {
			data: {name: 'User 2', email: 'user2@example.com'},
			returnField: 'id',
		});

		// Build transaction using new builder pattern
		const transaction = usersTable.transaction().add(insertQuery1.query).add(insertQuery2.query);

		// Test transaction structure
		expect(transaction.queries).toHaveLength(2);
		expect(transaction.queries[0].sqlText).toContain('INSERT INTO users');
		expect(transaction.queries[1].sqlText).toContain('INSERT INTO users');

		// Execute transaction
		await transaction.execute();

		// Verify transaction execution
		expect(dbpg.query).toHaveBeenCalled();
	});
});
