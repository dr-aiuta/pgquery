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

		const {execute} = usersTable.insertUser(userData, ['name', 'email'], 'id', false, 'SERVER');

		const result = await execute();

		expect(result).toEqual(expectedResult);
	});

	// Test case: get a user by id
	it('gets a user by id', async () => {
		const userId = 1;
		const expectedResult = [{id: userId, name: 'John Doe', email: 'john.doe@example.com'}];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers({id: userId}, ['id', 'name', 'email']);

		expect(result).toEqual(expectedResult);
	});

	// Test case: get a user by id with null email
	it('gets a user by id with null email', async () => {
		const userId = 1;
		const expectedResult = [{id: userId, name: 'John Doe', email: null}];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers({id: userId, email: null}, ['id', 'name', 'email']);

		expect(result).toEqual(expectedResult);
	});
});
