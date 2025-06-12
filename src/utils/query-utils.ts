import {SchemaToData} from '../types/core-types';
import {ColumnDefinition} from '../types/core-types';
import {UniqueArray} from '../types/utility-types';

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
export function extractInsertAndUpdateAssignmentParts<T extends Record<string, ColumnDefinition>>(
	dataToBeInserted: Partial<SchemaToData<T>>,
	allowedColumns: UniqueArray<(keyof T)[]>,
	tableColumns: {[K in keyof T]: ColumnDefinition},
	primaryKeyColumns: UniqueArray<(keyof T)[]>,
	idUser: string
): {
	columnsNamesForInsert: string[];
	columnValuesForInsert: any[];
	assignmentsForConflictUpdate: string[];
} {
	const columnsNamesForInsert: string[] = [];
	const columnValuesForInsert: any[] = [];
	const assignmentsForConflictUpdate: string[] = [];

	Object.entries(dataToBeInserted).forEach(([column, value]) => {
		if (allowedColumns.includes(column as keyof T) && value !== undefined && value !== null) {
			columnsNamesForInsert.push(column);
			columnValuesForInsert.push(value);
			if (!primaryKeyColumns.includes(column as keyof T)) {
				assignmentsForConflictUpdate.push(`"${column}" = EXCLUDED."${column}"`);
			}
		}
	});

	if ('lastChangedBy' in tableColumns) {
		columnsNamesForInsert.push('lastChangedBy');
		columnValuesForInsert.push(idUser);
	}

	return {columnsNamesForInsert, columnValuesForInsert, assignmentsForConflictUpdate};
}

export type QueryObject = {
	sqlText: string;
	valuesToBeInserted: any[];
};

export function adjustPlaceholders(sql: string, offset: number): string {
	return sql.replace(/\$(\d+)/g, (_, num) => {
		const newNum = parseInt(num, 10) + offset;
		return `$${newNum}`;
	});
}

export function findMaxPlaceholder(sqlText: string): number {
	// Find the highest placeholder number in predefinedSQL.sqlText
	const placeholderRegex = /\$(\d+)/g;
	let match;
	let maxPlaceholder = 0;
	while ((match = placeholderRegex.exec(sqlText)) !== null) {
		const placeholderNumber = parseInt(match[1], 10);
		if (placeholderNumber > maxPlaceholder) {
			maxPlaceholder = placeholderNumber;
		}
	}
	return maxPlaceholder;
}

export default {
	extractInsertAndUpdateAssignmentParts,
	adjustPlaceholders,
};
