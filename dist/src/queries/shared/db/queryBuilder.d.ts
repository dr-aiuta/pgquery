import { ColumnDefinition } from '@/types/column';
import { UniqueArray } from '@/types/types';
/**
 * Constructs an SQL INSERT query with optional conflict resolution and returning clause.
 *
 * @param tableName - The name of the table into which the data will be inserted.
 * @param columnsForInsert - Array of column names to be inserted.
 * @param valuesForInsert - Array of values corresponding to the columns to be inserted.
 * @param onConflict - A flag indicating whether to include an ON CONFLICT clause.
 * @param primaryKeyColumns - The primary key column(s) used for the ON CONFLICT clause.
 * @param conflictUpdateAssignments - The SQL assignments for updating columns on conflict.
 * @param returnField - The field(s) to be returned after the insert operation.
 *
 * @returns Object The constructed SQL INSERT query string and an array of values.
 */
export declare function buildInsertSqlQuery<T extends Record<string, ColumnDefinition>>(tableName: string, columnsForInsert: UniqueArray<(keyof T)[]>, valuesForInsert: any[], onConflict: boolean, primaryKeyColumns: UniqueArray<(keyof T)[]>, conflictUpdateAssignments: string[], returnField?: keyof T): {
    sqlText: string;
    valuesToBeInserted: any[];
};
declare const _default: {
    buildInsertSqlQuery: typeof buildInsertSqlQuery;
};
export default _default;
//# sourceMappingURL=queryBuilder.d.ts.map