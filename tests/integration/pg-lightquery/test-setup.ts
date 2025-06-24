import {QueryResultRow, QueryResult} from 'pg';
import PostsTable from '../../tables/entities/PostsTable';
import UsersTable from '../../tables/entities/UsersTable';
import AddressesTable from '../../tables/entities/AddressesTable';
import PostgresConnection from '../../../src/connection/postgres-connection';

// Mock PostgresConnection
jest.mock('../../../src/connection/postgres-connection', () => {
	const mPool = {
		connect: jest.fn(),
		query: jest.fn(),
		end: jest.fn(),
		transaction: jest.fn(),
	};

	return {
		__esModule: true,
		default: {
			initialize: jest.fn().mockReturnThis(),
			getInstance: jest.fn().mockReturnThis(),
			query: mPool.query,
			transaction: mPool.transaction,
		},
	};
});

// Import the mocked PostgresConnection
import dbpg from '../../../src/connection/postgres-connection';

// Helper function to create a query result object
export const createQueryResult = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
	command: '',
	rowCount: rows.length,
	oid: 0,
	rows,
	fields: [],
});

// Instantiate our table classes
export const usersTable = new UsersTable();
export const postsTable = new PostsTable();
export const addressesTable = new AddressesTable();

export const setupTests = () => {
	beforeAll(() => {
		const testDbConfig = {
			host: 'localhost',
			port: 5432,
			user: 'test_user',
			password: 'test_password',
			database: 'test_database',
		};
		// Initialize PostgresConnection before tests
		PostgresConnection.initialize(testDbConfig);
		// Clear any existing mocks
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});
};

// Helper functions for the new standardized interface testing
export const createMockQueryResult = <T>(data: T[]): {rows: T[]} => ({
	rows: data,
});

export const expectQueryToContain = (mockQuery: jest.Mock, sqlPattern: string | RegExp) => {
	expect(mockQuery).toHaveBeenCalledWith(expect.stringMatching(sqlPattern), expect.any(Array));
};

export const expectQueryValues = (mockQuery: jest.Mock, expectedValues: any[]) => {
	expect(mockQuery).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(expectedValues));
};

export {dbpg};
