import {Pool, PoolClient, PoolConfig, QueryResult} from 'pg';
import {loggerMock} from 'mocklogs';
import {QueryObject} from '../utils/query-utils';

class PostgresConnection {
	private static instance: PostgresConnection | undefined;
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

	/**
	 * Closes the pool and clears the singleton, so `initialize` can be called again.
	 * Tests and scripts call this to let the process exit.
	 */
	public static async end(): Promise<void> {
		const instance = PostgresConnection.instance;
		if (!instance) {
			return;
		}
		PostgresConnection.instance = undefined;
		await instance.pool.end();
	}

	async query(text: any, queryParams?: any[]): Promise<QueryResult<any>> {
		const start = Date.now();
		const client = await this.pool.connect();
		let duration = 0;

		try {
			const result = await client.query(text, queryParams);
			duration = Date.now() - start;
			console.log('Executed Query', {text: result.command, duration, rows: result.rowCount});
			return result;
		} catch (e: unknown) {
			duration = Date.now() - start;
			if (e instanceof Error) {
				loggerMock.log({forceLog: true, message: ['databases.postgres.queries.query', 'Error: %s', e.message]});
				loggerMock.log({forceLog: false, message: ['databases.postgres.queries.query', 'Error: %s', e.stack]});
				throw e;
			} else {
				loggerMock.log({forceLog: true, message: ['databases.postgres.queries.query', 'Error: Unknown error']});
				throw new Error('Unknown error during query execution');
			}
		} finally {
			if (duration >= 2000) {
				console.warn(`[SLOW ${duration}ms] ${text} :: ${JSON.stringify(queryParams)}`);
			}
			client.release();
		}
	}

	/**
	 * Runs BEGIN, the given work and COMMIT on one pool client, and releases it once.
	 * On failure it runs ROLLBACK and rethrows the original error. If ROLLBACK itself
	 * fails, the client is released with that error so the pool destroys it.
	 */
	private async runOnOneClient<R>(work: (client: PoolClient) => Promise<R>): Promise<R> {
		const client = await this.pool.connect();
		let rollbackError: Error | undefined;

		try {
			await client.query('BEGIN');
			const result = await work(client);
			await client.query('COMMIT');
			return result;
		} catch (e) {
			try {
				await client.query('ROLLBACK');
			} catch (rollbackFailure) {
				rollbackError = rollbackFailure instanceof Error ? rollbackFailure : new Error(String(rollbackFailure));
			}
			throw e;
		} finally {
			client.release(rollbackError);
		}
	}

	/**
	 * Runs a list of queries as one transaction on one client.
	 * The second form runs a single statement the same way.
	 */
	async transaction(queries: QueryObject[]): Promise<QueryResult<any>[]>;
	async transaction(text: any, queryParams: any): Promise<QueryResult<any>>;
	async transaction(textOrQueries: any, queryParams?: any): Promise<QueryResult<any> | QueryResult<any>[]> {
		const start = Date.now();
		let duration = 0;

		try {
			if (Array.isArray(textOrQueries)) {
				const queries: QueryObject[] = textOrQueries;
				const results = await this.runOnOneClient(async (client) => {
					const collected: QueryResult<any>[] = [];
					for (const queryObject of queries) {
						collected.push(await client.query(queryObject.sqlText, queryObject.values));
					}
					return collected;
				});
				duration = Date.now() - start;
				console.log('Executed Transaction', {queries: results.length, duration});
				return results;
			}

			const result = await this.runOnOneClient((client) => client.query(textOrQueries, queryParams));
			duration = Date.now() - start;
			console.log('Executed Transaction', {text: result.command, duration, rows: result.rowCount});
			return result;
		} catch (e) {
			duration = Date.now() - start;
			if (e instanceof Error) {
				loggerMock.log({forceLog: true, message: ['databases.postgres.queries.query', 'error: %s', e.message]});
				loggerMock.log({forceLog: false, message: ['databases.postgres.queries.query', 'error: %s', e.stack]});
				console.error('Transaction Error:', e.message);
			} else {
				loggerMock.log({forceLog: true, message: ['databases.postgres.queries.query', 'error: %s', 'Unknown error']});
			}
			// The original error is rethrown, so a pg error keeps its code.
			throw e;
		} finally {
			if (duration >= 2000) {
				if (Array.isArray(textOrQueries)) {
					console.warn(`[SLOW ${duration}ms] transaction of ${textOrQueries.length} queries`);
				} else {
					console.warn(`[SLOW ${duration}ms] ${textOrQueries} :: ${JSON.stringify(queryParams)}`);
				}
			}
		}
	}

	public static async query(text: any, queryParams?: any[]): Promise<QueryResult<any>> {
		return PostgresConnection.getInstance().query(text, queryParams);
	}

	public static async transaction(queries: QueryObject[]): Promise<QueryResult<any>[]>;
	public static async transaction(text: any, queryParams: any): Promise<QueryResult<any>>;
	public static async transaction(
		textOrQueries: any,
		queryParams?: any
	): Promise<QueryResult<any> | QueryResult<any>[]> {
		return PostgresConnection.getInstance().transaction(textOrQueries, queryParams);
	}
}

export default PostgresConnection;
