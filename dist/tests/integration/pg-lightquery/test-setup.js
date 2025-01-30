import PostsTable from '@tests/tables/entities/PostsTable';
import UsersTable from '@tests/tables/entities/UsersTable';
import AddressesTable from '@tests/tables/entities/AddressesTable';
import PostgresConnection from '@/config/queries';
// Mock PostgresConnection
jest.mock('@/config/queries', () => {
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
import dbpg from '@/config/queries';
// Helper function to create a query result object
export const createQueryResult = (rows) => ({
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
export { dbpg };
