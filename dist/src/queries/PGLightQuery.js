import { pgUtilsDb, pgUtilsHelpers } from './shared';
import { adjustPlaceholders, findMaxPlaceholder } from './shared/db/queryUtils';
import { queryConstructor } from './selectQueryConstructor';
export class PGLightQuery {
    constructor(tableDefinition) {
        this.tableName = tableDefinition.tableName;
        this.schema = {
            columns: tableDefinition.schema.columns,
            primaryKeys: this.filterPrimaryKeys(tableDefinition.schema.columns),
        };
    }
    filterPrimaryKeys(columns) {
        const primaryKeys = Object.keys(columns).filter((column) => {
            const columnDefinition = columns[column];
            return columnDefinition.primaryKey === true;
        });
        return primaryKeys;
    }
    treatAllowedColumns(allowedColumns, allowedColumnsOptions, schemaColumns) {
        if (Array.isArray(allowedColumns)) {
            pgUtilsHelpers.arrayUtils.checkArrayUniqueness(allowedColumns);
        }
        if (allowedColumns === '*') {
            allowedColumns = Object.keys(schemaColumns || this.schema.columns);
        }
        else {
            pgUtilsHelpers.arrayUtils.checkArrayUniqueness(allowedColumns);
            const schemaKeys = new Set(Object.keys(schemaColumns || this.schema.columns));
            allowedColumns.forEach((column) => {
                if (!schemaKeys.has(column)) {
                    throw new Error(`Column ${column.toString()} is not in the provided schema`);
                }
            });
        }
        // Handle additional options
        if (allowedColumnsOptions) {
            if (allowedColumnsOptions.includes('limit')) {
                allowedColumns.push('limit');
            }
            if (allowedColumnsOptions.includes('offset')) {
                allowedColumns.push('offset');
            }
        }
        return allowedColumns;
    }
    generatePrimaryKey(prefix) {
        return pgUtilsHelpers.classUtils.generatePrimaryKey(prefix);
    }
    // Ensure the method signature in PGLightQuery matches what's expected in BoundMethods
    insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser = 'SERVER', predefinedSQLText) {
        allowedColumns = this.treatAllowedColumns(allowedColumns);
        const { columnsNamesForInsert, columnValuesForInsert, assignmentsForConflictUpdate } = pgUtilsDb.queryUtils.extractInsertAndUpdateAssignmentParts(dataToBeInserted, allowedColumns, this.schema.columns, this.schema.primaryKeys, idUser);
        const { sqlText, valuesToBeInserted } = pgUtilsDb.queryBuilder.buildInsertSqlQuery(this.tableName, columnsNamesForInsert, columnValuesForInsert, onConflict, this.schema.primaryKeys, assignmentsForConflictUpdate, returnField);
        // Return queryObject and the execute function
        const queryObject = {
            sqlText,
            valuesToBeInserted,
        };
        return {
            queryObject,
            execute: async () => {
                // Execute the query and return the result
                const result = await pgUtilsDb.queryExecutor.executeInsertQuery(sqlText, valuesToBeInserted);
                return result;
            },
        };
    }
    select(paramsObj = {}) {
        // Destructure the input object with defaults
        const { params = {}, allowedColumns = '*', alias = '', allowedColumnsOptions = ['limit', 'offset'], predefinedSQL, schemaColumns, } = paramsObj;
        // Step 1: Determine if we're selecting all columns
        const selectAllColumns = allowedColumns === '*';
        // Step 2: Treat allowed columns
        const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns, allowedColumnsOptions, schemaColumns);
        // Step 3: Build the WHERE clause and collect query values
        let { sqlQuery: whereClause, urlQueryValuesArray } = queryConstructor(treatedAllowedColumns.map((col) => `"${col.toString()}"`), params, alias);
        let sqlText = '';
        if (predefinedSQL) {
            // Remove any trailing semicolons
            predefinedSQL.sqlText = predefinedSQL.sqlText.trim().replace(/;+$/, '');
            let maxPlaceholder = findMaxPlaceholder(predefinedSQL.sqlText);
            // Adjust the placeholders in whereClause
            const adjustedWhereClause = adjustPlaceholders(whereClause, maxPlaceholder);
            // Append the adjusted WHERE clause to the SQL text
            sqlText = `${predefinedSQL.sqlText} ${adjustedWhereClause}`;
            // Combine predefined values with whereClause values
            urlQueryValuesArray = (predefinedSQL.values || []).concat(urlQueryValuesArray);
        }
        else {
            // Step 4: Construct the final SQL query
            const columnsToSelect = selectAllColumns
                ? '*'
                : treatedAllowedColumns.map((col) => `"${col.toString()}"`).join(', ');
            sqlText = `SELECT ${columnsToSelect} FROM ${this.tableName} ${whereClause}`;
        }
        // Step 5: Return the execute function
        return {
            sqlText,
            values: urlQueryValuesArray,
            execute: async () => {
                // Standard selection using the table's schema T
                const result = await pgUtilsDb.queryExecutor.executeSelectQuery(sqlText, urlQueryValuesArray);
                return result;
            },
        };
    }
    update(predefinedSQLText) {
        // Implementation of update
        return `UPDATE ${this.tableName} SET ...`;
    }
    transaction(queryObjects = [], predefinedSQLText) {
        return {
            queryObjects,
            execute: async () => {
                // Execute the query and return the result
                return pgUtilsDb.queryExecutor.executeTransactionQuery(queryObjects);
            },
        };
    }
}
