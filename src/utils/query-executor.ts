import dbpg from '../connection/postgres-connection';
import {SchemaToData} from '../types/core-types';
import {QueryObject} from './query-utils';
import {QueryArrayResult, QueryResult} from 'pg';

/**
 * Executes the provided SQL SELECT query.
 *
 * @param sqlText - The SQL SELECT query string to be executed.
 * @param values - An array of values for parameterized queries.
 *
 * @returns An array of result rows.
 *
 * @throws Rethrows the error of a failed query unchanged.
 */
export async function executeSelectQuery<T>(sqlText: string, values: any[]): Promise<T[]> {
	const result = await dbpg.query(sqlText, values);
	return result.rows;
}

/**
 * Executes the provided SQL INSERT query.
 *
 * @param sqlText - The SQL INSERT query string to be executed.
 * @param values - An array of values for parameterized queries.
 *
 * @returns The rows of the RETURNING clause.
 *
 * @throws Rethrows the error of a failed query unchanged, for example a unique violation with its code.
 */
export async function executeInsertQuery<T>(sqlText: string, values: any[]): Promise<T[]> {
	const result = await dbpg.query(sqlText, values);
	return result.rows;
}

/**
 * Executes a series of SQL queries within a transaction.
 *
 * @param queryObjects - An array of query objects containing SQL text and values to be inserted.
 *
 * @returns An array of results for each query executed.
 *
 * @throws Throws an error if any of the queries fail.
 */
export async function executeTransactionQuery(queryObjects: QueryObject[] = []): Promise<QueryArrayResult<any>[]> {
	// One client runs BEGIN, every statement and COMMIT. See PostgresConnection.transaction.
	const results = await dbpg.transaction(queryObjects);
	return results as unknown as QueryArrayResult<any>[];
}

/**
 * Executes the provided SQL UPDATE query.
 *
 * @param sqlText - The SQL UPDATE query string to be executed.
 * @param values - An array of values for parameterized queries.
 *
 * @returns An array of updated rows (if RETURNING clause is used).
 *
 * @throws Rethrows the error of a failed query unchanged.
 */
export async function executeUpdateQuery<T>(sqlText: string, values: any[]): Promise<T[]> {
	const result = await dbpg.query(sqlText, values);
	return result.rows;
}

export default {
	executeInsertQuery,
	executeTransactionQuery,
	executeSelectQuery,
	executeUpdateQuery,
};
