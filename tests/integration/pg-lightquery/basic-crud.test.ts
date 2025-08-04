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
		expect(insertResult.query.sqlText).toMatch(/VALUES.*\$1.*\$2.*\$3/);
		expect(insertResult.query.values).toEqual([userData.name, userData.email, 'SERVER']);

		// Test that execute function exists
		expect(typeof insertResult.execute).toBe('function');
	});

	// Test case: update a user
	it('updates a user with WHERE clause', async () => {
		const updateData = {name: 'John Updated', email: 'john.updated@example.com'};
		const expectedResult = [{id: 1, ...updateData}];

		// Mock the query method
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const updateResult = usersTable.updateUser(['name', 'email'], {
			data: updateData,
			where: {id: 1},
			returnField: 'id',
			idUser: 'TEST_USER',
		});

		// Test query inspection capability
		expect(updateResult.query.sqlText).toContain('UPDATE users');
		expect(updateResult.query.sqlText).toContain('SET');
		expect(updateResult.query.sqlText).toContain('WHERE');
		expect(updateResult.query.values).toContain(updateData.name);
		expect(updateResult.query.values).toContain(updateData.email);
		expect(updateResult.query.values).toContain(1); // WHERE id parameter

		// Execute and test result
		const result = await updateResult.execute();
		expect(result).toEqual(expectedResult);
	});

	// Test case: update with RETURNING clause
	it('updates a user and returns specified field', async () => {
		const updateData = {name: 'Jane Updated'};
		const expectedResult = [{id: 2}];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const updateResult = usersTable.updateUser('*', {
			data: updateData,
			where: {email: 'jane@example.com'},
			returnField: 'id',
		});

		// Test RETURNING clause in SQL
		expect(updateResult.query.sqlText).toContain('RETURNING "id"');

		const result = await updateResult.execute();
		expect(result).toEqual(expectedResult);
	});

	// Test case: update safety - missing WHERE clause should throw error
	it('throws error when updating without WHERE clause', async () => {
		const updateData = {name: 'New Name'};

		expect(() => {
			usersTable.updateUser(['name'], {
				data: updateData,
				where: {}, // Empty WHERE clause
			});
		}).toThrow('WHERE clause is required for UPDATE operations');
	});

	// Test case: update with allowUpdateAll flag
	it('allows mass update when allowUpdateAll is true', async () => {
		const updateData = {name: 'Mass Update Name'};
		const expectedResult = [{id: 1}, {id: 2}];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const updateResult = usersTable.updateUser(['name'], {
			data: updateData,
			where: {}, // Empty WHERE clause
			allowUpdateAll: true, // Explicitly allow mass update
		});

		// Should not contain WHERE clause for mass update
		expect(updateResult.query.sqlText).toContain('UPDATE users');
		expect(updateResult.query.sqlText).toContain('SET');
		expect(updateResult.query.sqlText).not.toContain('WHERE');

		const result = await updateResult.execute();
		expect(result).toEqual(expectedResult);
	});

	// Test case: update query inspection
	it('allows update query inspection before execution', async () => {
		const updateData = {name: 'Test Update', email: 'test.update@example.com'};

		const updateResult = usersTable.updateUser(['name', 'email'], {
			data: updateData,
			where: {id: 1},
		});

		// Test that we can inspect the query without executing
		expect(updateResult.query.sqlText).toMatch(/UPDATE users/);
		expect(updateResult.query.sqlText).toMatch(/SET.*=.*\$1.*=.*\$2/);
		expect(updateResult.query.sqlText).toMatch(/WHERE.*"id".*=.*\$4/);
		expect(updateResult.query.values).toEqual([
			updateData.name,
			updateData.email,
			'SERVER', // lastChangedBy value (default)
			1, // WHERE id value
		]);

		// Test that execute function exists
		expect(typeof updateResult.execute).toBe('function');
	});
});
