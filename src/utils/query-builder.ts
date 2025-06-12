import {ColumnDefinition} from '../types/core-types';
import {UniqueArray} from '../types/utility-types';

// Function to construct a SQL condition based on key, index, alias, and rangeField
const constructCondition = (key: string, idx: number, alias: string, rangeField?: string): string => {
	const and = idx === 0 ? '' : 'AND';
	const field = key.split('.')[0];
	const operator = key.split('.')[1] === 'not' ? '<>' : '=';
	const queryValue = `$${idx + 1}`;

	if (field === 'startDate' && rangeField) {
		return ` ${and} ${rangeField} >= ${queryValue}`;
	} else if (field === 'endDate' && rangeField) {
		return ` ${and} ${rangeField} <= ${queryValue}`;
	} else {
		return ` ${and} ${alias}"${field}" ${operator} ${queryValue}`;
	}
};

// Function to build a WHERE clause for SQL queries
const buildWhere = (urlQueryKeysArray: string[], alias: string, rangeField?: string): string => {
	return 'WHERE' + urlQueryKeysArray.map((key, idx) => constructCondition(key, idx, alias, rangeField)).join('');
};

// Function to build a NULL condition in a SQL query
const buildNull = (urlQueryKeysArray: string[], nullKeysArray: string[], alias: string): string => {
	return nullKeysArray
		.map((val, idx) => {
			const and = idx === 0 && urlQueryKeysArray.length === 0 ? '' : 'AND';
			return ` ${and} ${alias}"${val}" IS NULL`;
		})
		.join('');
};

// Function to build an ORDER BY clause for SQL queries
const buildOrderBy = (orderByValuesArray: string[], alias: string): string => {
	return ` ORDER BY ${alias}"${orderByValuesArray[0]}"`; // Assuming one orderBy field for simplicity
};

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
export function buildInsertSqlQuery<T extends Record<string, ColumnDefinition>>(
	tableName: string,
	columnsForInsert: UniqueArray<(keyof T)[]>,
	valuesForInsert: any[],
	onConflict: boolean,
	primaryKeyColumns: UniqueArray<(keyof T)[]>,
	conflictUpdateAssignments: string[],
	returnField?: keyof T
): {sqlText: string; valuesToBeInserted: any[]} {
	// Interpolating the values as $1, $2, $3, etc.
	const placeholders = valuesForInsert.map((_, index) => `$${index + 1}`).join(', ');

	// Building the SQL text
	const sqlText = `
INSERT INTO ${tableName} ("${columnsForInsert.join('", "')}")
VALUES (${placeholders})${
		onConflict && primaryKeyColumns.length > 0
			? ` ON CONFLICT ("${primaryKeyColumns.join(', ')}") DO UPDATE SET ${conflictUpdateAssignments.join(', ')}`
			: ''
	}
${returnField ? `RETURNING "${String(returnField)}"` : ''};
	`;

	return {
		sqlText: sqlText.trim(),
		valuesToBeInserted: valuesForInsert,
	};
}

export default {
	buildInsertSqlQuery,
};
