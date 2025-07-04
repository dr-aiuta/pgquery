import * as queryUtils from '../utils/query-utils';
import * as queryBuilder from '../utils/query-builder';
import * as queryExecutor from '../utils/query-executor';
import * as arrayUtils from '../utils/array-utils';
import * as classUtils from '../utils/class-utils';
import {TableDefinition} from '../types/core-types';
import {ColumnDefinition, SchemaToData, ColumnTypeMapping, QueryParams} from '../types/core-types';
import {QueryArrayResult, QueryResultRow} from 'pg';
import {
	QueryObject,
	adjustPlaceholders,
	findMaxPlaceholder,
	QueryResult,
	TransactionResult,
	BaseOptions,
	InsertOptions,
	SelectOptions,
	UpdateOptions,
	CustomBaseOptions,
	CustomSelectOptions,
} from '../utils/query-utils';
import {queryConstructor} from './query-constructor';

/**
 * Internal database operations class - not exposed to end users
 * Contains all low-level database operations that table classes can use
 * through composition rather than inheritance
 */
export class DatabaseOperations<T extends Record<string, {type: keyof ColumnTypeMapping}>> {
	public readonly tableName: string;
	public readonly schema: {
		columns: {
			[K in keyof T]: ColumnDefinition;
		};
		primaryKeys: (keyof T)[];
	};

	constructor(tableDefinition: TableDefinition<T>) {
		this.tableName = tableDefinition.tableName;
		this.schema = {
			columns: tableDefinition.schema.columns,
			primaryKeys: this.filterPrimaryKeys(tableDefinition.schema.columns),
		};
	}

	private filterPrimaryKeys(columns: Record<keyof T, ColumnDefinition>): (keyof T)[] {
		const primaryKeys: (keyof T)[] = Object.keys(columns).filter((column) => {
			const columnDefinition = columns[column as keyof T];
			return columnDefinition.primaryKey === true;
		}) as (keyof T)[];
		return primaryKeys;
	}

	private treatAllowedColumns(
		allowedColumns: (keyof T)[] | '*',
		allowedColumnsOptions?: ('limit' | 'offset')[],
		schemaColumns?: Record<string, ColumnDefinition>
	): Array<keyof T | 'limit' | 'offset'> {
		if (Array.isArray(allowedColumns)) {
			arrayUtils.checkArrayUniqueness(allowedColumns);
		}
		if (allowedColumns === '*') {
			allowedColumns = Object.keys(schemaColumns || this.schema.columns) as (keyof T)[];
		} else {
			arrayUtils.checkArrayUniqueness(allowedColumns);
			const schemaKeys = new Set(Object.keys(schemaColumns || this.schema.columns));

			// Filter out pagination parameters before schema validation
			const paginationParams = new Set(['limit', 'offset']);
			const columnsToValidate = allowedColumns.filter((column) => !paginationParams.has(column as string));

			columnsToValidate.forEach((column) => {
				if (!schemaKeys.has(column as string)) {
					throw new Error(`Column ${column.toString()} is not in the provided schema`);
				}
			});
		}
		// Handle additional options
		if (allowedColumnsOptions) {
			if (allowedColumnsOptions.includes('limit')) {
				allowedColumns.push('limit' as keyof T | 'limit' | 'offset');
			}
			if (allowedColumnsOptions.includes('offset')) {
				allowedColumns.push('offset' as keyof T | 'limit' | 'offset');
			}
		}

		return allowedColumns as Array<keyof T | 'limit' | 'offset'>;
	}

	public generatePrimaryKey(prefix: string): string {
		return classUtils.generatePrimaryKey(prefix);
	}

	/**
	 * Low-level insert operation with new standardized interface
	 * Available to table implementers through composition
	 */
	public insert(input: BaseOptions<T> & {options: InsertOptions<T>}): QueryResult<Partial<SchemaToData<T>>[]> {
		const {allowedColumns = '*', predefinedSQL, options} = input;
		const {data, returnField, onConflict = false, idUser = 'SERVER'} = options;

		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns);

		const {columnsNamesForInsert, columnValuesForInsert, assignmentsForConflictUpdate} =
			queryUtils.extractInsertAndUpdateAssignmentParts(
				data,
				treatedAllowedColumns,
				this.schema.columns,
				this.schema.primaryKeys,
				idUser
			);

		const {sqlText, values} = queryBuilder.buildInsertSqlQuery(
			this.tableName,
			columnsNamesForInsert,
			columnValuesForInsert,
			onConflict,
			this.schema.primaryKeys,
			assignmentsForConflictUpdate,
			returnField
		);

