import {SchemaToData} from '../types/core-types';
import {ColumnDefinition} from '../types/core-types';
import {QueryParams} from '../types/core-types';
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

/**
 * Extracts column names and values for update operations.
 *
 * @param dataToBeUpdated - An object containing key-value pairs where keys are column names and values are the values to update.
 * @param allowedColumns - An array of allowed column names to include in the update operation.
 * @param tableColumns - An object representing the table's columns and their definitions.
 * @param idUser - User ID for tracking changes.
 *
 * @returns An object containing:
 *   - columnsNamesForUpdate: Column names to be included in the update operation.
 *   - columnValuesForUpdate: Values to be updated corresponding to the column names.
 */
export function extractUpdateParts<T extends Record<string, ColumnDefinition>>(
	dataToBeUpdated: Partial<SchemaToData<T>>,
	allowedColumns: UniqueArray<(keyof T)[]>,
	tableColumns: {[K in keyof T]: ColumnDefinition},
	idUser: string
): {
	columnsNamesForUpdate: string[];
	columnValuesForUpdate: any[];
} {
	const columnsNamesForUpdate: string[] = [];
	const columnValuesForUpdate: any[] = [];

	Object.entries(dataToBeUpdated).forEach(([column, value]) => {
		if (allowedColumns.includes(column as keyof T) && value !== undefined && value !== null) {
			columnsNamesForUpdate.push(column);
			columnValuesForUpdate.push(value);
		}
	});

	// Add lastChangedBy if it exists in the table schema
	if ('lastChangedBy' in tableColumns) {
		columnsNamesForUpdate.push('lastChangedBy');
		columnValuesForUpdate.push(idUser);
	}

	return {columnsNamesForUpdate, columnValuesForUpdate};
}

export type QueryObject = {
	sqlText: string;
	values: any[];
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

// New standardized interfaces
interface QueryResult<T> {
	query: QueryObject;
	execute(): Promise<T>;
}

interface TransactionResult<T> {
	queries: QueryObject[];
	execute(): Promise<T>;
	add(query: QueryObject): TransactionResult<T>;
}

interface BaseOptions<T extends Record<string, ColumnDefinition>> {
	allowedColumns?: (keyof T)[] | '*';
	predefinedSQL?: {
		sqlText: string;
		values?: any[];
	};
}

interface InsertOptions<T extends Record<string, ColumnDefinition>> {
	data: Partial<SchemaToData<T>>;
	returnField?: keyof T | (keyof T)[] | '*';
	onConflict?: boolean;
	idUser?: string;
}

interface SelectOptions<T extends Record<string, ColumnDefinition>> {
	where?: QueryParams<T>;
	alias?: string;
	includeMetadata?: boolean;
	schemaColumns?: any;
	columnsToReturn?: (keyof T)[] | '*';
}

interface UpdateOptions<T extends Record<string, ColumnDefinition>> {
	data: Partial<SchemaToData<T>>;
	where: QueryParams<T>; // Required for safety unless allowUpdateAll is true
	returnField?: keyof T | (keyof T)[] | '*';
	idUser?: string;
	allowUpdateAll?: boolean; // Allows updates without WHERE clause (dangerous - use with caution)
}

// Custom interfaces for predefined SQL with custom schema types
interface CustomBaseOptions<T extends Record<string, any>> {
	allowedColumns?: (keyof T)[] | '*';
	predefinedSQL: {
		sqlText: string;
		values?: any[];
	};
}

interface CustomSelectOptions<T extends Record<string, any>> {
	where?: QueryParams<T>;
	alias?: string;
	includeMetadata?: boolean;
	schemaColumns?: any;
}

// Export the new interfaces
export type {
	QueryResult,
	TransactionResult,
	BaseOptions,
	InsertOptions,
	SelectOptions,
	UpdateOptions,
	CustomBaseOptions,
	CustomSelectOptions,
};

export default {
	extractInsertAndUpdateAssignmentParts,
	adjustPlaceholders,
};
