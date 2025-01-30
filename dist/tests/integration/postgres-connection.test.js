import { Pool } from 'pg';
import PostgresConnection from '@/config/queries';
jest.mock('pg', () => {
    const mClient = {
        query: jest.fn(),
        release: jest.fn(),
    };
    const mPool = {
        connect: jest.fn().mockResolvedValue(mClient),
        query: jest.fn(),
        end: jest.fn(),
    };
    const Pool = jest.fn(() => mPool);
    return { Pool };
});
describe('PostgresConnection', () => {
    const testConfig = {
        host: 'localhost',
        port: 5432,
        user: 'test_user',
        password: 'test_password',
        database: 'test_database',
    };
    afterEach(() => {
        jest.clearAllMocks();
        // Also reset the singleton instance
        PostgresConnection.instance = undefined;
    });
    it('should initialize singleton instance with config', () => {
        const instance = PostgresConnection.initialize(testConfig);
        expect(instance).toBeDefined();
        expect(Pool).toHaveBeenCalledWith(testConfig);
    });
    it('should return existing instance when already initialized', () => {
        const instance1 = PostgresConnection.initialize(testConfig);
        const instance2 = PostgresConnection.initialize(testConfig);
        expect(instance1).toBe(instance2);
        expect(Pool).toHaveBeenCalledTimes(1);
    });
    it('should throw error when getting instance before initialization', () => {
        expect(() => {
            PostgresConnection.getInstance();
        }).toThrow('PostgresConnection must be initialized with configuration before use');
    });
    it('should execute query successfully', async () => {
        const instance = PostgresConnection.initialize(testConfig);
        const mockResult = {
            command: 'SELECT',
            rowCount: 1,
            rows: [{ id: 1 }],
        };
        const mockPool = Pool.mock.results[0].value;
        const mockClient = await mockPool.connect();
        mockClient.query.mockResolvedValueOnce(mockResult);
        const result = await instance.query('SELECT * FROM users');
        expect(result).toEqual(mockResult);
        expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
    });
});
