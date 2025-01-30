// Function to construct a SQL condition based on key, index, alias, and rangeField
const constructCondition = (key, idx, alias, rangeField) => {
    const and = idx === 0 ? '' : 'AND';
    const field = key.split('.')[0];
    const operator = key.split('.')[1] === 'not' ? '<>' : '=';
    const queryValue = `$${idx + 1}`;
    if (field === 'startDate' && rangeField) {
        return ` ${and} ${rangeField} >= ${queryValue}`;
    }
    else if (field === 'endDate' && rangeField) {
        return ` ${and} ${rangeField} <= ${queryValue}`;
    }
    else {
        return ` ${and} ${alias}"${field}" ${operator} ${queryValue}`;
    }
};
// Function to build a WHERE clause for SQL queries
const buildWhere = (urlQueryKeysArray, alias, rangeField) => {
    return 'WHERE' + urlQueryKeysArray.map((key, idx) => constructCondition(key, idx, alias, rangeField)).join('');
};
// Function to build a NULL condition in a SQL query
const buildNull = (urlQueryKeysArray, nullKeysArray, alias) => {
    return nullKeysArray
        .map((val, idx) => {
        const and = idx === 0 && urlQueryKeysArray.length === 0 ? '' : 'AND';
        return ` ${and} ${alias}"${val}" IS NULL`;
    })
        .join('');
};
// Function to build an ORDER BY clause for SQL queries
const buildOrderBy = (orderByValuesArray, alias) => {
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
export function buildInsertSqlQuery(tableName, columnsForInsert, valuesForInsert, onConflict, primaryKeyColumns, conflictUpdateAssignments, returnField) {
    // Interpolating the values as $1, $2, $3, etc.
    const placeholders = valuesForInsert.map((_, index) => `$${index + 1}`).join(', ');
    // Building the SQL text
    const sqlText = `
INSERT INTO ${tableName} ("${columnsForInsert.join('", "')}")
VALUES (${placeholders})${onConflict && primaryKeyColumns.length > 0
        ? ` ON CONFLICT ("${primaryKeyColumns.join(', ')}") DO UPDATE SET ${conflictUpdateAssignments.join(', ')}`
        : ''}
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
