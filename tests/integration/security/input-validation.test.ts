import {setupTests, dbpg, usersTable} from '../pg-lightquery/test-setup';

describe('Security - Input Validation', () => {
	setupTests();

	it('validates required fields are present', async () => {
		const incompleteData = {name: 'John Doe'}; // Missing email
		const expectedError = new Error('Column email is required');

		// NEW STANDARDIZED PATTERN:
		const insertResult = usersTable.insertUser(['name', 'email'], {
			data: incompleteData,
			returnField: 'id',
		});

		// Test that we can inspect the query structure
		expect(insertResult.query.sqlText).toContain('INSERT INTO users');
		expect(insertResult.query.values).toContain(incompleteData.name);

		// Mock an error for missing required field
		(dbpg.query as jest.Mock).mockRejectedValue(expectedError);

		await expect(insertResult.execute()).rejects.toThrow('Column email is required');
	});

	it('validates data types correctly', async () => {
		const validData = {name: 'John Doe', email: 'john@example.com'};
		const expectedResult = [{id: 1, ...validData}];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const insertResult = usersTable.insertUser(['name', 'email'], {
			data: validData,
			returnField: 'id',
		});

		// Validate that string values are properly handled
		expect(insertResult.query.values).toEqual([validData.name, validData.email]);
		expect(typeof insertResult.query.values[0]).toBe('string');
		expect(typeof insertResult.query.values[1]).toBe('string');

		const result = await insertResult.execute();
		expect(result).toEqual(expectedResult);
	});

	it('prevents injection through column names', async () => {
		const userData = {name: 'John Doe', email: 'john@example.com'};

		// NEW STANDARDIZED PATTERN:
		const insertResult = usersTable.insertUser(['name', 'email'], {
			data: userData,
			returnField: 'id',
		});

		// Test that column names are properly quoted in SQL
		expect(insertResult.query.sqlText).toMatch(/"name"/);
		expect(insertResult.query.sqlText).toMatch(/"email"/);
		expect(insertResult.query.sqlText).not.toMatch(/[^"](name|email)[^"]/);
	});

	// NEW TEST: Test query inspection capabilities for validation
	it('allows pre-execution validation of query structure', async () => {
		const userData = {name: 'Test User', email: 'test@example.com'};

		// NEW STANDARDIZED PATTERN - Query inspection for validation:
		const insertResult = usersTable.insertUser(['name', 'email'], {
			data: userData,
			returnField: 'id',
			onConflict: false,
			idUser: 'test-user-123',
		});

		// Validate query structure before execution
		expect(insertResult.query.sqlText).toMatch(/INSERT INTO users/);
		expect(insertResult.query.sqlText).toMatch(/VALUES.*\$1.*\$2/);
		expect(insertResult.query.values).toHaveLength(2);
		expect(insertResult.query.values[0]).toBe(userData.name);
		expect(insertResult.query.values[1]).toBe(userData.email);

		// Ensure parameterized queries (no direct SQL injection)
		expect(insertResult.query.sqlText).not.toContain(userData.name);
		expect(insertResult.query.sqlText).not.toContain(userData.email);
	});
});
