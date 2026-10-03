import {Pool, PoolClient, PoolConfig, QueryResult} from 'pg';
import {QueryObject} from './types';

/** What the logger is told about one statement. It never holds bound values. */
export interface QueryLogEntry {
	/** The SQL text of the statement */
	sqlText: string;
	/** How long the statement took, in milliseconds */
	durationMs: number;
	/** The row count PostgreSQL reported. null when the statement failed or reports none. */
	rowCount: number | null;
	/** true when durationMs reached slowQueryMs */
	slow: boolean;
	/** true when the statement failed. The error itself goes to the caller, not to the logger. */
	failed: boolean;
}

export type QueryLogger = (entry: QueryLogEntry) => void;

export interface ConnectionOptions {
	/** Called once for every statement the library sends. Without it the library prints nothing. */
	logger?: QueryLogger;
	/** A statement that takes this long, in milliseconds, is reported with slow: true. Defaults to 2000. */
	slowQueryMs?: number;
}

const DEFAULT_SLOW_QUERY_MS = 2000;

class PostgresConnection {
	private static instance: PostgresConnection | undefined;
	private pool: Pool;
	private logger?: QueryLogger;
	private slowQueryMs: number;

	private constructor(config: PoolConfig, options: ConnectionOptions = {}) {
		this.pool = new Pool(config);
		this.logger = options.logger;
		this.slowQueryMs = options.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS;
	}

	public static initialize(config: PoolConfig, options?: ConnectionOptions): PostgresConnection {
		if (!PostgresConnection.instance) {
			PostgresConnection.instance = new PostgresConnection(config, options);
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

	/**
	 * Sends one statement and reports it to the logger.
	 * The logger gets the SQL text, the duration and the row count. Bound values never reach it.
	 */
	private async run(text: any, send: () => Promise<QueryResult<any>>): Promise<QueryResult<any>> {
		const start = Date.now();
		let rowCount: number | null = null;
		let failed = true;
		try {
			const result = await send();
			rowCount = result.rowCount ?? null;
			failed = false;
			return result;
		} finally {
			this.report(text, Date.now() - start, rowCount, failed);
		}
	}

	private report(text: any, durationMs: number, rowCount: number | null, failed: boolean): void {
		if (!this.logger) {
			return;
		}
		const sqlText = typeof text === 'string' ? text : String(text?.text ?? '');
		try {
			this.logger({sqlText, durationMs, rowCount, slow: durationMs >= this.slowQueryMs, failed});
		} catch (loggerError) {
			// A failing logger must not fail the query.
		}
	}

	async query(text: any, queryParams?: any[]): Promise<QueryResult<any>> {
		const client = await this.pool.connect();
		try {
			return await this.run(text, () => client.query(text, queryParams));
		} finally {
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
			await this.run('BEGIN', () => client.query('BEGIN'));
			const result = await work(client);
			await this.run('COMMIT', () => client.query('COMMIT'));
			return result;
		} catch (e) {
			try {
				await this.run('ROLLBACK', () => client.query('ROLLBACK'));
			} catch (rollbackFailure) {
				rollbackError = rollbackFailure instanceof Error ? rollbackFailure : new Error(String(rollbackFailure));
			}
			// The original error is rethrown, so a pg error keeps its code.
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
		if (Array.isArray(textOrQueries)) {
			const queries: QueryObject[] = textOrQueries;
			return this.runOnOneClient(async (client) => {
				const collected: QueryResult<any>[] = [];
				for (const queryObject of queries) {
					collected.push(
						await this.run(queryObject.sqlText, () => client.query(queryObject.sqlText, queryObject.values))
					);
				}
				return collected;
			});
		}

		return this.runOnOneClient((client) => this.run(textOrQueries, () => client.query(textOrQueries, queryParams)));
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
