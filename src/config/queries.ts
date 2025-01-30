import {Pool, PoolClient, PoolConfig, QueryConfig, QueryResult} from 'pg';
import {loggerMock} from 'mocklogs';

class PostgresConnection {
	private static instance: PostgresConnection;
	private pool: Pool;

	private constructor(config: PoolConfig) {
		this.pool = new Pool(config);
	}

	public static initialize(config: PoolConfig): PostgresConnection {
		if (!PostgresConnection.instance) {
			PostgresConnection.instance = new PostgresConnection(config);
		}
		return PostgresConnection.instance;
	}

	public static getInstance(): PostgresConnection {
		if (!PostgresConnection.instance) {
			throw new Error('PostgresConnection must be initialized with configuration before use');
		}
		return PostgresConnection.instance;
	}

	async query(text: any, queryParams?: any[]): Promise<QueryResult<any>> {
		const client = await this.pool.connect();
		const start = Date.now();

		try {
			const result = await client.query(text, queryParams);
			const duration = Date.now() - start;
			console.log('Executed Query', {text: result.command, duration, rows: result.rowCount});
			return result;
		} catch (e: unknown) {
			if (e instanceof Error) {
				loggerMock.log({forceLog: true, message: ['databases.postgres.queries.query', 'Error: %s', e.message]});
				loggerMock.log({forceLog: false, message: ['databases.postgres.queries.query', 'Error: %s', e.stack]});
				throw e;
			} else {
				loggerMock.log({forceLog: true, message: ['databases.postgres.queries.query', 'Error: Unknown error']});
				throw new Error('Unknown error during query execution');
			}
		} finally {
			client.release();
		}
	}

	async transaction(text: any, queryParams: any) {
		const client = await this.pool.connect();
		const start = Date.now();

		try {
			await client.query('BEGIN');
			const result = await client.query(text, queryParams);
			await client.query('COMMIT');
			const duration = Date.now() - start;
			console.log('Executed Transaction', {text: result.command, duration, rows: result.rowCount});
			return result;
		} catch (e) {
			await client.query('ROLLBACK');
			if (e instanceof Error) {
				loggerMock.log({forceLog: true, message: ['databases.postgres.queries.query', 'error: %s', e.message]});
				loggerMock.log({forceLog: false, message: ['databases.postgres.queries.query', 'error: %s', e.stack]});
				console.error('Transaction Error:', e.message);
				throw new Error(e.message); // or just throw e if you don't want to wrap it
			} else {
				loggerMock.log({forceLog: true, message: ['databases.postgres.queries.query', 'error: %s', 'Unknown error']});
				throw new Error('Unknown error during transaction');
			}
		} finally {
			client.release();
		}
	}

	public static async query(text: any, queryParams?: any[]): Promise<QueryResult<any>> {
		return PostgresConnection.getInstance().query(text, queryParams);
	}

	public static async transaction(text: any, queryParams: any): Promise<QueryResult<any>> {
		return PostgresConnection.getInstance().transaction(text, queryParams);
	}
}

export default PostgresConnection;
