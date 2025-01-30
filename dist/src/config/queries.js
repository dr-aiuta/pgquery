import { Pool } from 'pg';
import { loggerMock } from 'mocklogs';
class PostgresConnection {
    constructor(config) {
        this.pool = new Pool(config);
    }
    static initialize(config) {
        if (!PostgresConnection.instance) {
            PostgresConnection.instance = new PostgresConnection(config);
        }
        return PostgresConnection.instance;
    }
    static getInstance() {
        if (!PostgresConnection.instance) {
            throw new Error('PostgresConnection must be initialized with configuration before use');
        }
        return PostgresConnection.instance;
    }
    async query(text, queryParams) {
        const client = await this.pool.connect();
        const start = Date.now();
        try {
            const result = await client.query(text, queryParams);
            const duration = Date.now() - start;
            console.log('Executed Query', { text: result.command, duration, rows: result.rowCount });
            return result;
        }
        catch (e) {
            if (e instanceof Error) {
                loggerMock.log({ forceLog: true, message: ['databases.postgres.queries.query', 'Error: %s', e.message] });
                loggerMock.log({ forceLog: false, message: ['databases.postgres.queries.query', 'Error: %s', e.stack] });
                throw e;
            }
            else {
                loggerMock.log({ forceLog: true, message: ['databases.postgres.queries.query', 'Error: Unknown error'] });
                throw new Error('Unknown error during query execution');
            }
        }
        finally {
            client.release();
        }
    }
    async transaction(text, queryParams) {
        const client = await this.pool.connect();
        const start = Date.now();
        try {
            await client.query('BEGIN');
            const result = await client.query(text, queryParams);
            await client.query('COMMIT');
            const duration = Date.now() - start;
            console.log('Executed Transaction', { text: result.command, duration, rows: result.rowCount });
            return result;
        }
        catch (e) {
            await client.query('ROLLBACK');
            if (e instanceof Error) {
                loggerMock.log({ forceLog: true, message: ['databases.postgres.queries.query', 'error: %s', e.message] });
                loggerMock.log({ forceLog: false, message: ['databases.postgres.queries.query', 'error: %s', e.stack] });
                console.error('Transaction Error:', e.message);
                throw new Error(e.message); // or just throw e if you don't want to wrap it
            }
            else {
                loggerMock.log({ forceLog: true, message: ['databases.postgres.queries.query', 'error: %s', 'Unknown error'] });
                throw new Error('Unknown error during transaction');
            }
        }
        finally {
            client.release();
        }
    }
    static async query(text, queryParams) {
        return PostgresConnection.getInstance().query(text, queryParams);
    }
    static async transaction(text, queryParams) {
        return PostgresConnection.getInstance().transaction(text, queryParams);
    }
}
export default PostgresConnection;
