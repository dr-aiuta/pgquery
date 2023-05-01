import {DatabaseManager} from '../../src/index';
import { Pool, QueryResultRow, QueryResult } from 'pg';
import { PostgresTypes } from '../../src/types';

// Define custom types for user data and user results
interface UserData {
  name: string;
  email: string;
}

interface UserResult extends UserData {
  id: number;
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
        notNull: true,
        unique: true,
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
        sql: 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
        values: ({ name, email }: UserData) => [name, email],
        processResult: (result: QueryResult<UserResult>) => result.rows[0],
      },
      getUserById: {
        sql: 'SELECT * FROM users WHERE id = $1',
        values: (id: number) => [id],
        processResult: (result: QueryResult<UserResult>) => result.rows[0],
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
    const userData = { name: 'John Doe', email: 'john.doe@example.com' };
    const expectedResult = [{ id: 1, ...userData }];
  
    (mockDb.query as jest.Mock).mockResolvedValue({ rows: expectedResult });
    
     // Call the createUser method and store the result
    const result = await dbManager.models.users.queries.createUser(userData);
  
    // Check that the correct SQL query and values were passed to the mock database
    expect(mockDb.query).toHaveBeenCalledWith(
      modelsConfig.users.queries.createUser.sql,
      modelsConfig.users.queries.createUser.values(userData)
    );

    // Check that the result matches the expected result
    expect(result).toEqual(
      modelsConfig.users.queries.createUser.processResult(
        createQueryResult(expectedResult)
      )
    );
  });
  
  // Test case: get a user by id
  it('gets a user by id', async () => {
    // Define the test input data and expected result
    const userId = 1;
    const expectedResult = [{ id: userId, name: 'John Doe', email: 'john.doe@example.com' }];
  
    // Mock the query method of the database connection
    (mockDb.query as jest.Mock).mockResolvedValue({ rows: expectedResult });
  
    // Call the getUserById method and store the result
    const result = await dbManager.models.users.queries.getUserById(userId);
  
    // Check that the correct SQL query and values were passed to the mock database
    expect(mockDb.query).toHaveBeenCalledWith(
      modelsConfig.users.queries.getUserById.sql,
      modelsConfig.users.queries.getUserById.values(userId)
    );

    // Check that the result matches the expected result
    expect(result).toEqual(
      modelsConfig.users.queries.getUserById.processResult(
        createQueryResult(expectedResult)
      )
    );
  });
  
});