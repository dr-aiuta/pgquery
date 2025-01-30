import { QueryObject } from './queryUtils';
import { QueryArrayResult } from 'pg';
/**
 * Executes the provided SQL SELECT query.
 *
 * @param sqlText - The SQL SELECT query string to be executed.
 * @param values - An array of values for parameterized queries.
 *
 * @returns An array of result rows.
 *
 * @throws Throws an error if the query fails.
 */
export declare function executeSelectQuery<T>(sqlText: string, values: any[]): Promise<T[]>;
/**
 * Executes the provided SQL INSERT query and handles unique constraint violations.
 *
 * @param sqlText - The SQL INSERT query string to be executed.
 *
 * @returns The first row of the result if the query is successful, or undefined if a unique constraint violation occurs.
 *
 * @throws Throws an error if the query fails for reasons other than unique constraint violations.
 */
export declare function executeInsertQuery<T>(sqlText: string, valuesToBeInserted: any[]): Promise<T[]>;
/**
 * Executes a series of SQL queries within a transaction.
 *
 * @param queryObjects - An array of query objects containing SQL text and values to be inserted.
 *
 * @returns An array of results for each query executed.
 *
 * @throws Throws an error if any of the queries fail.
 */
export declare function executeTransactionQuery(queryObjects?: QueryObject[]): Promise<QueryArrayResult<any>[]>;
declare const _default: {
    executeInsertQuery: typeof executeInsertQuery;
    executeTransactionQuery: typeof executeTransactionQuery;
    executeSelectQuery: typeof executeSelectQuery;
};
export default _default;
//# sourceMappingURL=queryExecutor.d.ts.map