		const queryObject: QueryObject = {
			sqlText,
			values,
		};

		return {
			query: queryObject,
			execute: async (): Promise<Partial<SchemaToData<T>>[]> => {
				const result = await queryExecutor.executeInsertQuery<Partial<SchemaToData<T>>>(sqlText, values);
				return result;
			},
		};
	}

	/**
	 * Custom select operation for predefined SQL with custom schema types
	 * Allows filtering and column selection based on joined result schema
	 * Available to table implementers through composition
	 */
	public selectWithCustomSchema<U extends QueryResultRow, CustomSchema extends Record<string, any>>(
		input: CustomBaseOptions<CustomSchema> & {options?: CustomSelectOptions<CustomSchema>}
	): QueryResult<Partial<U>[]> {
		const {allowedColumns = '*', predefinedSQL, options = {}} = input;
		const {where = {}, alias = '', includeMetadata = false, schemaColumns} = options;

		const selectAllColumns = allowedColumns === '*';
		// For custom schema, we'll treat columns differently since we're not bound to the table schema
		const treatedAllowedColumns = Array.isArray(allowedColumns) ? allowedColumns.map((col) => col.toString()) : ['*'];

		let {sqlQuery: whereClause, urlQueryValuesArray} = queryConstructor(
			selectAllColumns ? ['*'] : treatedAllowedColumns.map((col) => `"${col}"`),
			where,
			alias
		);

		let sqlText: string = '';

		if (predefinedSQL) {
			predefinedSQL.sqlText = predefinedSQL.sqlText.trim().replace(/;+$/, '');
			let maxPlaceholder: number = findMaxPlaceholder(predefinedSQL.sqlText);
			const adjustedWhereClause = adjustPlaceholders(whereClause, maxPlaceholder);
			sqlText = `${predefinedSQL.sqlText} ${adjustedWhereClause}`;
			urlQueryValuesArray = (predefinedSQL.values || []).concat(urlQueryValuesArray);
		} else {
			// This shouldn't happen since predefinedSQL is required for CustomBaseOptions
			throw new Error('predefinedSQL is required when using selectWithCustomSchema');
		}

		const queryObject: QueryObject = {
			sqlText,
			values: urlQueryValuesArray,
		};

		return {
			query: queryObject,
			execute: async (): Promise<Partial<U>[]> => {
				const result = await queryExecutor.executeSelectQuery(sqlText, urlQueryValuesArray);
				return result as Partial<U>[];
			},
		};
	}

	/**
	 * Low-level select operation with new standardized interface
	 * Available to table implementers through composition
	 *
	 * @param input - Configuration object containing:
	 *   - allowedColumns: Controls which columns can be used in WHERE clauses (security/validation)
	 *   - predefinedSQL: Optional pre-written SQL query to extend
	 *   - options: Additional query options including:
	 *     - columnsToReturn: Controls which columns are returned in the SELECT statement (projection)
	 *     - where: Query conditions
	 *     - alias: Table alias
	 *     - etc.
	 *
	 * @example
	 * // Security: Only allow filtering by 'id' and 'name', but return all columns
	 * select({
	 *   allowedColumns: ['id', 'name'],
	 *   options: {
	 *     where: { id: 123 },
	 *     columnsToReturn: '*'
	 *   }
	 * })
	 *
	 * @example
	 * // Projection: Allow all WHERE conditions, but only return specific columns
	 * select({
	 *   allowedColumns: '*',
	 *   options: {
	 *     where: { status: 'active' },
	 *     columnsToReturn: ['id', 'name', 'email']
	 *   }
	 * })
	 */
	public select<U extends QueryResultRow = SchemaToData<T>>(
		input: BaseOptions<T> & {options?: SelectOptions<T>} = {}
	): QueryResult<Partial<U>[]> {
		// Extract input parameters with defaults
		// allowedColumns: which columns can be used in WHERE clauses (security/validation)
		// predefinedSQL: optional pre-written SQL query to extend
		// options: additional query options like where conditions, alias, columns to return, etc.
		const {allowedColumns = '*', predefinedSQL, options = {}} = input;
		const {where = {}, alias = '', includeMetadata = false, schemaColumns, columnsToReturn} = options;

		// Determine which columns to return in the SELECT statement
		// If columnsToReturn is not specified, fall back to allowedColumns for backward compatibility
		const returnColumns = columnsToReturn !== undefined ? columnsToReturn : allowedColumns;
		const selectAllColumns = returnColumns === '*';

		// Process and validate the allowed columns for WHERE clause validation
		// This ensures only valid columns are used in WHERE conditions and adds pagination support
		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns, ['limit', 'offset'], schemaColumns);

		// Process and validate the columns to return in the SELECT statement
		// This determines what columns will be included in the result set
		// NOTE: No pagination parameters should be included here as they're not returnable columns
		const treatedColumnsToReturn = this.treatAllowedColumns(returnColumns, [], schemaColumns);

		// Build the WHERE clause and extract parameter values
		// The queryConstructor creates parameterized queries to prevent SQL injection
		// It returns both the WHERE clause SQL and an array of parameter values
		// We use treatedAllowedColumns here for WHERE clause validation (security)
		let {sqlQuery: whereClause, urlQueryValuesArray} = queryConstructor(
			treatedAllowedColumns.map((col) => `"${col.toString()}"`), // Quote column names for SQL safety
			where,
			alias
		);

		// Initialize the final SQL query text
		let sqlText: string = '';

		// Branch 1: If predefinedSQL is provided, extend it with our WHERE clause
		if (predefinedSQL) {
			// Clean up the predefined SQL by removing trailing semicolons
			predefinedSQL.sqlText = predefinedSQL.sqlText.trim().replace(/;+$/, '');

			// Find the highest placeholder number in the predefined SQL (e.g., $1, $2, etc.)
			// This is needed to avoid conflicts when adding new placeholders
			let maxPlaceholder: number = findMaxPlaceholder(predefinedSQL.sqlText);

			// Adjust placeholder numbers in our WHERE clause to avoid conflicts
			// If predefined SQL has $1, $2, our WHERE clause placeholders become $3, $4, etc.
			const adjustedWhereClause = adjustPlaceholders(whereClause, maxPlaceholder);

			// Combine the predefined SQL with our WHERE clause
			sqlText = `${predefinedSQL.sqlText} ${adjustedWhereClause}`;

			// Merge parameter values: predefined values first, then our WHERE clause values
			urlQueryValuesArray = (predefinedSQL.values || []).concat(urlQueryValuesArray);
		} else {
			// Branch 2: Build a standard SELECT query from scratch

			// Determine which columns to select based on columnsToReturn (projection)
			const columnsToSelect = selectAllColumns
				? '*' // Select all columns
				: treatedColumnsToReturn
						.filter((col) => col !== 'limit' && col !== 'offset') // Remove pagination params from SELECT
						.map((col) => `"${col.toString()}"`)
						.join(', '); // Select specific columns

			// Build the complete SELECT query
			sqlText = `SELECT ${columnsToSelect} FROM ${this.tableName} ${whereClause}`;
		}

		// Create the query object that contains both SQL and parameter values
		const queryObject: QueryObject = {
			sqlText,
			values: urlQueryValuesArray,
		};

		// Return a QueryResult object with the query and an execute function
		return {
			query: queryObject, // The SQL query and parameters for inspection/logging
			execute: async (): Promise<Partial<U>[]> => {
				// Execute the query and return the results
				// executeSelectQuery handles the actual database communication
				const result = await queryExecutor.executeSelectQuery(sqlText, urlQueryValuesArray);
				return result as Partial<U>[];
			},
		};
	}

	/**
	 * Low-level update operation with new standardized interface
	 * Available to table implementers through composition
	 */
	public update(input: BaseOptions<T> & {options: UpdateOptions<T>}): QueryResult<Partial<SchemaToData<T>>[]> {
		const {allowedColumns = '*', predefinedSQL, options} = input;
		const {data, where, returnField, idUser = 'SERVER'} = options;

		// Basic implementation - you can expand this based on your needs
		const sqlText = `UPDATE ${this.tableName} SET ... WHERE ...`;
		const values: any[] = [];

		const queryObject: QueryObject = {
			sqlText,
			values,
		};

		return {
			query: queryObject,
			execute: async (): Promise<Partial<SchemaToData<T>>[]> => {
				// Implement update execution logic
				return [];
			},
		};
	}

	/**
	 * Transaction builder with new standardized interface
	 * Available to table implementers through composition
	 */
	public transaction(): TransactionResult<QueryArrayResult<any>[]> {
		const queries: QueryObject[] = [];

		const transactionResult: TransactionResult<QueryArrayResult<any>[]> = {
			queries,
			execute: async (): Promise<QueryArrayResult<any>[]> => {
				return queryExecutor.executeTransactionQuery(queries);
			},
			add: (query: QueryObject): TransactionResult<QueryArrayResult<any>[]> => {
				queries.push(query);
				return transactionResult;
			},
		};

		return transactionResult;
	}
}
