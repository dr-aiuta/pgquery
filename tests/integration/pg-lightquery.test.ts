import {DatabaseManager} from '../../src/index';
import {Pool, QueryResultRow, QueryResult} from 'pg';
import {PostgresTypes} from '../../src/types';

// Define custom types for user data and user results
interface Address {
	neighborhood: string;
}

interface UserData {
	name?: string;
	email?: string | null;
	address?: Address;
}

interface UserResult extends UserData {
	id?: number;
}

// Mock the database connection using Jest
jest.mock('pg', () => {
	const mPool = {
		connect: jest.fn(),
		query: jest.fn(),
		end: jest.fn(),
	};
	return {
		Pool: jest.fn(() => mPool),
	};
});

const mockDb = new Pool();

// Helper function to create a query result object
const createQueryResult = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
	command: '',
	rowCount: rows.length,
	oid: 0,
	rows,
	fields: [],
});

// Define the models configuration object
const modelsConfig = {
	users: {
		tableName: 'users',
		schema: {
			id: {
				type: PostgresTypes.SERIAL,
				primaryKey: true,
			},
			name: {
				type: PostgresTypes.TEXT,
				notNull: true,
			},
			email: {
				type: PostgresTypes.TEXT,
				unique: true,
			},
			address: {
				type: PostgresTypes.JSONB,
			},
			createdAt: {
				type: PostgresTypes.TIMESTAMP,
				notNull: true,
				default: 'NOW()',
			},
			updatedAt: {
				type: PostgresTypes.TIMESTAMP,
				notNull: true,
				default: 'NOW()',
			},
		},
		queries: {
			createUser: {
				sql: 'INSERT INTO users(name, email, address) VALUES($1, $2, $3) RETURNING *',
				type: 'insert',
				values: ({name, email, address}: UserData) => [name, email, JSON.stringify(address)],
				processResult: (result: QueryResult<UserResult>) => result.rows[0],
			},
			getUserById: {
				sql: 'SELECT * FROM users',
				type: 'select',
				values: (id: number) => [id],
				processResult: (result: QueryResult<UserResult>) => result.rows[0],
			},
			getUserByNeighborhood: {
				sql: 'SELECT * FROM users',
				type: 'select',
				values: (address: {neighborhood: string}) => [address.neighborhood],
				processResult: (result: QueryResult<UserResult>) => result.rows,
			},
			getUserSpecificField: {
				sql: (field: string) => `SELECT ${field} FROM users`,
				type: 'select',
				values: (address: {neighborhood: string}) => [address.neighborhood],
				processResult: (result: QueryResult<UserResult>) => result.rows,
			},
		},
	},
	posts: {
		tableName: 'posts',
		schema: {
			id: {
				type: PostgresTypes.SERIAL,
				primaryKey: true,
			},
			userId: {
				type: PostgresTypes.INTEGER,
				notNull: true,
				references: {
					table: 'users',
					column: 'id',
				},
			},
			title: {
				type: PostgresTypes.TEXT,
				notNull: true,
			},
			content: {
				type: PostgresTypes.TEXT,
				notNull: true,
			},
			createdAt: {
				type: PostgresTypes.TIMESTAMP,
				notNull: true,
				default: 'NOW()',
			},
			updatedAt: {
				type: PostgresTypes.TIMESTAMP,
				notNull: true,
				default: 'NOW()',
			},
		},
		queries: {
			// ...
		},
	},
};

const dbConfig = {
	host: 'localhost',
	port: 5432,
	user: 'your_user',
	password: 'your_password',
	database: 'your_database',
};

// Create the database manager instance
const dbManager = new DatabaseManager(dbConfig, modelsConfig);

