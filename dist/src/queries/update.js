"use strict";
// import {TableDefinition} from '../../types/table';
// import {ColumnDefinition} from '../../types/column';
// import pgConstructors from '../shared/pgConstructors';
// import dbpg from '../../config/queries'; // Adjust the import path if needed
// export async function update<T extends Record<string, ColumnDefinition>>(
// 	tableName: string,
// 	schema: {columns: {[K in keyof T]: ColumnDefinition}},
// 	paramsToUpdate: Record<string, any>,
// 	allowedColumnsToUpdate: string[],
// 	whereParams: Record<string, any>,
// 	allowedWhereColumns: string[],
// 	returnId: boolean,
// 	returnField: string,
// 	idUser: string,
// 	queryTextOnly: boolean
// ): Promise<any> {
// 	const {sqlQuery: sqlQueryUpdateRow, whereValues: whereValues} = pgConstructors.updateTextConstructor(
// 		allowedColumnsToUpdate,
// 		tableName,
// 		paramsToUpdate,
// 		allowedWhereColumns,
// 		whereParams,
// 		returnId,
// 		returnField,
// 		idUser
// 	);
// 	if (queryTextOnly) {
// 		return {sqlQueryUpdateRow};
// 	} else {
// 		const sqlQuery = sqlQueryUpdateRow;
// 		const result = await dbpg.query(sqlQuery);
// 		return result.rows[0];
// 	}
// }
