// import {TableDefinition} from '../../types/table';
// import {ColumnDefinition, SchemaToData} from '../../types/column';
// import {
// 	extractInsertAndUpdateAssignmentParts,
// 	buildColumnsAndValuesSqlStringParts,
// 	buildInsertSqlQuery,
// 	executeInsertQuery,
// } from '../shared/pgUtils';

// /**
//  * Inserts data into the specified table with optional conflict resolution and returns the result.
//  *
//  * @param {Partial<SchemaToData<T>>} params - An object containing key-value pairs where keys are column
//  * 														names and values are the values to insert.
//  * @param {(keyof T)[]} allowedColumns - An array of allowed column names (quoted) to include in the insert operation.
//  * @param {string} idUser - The user ID to be included as the default value for the "lastChangedBy" column.
//  * @param {keyof T} returnField - The field(s) to be returned after the insert operation.
//  * @param {boolean} queryTextOnly - A flag indicating whether to return only the query text without executing it.
//  * @param {boolean} onConflict - A flag indicating whether to include an ON CONFLICT clause.
//  * @param {keyof T} primaryKeyColumn - The primary key column(s) used for the ON CONFLICT clause.
//  *
//  * @returns {Object|string} - The first row of the result if the query is successful,
//  *                            the query text if queryTextOnly is true,
//  *                            or undefined if a unique constraint violation occurs.
//  *
//  * @throws {Error} - Throws an error if the query fails for reasons other than unique constraint violations.
//  */
// export async function insert<T extends Record<string, ColumnDefinition>>(
// 	params: Partial<SchemaToData<T>>,
// 	allowedColumns: (keyof T)[],
// 	idUser: string,
// 	returnField: keyof T,
// 	queryTextOnly: boolean,
// 	onConflict: boolean,
// 	primaryKeyColumn: keyof T
// ): Promise<any> {
// 	const {insertColumnNames, insertColumnValues, conflictUpdateAssignments} = extractInsertAndUpdateAssignmentParts(
// 		params,
// 		allowedColumns,
// 		primaryKeyColumn
// 	);

// 	const {columnsSqlStringPart, valuesSqlStringPart} = buildColumnsAndValuesSqlStringParts(
// 		insertColumnNames,
// 		insertColumnValues,
// 		idUser
// 	);

// 	const sqlInsertQuery = buildInsertSqlQuery(
// 		this.tableName,
// 		columnsSqlStringPart,
// 		valuesSqlStringPart,
// 		onConflict,
// 		primaryKeyColumn,
// 		conflictUpdateAssignments,
// 		returnField
// 	);

// 	if (queryTextOnly) return sqlInsertQuery;

// 	return executeInsertQuery(sqlInsertQuery);
// }
