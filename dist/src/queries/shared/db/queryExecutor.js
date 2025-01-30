import dbpg from '@/config/queries';
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
export async function executeSelectQuery(sqlText, values) {
    try {
        const result = await dbpg.query(sqlText, values);
        return result.rows;
    }
    catch (error) {
        console.error('Error executing select query:', error.message);
        throw error;
    }
}
/**
 * Executes the provided SQL INSERT query and handles unique constraint violations.
 *
 * @param sqlText - The SQL INSERT query string to be executed.
 *
 * @returns The first row of the result if the query is successful, or undefined if a unique constraint violation occurs.
 *
 * @throws Throws an error if the query fails for reasons other than unique constraint violations.
 */
export async function executeInsertQuery(sqlText, valuesToBeInserted) {
    try {
        const result = await dbpg.query(sqlText, valuesToBeInserted);
        return result.rows;
    }
    catch (error) {
        if (error.message.includes('violates unique constraint')) {
            console.log('Duplicate key detected:', error.message);
        }
        throw error;
    }
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
export async function executeTransactionQuery(queryObjects = []) {
    const results = [];
    try {
        await dbpg.query('BEGIN');
        for (const queryObj of queryObjects) {
            // Execute each query with its parameterized values
            results.push(await dbpg.query(queryObj.sqlText, queryObj.valuesToBeInserted));
        }
        await dbpg.query('COMMIT');
    }
    catch (error) {
        try {
            await dbpg.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Rollback failed:', rollbackError);
        }
        throw error; // Re-throw the original error
    }
    return results;
}
export default {
    executeInsertQuery,
    executeTransactionQuery,
    executeSelectQuery,
};
