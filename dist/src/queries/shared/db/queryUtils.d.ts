import { SchemaToData } from '@/types/column';
import { ColumnDefinition } from '@/types/column';
import { UniqueArray } from '@/types/types';
/**
 * Extracts column names and values for insert operations and prepares update assignments for conflict handling.
 *
 * @param dataToBeInserted - An object containing key-value pairs where keys are column names and values are the values to insert.
 * @param allowedColumns - An array of allowed column names (quoted) to include in the insert operation.
 * @param tableColumns - An object representing the table's columns and their definitions.
 * @param primaryKeyColumn - An array of primary key column names to exclude from update assignments.
 *
 * @returns An object containing:
 *   - columnsNamesForInsert: Column names to be included in the insert operation.
 *   - columnValuesForInsert: Values to be inserted corresponding to the column names.
 *   - assignmentsForConflictUpdate: Update assignments to handle conflicts for non-primary key columns.
 */
export declare function extractInsertAndUpdateAssignmentParts<T extends Record<string, ColumnDefinition>>(dataToBeInserted: Partial<SchemaToData<T>>, allowedColumns: UniqueArray<(keyof T)[]>, tableColumns: {
    [K in keyof T]: ColumnDefinition;
}, primaryKeyColumns: UniqueArray<(keyof T)[]>, idUser: string): {
    columnsNamesForInsert: string[];
    columnValuesForInsert: any[];
    assignmentsForConflictUpdate: string[];
};
export type QueryObject = {
    sqlText: string;
    valuesToBeInserted: any[];
};
export declare function adjustPlaceholders(sql: string, offset: number): string;
export declare function findMaxPlaceholder(sqlText: string): number;
declare const _default: {
    extractInsertAndUpdateAssignmentParts: typeof extractInsertAndUpdateAssignmentParts;
    adjustPlaceholders: typeof adjustPlaceholders;
};
export default _default;
//# sourceMappingURL=queryUtils.d.ts.map