// Begin the test suite for the db-module
describe('db-module', () => {
	// Clear all mock data after each test
	afterEach(() => {
		jest.clearAllMocks();
	});

	// Test case: create a user
	it('creates a user', async () => {
		// Define the test input data and expected result
		const userData = {name: 'John Doe', email: 'john.doe@example.com'};
		const expectedResult = [{id: 1, ...userData}];

		(mockDb.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Call the createUser method and store the result
		const result = await dbManager.models.users.queries.createUser([], userData);

		// Check that the correct SQL query and values were passed to the mock database
		expect(mockDb.query).toHaveBeenCalledWith(
			modelsConfig.users.queries.createUser.sql,
			modelsConfig.users.queries.createUser.values(userData)
		);

		// Check that the result matches the expected result
		expect(result).toEqual(modelsConfig.users.queries.createUser.processResult(createQueryResult(expectedResult)));
	});

	// Test case: get a user by id
	it('gets a user by id', async () => {
		// Define the test input data and expected result
		const userId = 1;
		const expectedResult = [{id: userId, name: 'John Doe', email: 'john.doe@example.com'}];

		// Mock the query method of the database connection
		(mockDb.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Call the getUserById method and store the result
		const result = await dbManager.models.users.queries.getUserById([`"id"`], {id: userId});

		// Check that the correct SQL query and values were passed to the mock database
		expect(mockDb.query).toHaveBeenCalledWith(
			`${modelsConfig.users.queries.getUserById.sql} WHERE "id" = $1`,
			modelsConfig.users.queries.getUserById.values(userId)
		);

		// Check that the result matches the expected result
		expect(result).toEqual(modelsConfig.users.queries.getUserById.processResult(createQueryResult(expectedResult)));
	});

	it('gets users ordered by createdAt within a date range', async () => {
		// Define the test input data and expected result
		const startDate = '2023-01-01';
		const endDate = '2023-12-31';
		const expectedResult = [
			{id: 1, name: 'John Doe', email: 'john.doe@example.com', createdAt: new Date('2023-06-15T00:00:00Z')},
			{id: 2, name: 'Jane Doe', email: 'jane.doe@example.com', createdAt: new Date('2023-03-20T00:00:00Z')},
		];

		// Mock the query method of the database connection
		(mockDb.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Construct the query parameters
		const params = {
			'createdAt.startDate': startDate,
			'createdAt.endDate': endDate,
			'createdAt.orderBy': 'DESC',
		};

		// Call the getUserById method and store the result
		const result = await dbManager.models.users.queries.getUserById([`"createdAt"`], params);

		// Prepare the expected SQL query
		const expectedSql = `${modelsConfig.users.queries.getUserById.sql} WHERE "createdAt" >= $1 AND "createdAt" <= $2 ORDER BY "createdAt" DESC`;

		// Check that the correct SQL query and values were passed to the mock database
		expect(mockDb.query).toHaveBeenCalledWith(expectedSql, [new Date(startDate), new Date(endDate)]);

		// Check that the result matches the expected result
		expect(result).toEqual(modelsConfig.users.queries.getUserById.processResult(createQueryResult(expectedResult)));
	});

	// Test case: get a user by id with null email
	it('gets a user by id with null email', async () => {
		// Define the test input data and expected result
		const userId = 1;
		const expectedResult = [{id: userId, name: 'John Doe', email: null}];

		// Mock the query method of the database connection
		(mockDb.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Call the getUserById method and store the result
		const result = await dbManager.models.users.queries.getUserById([`"id"`, `"email"`], {id: userId, email: null});

		// Prepare the expected SQL query
		const expectedSql = `${modelsConfig.users.queries.getUserById.sql} WHERE "id" = $1 AND "email" IS NULL`;

		// Check that the correct SQL query and values were passed to the mock database
		expect(mockDb.query).toHaveBeenCalledWith(expectedSql, [1]);

		// Check that the result matches the expected result
		expect(result).toEqual(modelsConfig.users.queries.getUserById.processResult(createQueryResult(expectedResult)));
	});

	// Test case: 'LIKE' query
	it('gets users whose name contains a specific string', async () => {
		// Define the test input data and expected result
		const nameSubstring = '%Doe%';
		const expectedResult = [
			{id: 1, name: 'John Doe', email: 'john.doe@example.com'},
			{id: 2, name: 'Jane Doe', email: 'jane.doe@example.com'},
		];

		// Mock the query method of the database connection
		(mockDb.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Construct the query parameters
		const params = {
			'name.like': nameSubstring,
		};

		// Call the getUserById method and store the result
		const result = await dbManager.models.users.queries.getUserById([`"name"`], params);

		// Prepare the expected SQL query
		const expectedSql = `${modelsConfig.users.queries.getUserById.sql} WHERE "name" LIKE $1`;

		// Check that the correct SQL query and values were passed to the mock database
		expect(mockDb.query).toHaveBeenCalledWith(expectedSql, [`${nameSubstring}`]);

		// Check that the result matches the expected result
		expect(result).toEqual(modelsConfig.users.queries.getUserById.processResult(createQueryResult(expectedResult)));
	});

	// Test case: 'IN' query
	it('gets users whose id is in a specific set', async () => {
		// Define the test input data and expected result
		const ids = ['1', '3', '5'];
		const expectedResult = [
			{id: 1, name: 'John Doe', email: 'john.doe@example.com'},
			{id: 3, name: 'Alice Smith', email: 'alice.smith@example.com'},
			{id: 5, name: 'Bob Johnson', email: 'bob.johnson@example.com'},
		];

		// Mock the query method of the database connection
		(mockDb.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Construct the query parameters
		const params = {
			'id.in': ids.join(','),
		};

		// Call the getUserById method and store the result
		const result = await dbManager.models.users.queries.getUserById([`"id"`], params);

		// Prepare the placeholders for the IN clause
		const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

		// Prepare the expected SQL query
		const expectedSql = `${modelsConfig.users.queries.getUserById.sql} WHERE "id" IN (${placeholders})`;

		// Check that the correct SQL query and values were passed to the mock database
		expect(mockDb.query).toHaveBeenCalledWith(expectedSql, ids);

		// Check that the result matches the expected result
		expect(result).toEqual(modelsConfig.users.queries.getUserById.processResult(createQueryResult(expectedResult)));
	});

	// Test case: 'object' query with nested properties
	it('handles object params with nested properties correctly', async () => {
		// Define the test input data and expected result
		const objParams = {address: {neighborhood: 'COPACABANA'}};
		const expectedResult = [
			{id: 1, name: 'John Doe', email: 'john.doe@example.com', address: {neighborhood: 'COPACABANA'}},
			{id: 2, name: 'Rita Ora', email: 'rita.ora@example.com', address: {neighborhood: 'COPACABANA'}},
		];

		// Mock the query method of the database connection
		(mockDb.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Construct the query parameters
		const params = {
			...objParams,
		};

		// Call the getUserByNeighborhood method and store the result
		const result = await dbManager.models.users.queries.getUserByNeighborhood([`"address"`], params);

		// Prepare the placeholders for the object clause
		const placeholders = `"address" ->> 'neighborhood' = $1`;

		// Prepare the expected SQL query
		const expectedSql = `${modelsConfig.users.queries.getUserByNeighborhood.sql} WHERE ${placeholders}`;

		// Check that the correct SQL query and values were passed to the mock database
		expect(mockDb.query).toHaveBeenCalledWith(expectedSql, [objParams.address.neighborhood]);

		// Check that the result matches the expected result
		expect(result).toEqual(
			modelsConfig.users.queries.getUserByNeighborhood.processResult(createQueryResult(expectedResult))
		);
	});

	// Test case: function sql queries
	it('gets dynamic field from users', async () => {
		// Define the test input data and expected result
		const objParams = {address: {neighborhood: 'COPACABANA'}};
		const expectedResult = [{name: 'John Doe'}, {name: 'Rita Ora'}];

		// Mock the query method of the database connection
		(mockDb.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// Construct the query parameters
		const params = {
			...objParams,
		};

		// Call the getUserByNeighborhood method and store the result
		const result = await dbManager.models.users.queries.getUserSpecificField([`"address"`], params, '', 'name');

		// Prepare the placeholders for the object clause
		const placeholders = `"address" ->> 'neighborhood' = $1`;

		// Prepare the expected SQL query
		const expectedSql = `SELECT name FROM users WHERE ${placeholders}`;

		// Check that the correct SQL query and values were passed to the mock database
		expect(mockDb.query).toHaveBeenCalledWith(expectedSql, [objParams.address.neighborhood]);

		// Check that the result matches the expected result
		expect(result).toEqual(
			modelsConfig.users.queries.getUserByNeighborhood.processResult(createQueryResult(expectedResult))
		);
	});
});
