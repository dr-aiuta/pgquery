import {setupTests, dbpg, usersTable} from './test-setup';

describe('Table Operations - Basic CRUD Operations', () => {
	setupTests();

	// Test case: create a user
	it('creates a user', async () => {
		// Define the test input data and expected result
		const userData = {name: 'John Doe', email: 'john.doe@example.com'};
		const expectedResult = [{id: 1, ...userData}];

		// Mock the query method using the PostgresConnection mock
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const insertResult = usersTable.insertUser(['name', 'email'], {
			data: userData,
			returnField: 'id',
			onConflict: false,
			idUser: 'SERVER',
		});

		// Test query inspection capability
		expect(insertResult.query.sqlText).toContain('INSERT INTO users');
		expect(insertResult.query.values).toContain(userData.name);
		expect(insertResult.query.values).toContain(userData.email);

		// Execute and test result
		const result = await insertResult.execute();
		expect(result).toEqual(expectedResult);
	});

	// Test case: get a user by id
	it('gets a user by id', async () => {
		const userId = 1;
		const expectedResult = [{id: userId, name: 'John Doe', email: 'john.doe@example.com'}];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const result = await usersTable
			.selectUsers(['id', 'name', 'email'], {
				where: {id: userId},
			})
			.execute();

		expect(result).toEqual(expectedResult);
	});

	// Test case: get a user by id with null email
	it('gets a user by id with null email', async () => {
		const userId = 1;
		const expectedResult = [{id: userId, name: 'John Doe', email: null}];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const result = await usersTable
			.selectUsers(['id', 'name', 'email'], {
				where: {id: userId, email: null},
			})
			.execute();

		expect(result).toEqual(expectedResult);
	});

	// Test case: Test query object access (new capability)
	it('allows query inspection before execution', async () => {
		const userData = {name: 'Test User', email: 'test@example.com'};

		// NEW STANDARDIZED PATTERN - Query inspection:
		const insertResult = usersTable.insertUser(['name', 'email'], {
			data: userData,
			returnField: 'id',
		});

		// Test that we can inspect the query without executing
		expect(insertResult.query.sqlText).toMatch(/INSERT INTO users/);
		expect(insertResult.query.sqlText).toMatch(/VALUES.*\$1.*\$2/);
		expect(insertResult.query.values).toEqual([userData.name, userData.email]);

		// Test that execute function exists
		expect(typeof insertResult.execute).toBe('function');
	});
});
