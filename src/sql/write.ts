import {ColumnDefinition, UniqueArray, WriteData} from '../types';
import {QueryInputError} from './identifiers';
import {isSqlExpression} from './expression';
import {renumber} from './placeholders';

/** A column whose value is an SQL expression. It is written into the SQL text and is not bound. */
export interface SqlAssignment {
	column: string;
	sql: string;
}

/**
 * Extracts column names and values for insert operations and prepares update assignments for conflict handling.
 *
 * @param dataToBeInserted - An object containing key-value pairs where keys are column names and values are the values to insert.
 * @param allowedColumns - An array of allowed column names (quoted) to include in the insert operation.
 * @param tableColumns - An object representing the table's columns and their definitions.
 * @param primaryKeyColumn - An array of column names to exclude from update assignments: the primary key
 *   columns, plus the conflict target columns when the upsert names its own target.
 *
 * @returns An object containing:
 *   - columnsNamesForInsert: Column names to be included in the insert operation, for bound values.
 *   - columnValuesForInsert: Values to be inserted corresponding to the column names.
 *   - expressionsForInsert: Columns whose value is an SQL expression. They follow the bound columns.
 *   - assignmentsForConflictUpdate: Update assignments to handle conflicts for non-primary key columns.
 */
export function extractInsertAndUpdateAssignmentParts<T extends Record<string, ColumnDefinition>>(
	dataToBeInserted: WriteData<T>,
	allowedColumns: UniqueArray<(keyof T)[]>,
	tableColumns: {[K in keyof T]: ColumnDefinition},
	primaryKeyColumns: UniqueArray<(keyof T)[]>,
	idUser: string
): {
	columnsNamesForInsert: string[];
	columnValuesForInsert: any[];
	expressionsForInsert: SqlAssignment[];
	assignmentsForConflictUpdate: string[];
} {
	const columnsNamesForInsert: string[] = [];
	const columnValuesForInsert: any[] = [];
	const expressionsForInsert: SqlAssignment[] = [];
	const boundConflictAssignments: string[] = [];
	const expressionConflictAssignments: string[] = [];

	Object.entries(dataToBeInserted).forEach(([column, value]) => {
		// Only undefined is skipped. null is a value: it writes NULL.
		if (allowedColumns.includes(column as keyof T) && value !== undefined) {
			const isKey = primaryKeyColumns.includes(column as keyof T);
			if (isSqlExpression(value)) {
				expressionsForInsert.push({column, sql: value.sql});
				if (!isKey) expressionConflictAssignments.push(`"${column}" = EXCLUDED."${column}"`);
			} else {
				columnsNamesForInsert.push(column);
				columnValuesForInsert.push(value);
				if (!isKey) boundConflictAssignments.push(`"${column}" = EXCLUDED."${column}"`);
			}
		}
	});

	if ('lastChangedBy' in tableColumns) {
		columnsNamesForInsert.push('lastChangedBy');
		columnValuesForInsert.push(idUser);
	}

	return {
		columnsNamesForInsert,
		columnValuesForInsert,
		expressionsForInsert,
		assignmentsForConflictUpdate: [...boundConflictAssignments, ...expressionConflictAssignments],
	};
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
 *   - columnsNamesForUpdate: Column names to be included in the update operation, for bound values.
 *   - columnValuesForUpdate: Values to be updated corresponding to the column names.
 *   - expressionsForUpdate: Columns whose value is an SQL expression. They follow the bound columns.
 */
export function extractUpdateParts<T extends Record<string, ColumnDefinition>>(
	dataToBeUpdated: WriteData<T>,
	allowedColumns: UniqueArray<(keyof T)[]>,
	tableColumns: {[K in keyof T]: ColumnDefinition},
	idUser: string
): {
	columnsNamesForUpdate: string[];
	columnValuesForUpdate: any[];
	expressionsForUpdate: SqlAssignment[];
} {
	const columnsNamesForUpdate: string[] = [];
	const columnValuesForUpdate: any[] = [];
	const expressionsForUpdate: SqlAssignment[] = [];

	Object.entries(dataToBeUpdated).forEach(([column, value]) => {
		// Only undefined is skipped. null is a value: it writes NULL.
		if (allowedColumns.includes(column as keyof T) && value !== undefined) {
			if (isSqlExpression(value)) {
				expressionsForUpdate.push({column, sql: value.sql});
			} else {
				columnsNamesForUpdate.push(column);
				columnValuesForUpdate.push(value);
			}
		}
	});

	// Add lastChangedBy if it exists in the table schema
	if ('lastChangedBy' in tableColumns) {
		columnsNamesForUpdate.push('lastChangedBy');
		columnValuesForUpdate.push(idUser);
	}

	return {columnsNamesForUpdate, columnValuesForUpdate, expressionsForUpdate};
}

/** How a statement is laid out. Both layouts hold the same SQL. */
export interface WriteLayout {
	/** Columns whose value is an SQL expression. They follow the bound columns. */
	expressions?: SqlAssignment[];
	/**
	 * Writes the statement on one line. A chained step that references an earlier step
	 * has always been written this way, and its SQL text is kept as it was.
	 */
	compact?: boolean;
}

/**
 * Builds the RETURNING clause for an insert or an update.
 *
 * @param returnField - `'*'`, one column of the table definition, or an array of such columns.
 * @param columns - The columns of the table definition. Their keys are the accepted names.
 *
 * @returns The clause, or an empty string when nothing is returned.
 *
 * @throws Throws when a name is not a column of the table definition. The name is written
 * into the SQL text inside double quotes, so only known columns are accepted.
 */
export function returningClause(returnField: unknown, columns: Record<string, unknown>): string {
	if (returnField === undefined || returnField === null || returnField === '') {
		return '';
	}
	if (returnField === '*') {
		return 'RETURNING *';
	}

	const fields: unknown[] = Array.isArray(returnField) ? returnField : [returnField];
	if (fields.length === 0) {
		return '';
	}

	fields.forEach((field) => {
		if (typeof field !== 'string' || !Object.prototype.hasOwnProperty.call(columns, field)) {
			throw new QueryInputError(
				`Invalid returnField: ${String(field)}. Expected '*' or a column of the table definition.`
			);
		}
	});

	return `RETURNING ${fields.map((field) => `"${field}"`).join(', ')}`;
}

/**
 * Constructs an SQL INSERT query with optional conflict resolution and returning clause.
 *
 * @param tableName - The name of the table into which the data will be inserted.
 * @param columnsForInsert - Array of column names to be inserted with bound values.
 * @param valuesForInsert - Array of values corresponding to the columns to be inserted.
 * @param onConflict - A flag indicating whether to include an ON CONFLICT clause.
 * @param primaryKeyColumns - The conflict target of the ON CONFLICT clause: the primary key column(s),
 *   or the columns of the unique constraint the caller named.
 * @param conflictUpdateAssignments - The SQL assignments for updating columns on conflict.
 * @param returnField - The field(s) to be returned after the insert operation.
 * @param schemaColumns - The columns of the table definition, used to validate returnField.
 * @param layout - Columns with an SQL expression as value, and the one-line layout.
 *
 * @returns Object The constructed SQL INSERT query string and an array of values.
 */
export function buildInsertSqlQuery<T extends Record<string, ColumnDefinition>>(
	tableName: string,
	columnsForInsert: UniqueArray<(keyof T)[]>,
	valuesForInsert: any[],
	onConflict: boolean,
	primaryKeyColumns: UniqueArray<(keyof T)[]>,
	conflictUpdateAssignments: string[],
	returnField: keyof T | (keyof T)[] | '*' | undefined,
	schemaColumns: Record<string, unknown>,
	layout: WriteLayout = {}
): {sqlText: string; values: any[]} {
	const expressions = layout.expressions ?? [];
	const columns = [...columnsForInsert.map(String), ...expressions.map((expression) => expression.column)];
	// Bound values become $1, $2, $3, etc. An expression is written as it is.
	const valueList = [
		...valuesForInsert.map((_, index) => `$${index + 1}`),
		...expressions.map((expression) => expression.sql),
	].join(', ');

	const returning = returningClause(returnField, schemaColumns);
	const lineBreak = layout.compact ? ' ' : '\n';

	// With no column to insert, Postgres needs DEFAULT VALUES. An empty column list is a syntax error.
	const insertPart =
		columns.length > 0
			? `INSERT INTO ${tableName} ("${columns.join('", "')}")${lineBreak}VALUES (${valueList})`
			: `INSERT INTO ${tableName} DEFAULT VALUES`;

	// Each key column is quoted on its own. With nothing to update, DO UPDATE SET would be empty.
	let conflictPart = '';
	if (onConflict && primaryKeyColumns.length > 0) {
		const conflictTarget = `("${primaryKeyColumns.join('", "')}")`;
		conflictPart =
			conflictUpdateAssignments.length > 0
				? ` ON CONFLICT ${conflictTarget} DO UPDATE SET ${conflictUpdateAssignments.join(', ')}`
				: ` ON CONFLICT ${conflictTarget} DO NOTHING`;
	}

	const sqlText = layout.compact
		? `${insertPart}${conflictPart}${returning ? ` ${returning}` : ''};`
		: `${insertPart}${conflictPart}\n${returning};`;

	return {
		sqlText,
		values: valuesForInsert,
	};
}

/**
 * Constructs an SQL UPDATE query with WHERE clause and optional returning clause.
 *
 * @param tableName - The name of the table to update.
 * @param columnsForUpdate - Array of column names to be updated with bound values.
 * @param valuesForUpdate - Array of values corresponding to the columns to be updated.
 * @param whereClause - The WHERE clause, with its placeholders numbered from $1.
 * @param whereValues - Array of values for the WHERE clause parameters.
 * @param returnField - The field(s) to be returned after the update operation.
 * @param schemaColumns - The columns of the table definition, used to validate returnField.
 * @param layout - Columns with an SQL expression as value, and the one-line layout.
 *
 * @returns Object The constructed SQL UPDATE query string and an array of values.
 */
export function buildUpdateSqlQuery<T extends Record<string, ColumnDefinition>>(
	tableName: string,
	columnsForUpdate: UniqueArray<(keyof T)[]>,
	valuesForUpdate: any[],
	whereClause: string,
	whereValues: any[],
	returnField: keyof T | (keyof T)[] | '*' | undefined,
	schemaColumns: Record<string, unknown>,
	layout: WriteLayout = {}
): {sqlText: string; values: any[]} {
	const expressions = layout.expressions ?? [];
	// Create SET assignments like "column" = $1, "column2" = $2. An expression is written as it is.
	const setAssignments = [
		...columnsForUpdate.map((column, index) => `"${String(column)}" = $${index + 1}`),
		...expressions.map((expression) => `"${expression.column}" = ${expression.sql}`),
	].join(', ');

	// The placeholders of the WHERE clause continue after the SET parameters
	const adjustedWhereClause = renumber(whereClause, valuesForUpdate.length);

	const returning = returningClause(returnField, schemaColumns);
	const returningPart = returning ? `\n${returning}` : '';

	const sqlText = layout.compact
		? `UPDATE ${tableName} SET ${setAssignments}${adjustedWhereClause ? ` ${adjustedWhereClause}` : ''}${returningPart};`
		: `UPDATE ${tableName}\nSET ${setAssignments}\n${adjustedWhereClause}${returningPart};`;

	// Combine values: SET values first, then WHERE values
	const allValues = [...valuesForUpdate, ...whereValues];

	return {
		sqlText,
		values: allValues,
	};
}

export default {
	extractInsertAndUpdateAssignmentParts,
	buildInsertSqlQuery,
	buildUpdateSqlQuery,
	returningClause,
};
