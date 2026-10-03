import * as queryUtils from '../utils/query-utils';
import * as queryBuilder from '../utils/query-builder';
import * as queryExecutor from '../utils/query-executor';
import * as arrayUtils from '../utils/array-utils';
import * as classUtils from '../utils/class-utils';
import {TableDefinition} from '../types/core-types';
import {ColumnDefinition, SchemaToData, ColumnTypeMapping} from '../types/core-types';
import {QueryArrayResult, QueryResultRow} from 'pg';
import {
	QueryObject,
	adjustPlaceholders,
	findMaxPlaceholder,
	QueryResult,
	TransactionResult,
	AllowedColumns,
	OnConflict,
	BaseOptions,
	UpdateBaseOptions,
	InsertOptions,
	SelectOptions,
	UpdateOptions,
	CustomBaseOptions,
	CustomSelectOptions,
	extractUpdateParts,
} from '../utils/query-utils';
import {queryConstructor, SAFE_IDENTIFIER} from './query-constructor';
import {QueryInputError} from '../utils/query-input-error';

type PredefinedSQL = {sqlText: string; values?: any[]};

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
	/** The highest limit a select accepts, from the table definition. Undefined means no ceiling. */
	public readonly maxLimit?: number;

	constructor(tableDefinition: TableDefinition<T>) {
		this.tableName = tableDefinition.tableName;
		this.schema = {
			columns: tableDefinition.schema.columns,
			primaryKeys: this.filterPrimaryKeys(tableDefinition.schema.columns),
		};
		const {maxLimit} = tableDefinition;
		if (maxLimit !== undefined && (!Number.isInteger(maxLimit) || maxLimit < 0)) {
			throw new Error(`Invalid maxLimit for table ${this.tableName}: ${String(maxLimit)}. Expected a non-negative integer.`);
		}
		this.maxLimit = maxLimit;
	}

	private filterPrimaryKeys(columns: Record<keyof T, ColumnDefinition>): (keyof T)[] {
		const primaryKeys: (keyof T)[] = Object.keys(columns).filter((column) => {
			const columnDefinition = columns[column as keyof T];
			return columnDefinition.primaryKey === true;
		}) as (keyof T)[];
		return primaryKeys;
	}

	/**
	 * allowedColumns has no default. Every call names its columns, or writes '*' out.
	 */
	private requireAllowedColumns(method: string, allowedColumns: unknown): void {
		if (allowedColumns === '*' || Array.isArray(allowedColumns)) {
			return;
		}
		throw new QueryInputError(
			`allowedColumns is required for ${method}. Pass a list of columns, or '*' to allow every column.`
		);
	}

	private treatAllowedColumns(
		allowedColumns: (keyof T)[] | '*',
		allowedColumnsOptions?: ('limit' | 'offset')[],
		schemaColumns?: Record<string, ColumnDefinition>
	): Array<keyof T | 'limit' | 'offset'> {
		let treated: Array<keyof T | 'limit' | 'offset'>;
		if (allowedColumns === '*') {
			treated = Object.keys(schemaColumns || this.schema.columns) as (keyof T)[];
		} else {
			arrayUtils.checkArrayUniqueness(allowedColumns);
			const schemaKeys = new Set(Object.keys(schemaColumns || this.schema.columns));

			// Filter out pagination parameters before schema validation
			const paginationParams = new Set(['limit', 'offset']);
			const columnsToValidate = allowedColumns.filter((column) => !paginationParams.has(column as string));

			columnsToValidate.forEach((column) => {
				if (!schemaKeys.has(column as string)) {
					throw new QueryInputError(`Column ${column.toString()} is not in the provided schema`);
				}
			});
			// A copy, so the caller's array is never changed.
			treated = [...allowedColumns];
		}
		// Handle additional options
		if (allowedColumnsOptions) {
			for (const pagingKey of allowedColumnsOptions) {
				if (!treated.includes(pagingKey)) {
					treated.push(pagingKey);
				}
			}
		}

		return treated;
	}

	/** The quoted column list of a SELECT, or '*'. Paging keys are not columns. */
	private projection(columns: (keyof T)[] | '*', schemaColumns?: Record<string, ColumnDefinition>): string {
		if (columns === '*') {
			return '*';
		}
		return this.treatAllowedColumns(columns, [], schemaColumns)
			.filter((col) => col !== 'limit' && col !== 'offset')
			.map((col) => `"${col.toString()}"`)
			.join(', ');
	}

	/**
	 * Combines predefined SQL with a generated clause and a projection.
	 *
	 * With nothing to add, the predefined SQL is sent exactly as it was given.
	 * Otherwise it becomes a subquery, so the clause works whatever the predefined SQL
	 * ends with: its own WHERE, a GROUP BY or an ORDER BY. Filters then name the
	 * columns of the predefined query's result.
	 */
	private wrapPredefinedSQL(
		predefinedSQL: PredefinedSQL,
		projection: string,
		clause: string,
		clauseValues: any[]
	): QueryObject {
		const predefinedValues = predefinedSQL.values || [];
		if (clause === '' && projection === '*') {
			return {sqlText: predefinedSQL.sqlText, values: predefinedValues};
		}

		const innerSql = predefinedSQL.sqlText.trim().replace(/;+$/, '');
		// Placeholders of the clause continue after the highest one of the predefined SQL.
		const adjustedClause = adjustPlaceholders(clause, findMaxPlaceholder(innerSql));
		// The line breaks keep a trailing line comment of the predefined SQL from swallowing the rest.
		const sqlText = `SELECT ${projection} FROM (\n${innerSql}\n) AS q ${adjustedClause}`.trim();
		return {sqlText, values: predefinedValues.concat(clauseValues)};
	}

	/** The columns of the conflict target of an upsert. Empty when the insert has no ON CONFLICT clause. */
	private conflictTarget(onConflict: OnConflict<T> | undefined): (keyof T)[] {
		if (!onConflict) {
			return [];
		}
		if (typeof onConflict !== 'object') {
			// true targets the primary key
			return this.schema.primaryKeys;
		}
		const target = (onConflict as {target?: unknown}).target;
		if (!Array.isArray(target) || target.length === 0) {
			throw new QueryInputError('Invalid onConflict: target must be a non-empty array of columns.');
		}
		arrayUtils.checkArrayUniqueness(target);
		for (const column of target) {
			if (typeof column !== 'string' || !Object.prototype.hasOwnProperty.call(this.schema.columns, column)) {
				throw new QueryInputError(
					`Invalid onConflict target: ${String(column)}. Expected a column of the table definition.`
				);
			}
		}
		return target as (keyof T)[];
	}

	public generatePrimaryKey(prefix: string): string {
		return classUtils.generatePrimaryKey(prefix);
	}

	/**
	 * Low-level insert operation with new standardized interface
	 * Available to table implementers through composition
	 *
	 * allowedColumns names the columns that may be written. Keys of `data` outside it are dropped.
	 * A null value writes NULL. Only undefined is skipped.
	 */
	public insert(input: BaseOptions<T> & {options: InsertOptions<T>}): QueryResult<Partial<SchemaToData<T>>[]> {
		const {allowedColumns, options} = input;
		this.requireAllowedColumns('insert', allowedColumns);
		const {data, returnField, onConflict = false, idUser = 'SERVER'} = options;

		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns);

		// On conflict, the key columns and the target columns are never rewritten.
		const conflictTarget = this.conflictTarget(onConflict);
		const keptOnConflict = [...new Set([...this.schema.primaryKeys, ...conflictTarget])];

		const {columnsNamesForInsert, columnValuesForInsert, assignmentsForConflictUpdate} =
			queryUtils.extractInsertAndUpdateAssignmentParts(
				data,
				treatedAllowedColumns,
				this.schema.columns,
				keptOnConflict,
				idUser
			);

		const {sqlText, values} = queryBuilder.buildInsertSqlQuery(
			this.tableName,
			columnsNamesForInsert,
			columnValuesForInsert,
			conflictTarget.length > 0,
			conflictTarget,
			assignmentsForConflictUpdate,
			returnField,
			this.schema.columns
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
	 *
	 * The predefined SQL is wrapped as a subquery when a filter, a sort key, a paging key
	 * or a column list is added. Filters therefore name the columns of its result.
	 */
	public selectWithCustomSchema<U extends QueryResultRow, CustomSchema extends Record<string, any>>(
		input: CustomBaseOptions<CustomSchema> & {options?: CustomSelectOptions<CustomSchema>}
	): QueryResult<Partial<U>[]> {
		const {allowedColumns, predefinedSQL, options = {}} = input;
		this.requireAllowedColumns('selectWithCustomSchema', allowedColumns);
		if (!predefinedSQL) {
			throw new QueryInputError('predefinedSQL is required when using selectWithCustomSchema');
		}
		const {where = {}, ignoreUnknownKeys = false, includeMetadata = false, schemaColumns, columnsToReturn} = options;

		// For custom schema, we'll treat columns differently since we're not bound to the table schema.
		// With '*', use the provided schemaColumns as the allow-list when available. Without one,
		// queryConstructor still restricts wildcard fields to plain identifiers.
		// limit and offset are paging keys, not columns. They are allowed next to an explicit list,
		// as select does. The bare wildcard already accepts them.
		const pagingKeys = ['"limit"', '"offset"'];
		const treatedAllowedColumns: string[] = Array.isArray(allowedColumns)
			? allowedColumns.map((col) => `"${col.toString()}"`).concat(pagingKeys)
			: schemaColumns
				? Object.keys(schemaColumns)
						.map((col) => `"${col}"`)
						.concat(pagingKeys)
				: ['*'];

		const {sqlQuery: clause, urlQueryValuesArray: clauseValues} = queryConstructor(treatedAllowedColumns, where, {
			ignoreUnknownKeys,
			maxLimit: this.maxLimit,
		});

		// The columns to return are written into the SQL text, so each one is checked first:
		// against schemaColumns when given, and as a plain identifier otherwise.
		let projection = '*';
		if (columnsToReturn !== undefined && columnsToReturn !== '*') {
			if (!Array.isArray(columnsToReturn)) {
				throw new QueryInputError(`Invalid columnsToReturn. Expected '*' or an array of column names.`);
			}
			arrayUtils.checkArrayUniqueness(columnsToReturn);
			for (const column of columnsToReturn) {
				const name = String(column);
				const known = schemaColumns
					? Object.prototype.hasOwnProperty.call(schemaColumns, name)
					: SAFE_IDENTIFIER.test(name);
				if (!known) {
					throw new QueryInputError(`Column ${name} is not in the provided schema`);
				}
			}
			projection = columnsToReturn.map((column) => `"${String(column)}"`).join(', ');
		}

		const queryObject = this.wrapPredefinedSQL(predefinedSQL, projection, clause, clauseValues);

		return {
			query: queryObject,
			execute: async (): Promise<Partial<U>[]> => {
				const result = await queryExecutor.executeSelectQuery(queryObject.sqlText, queryObject.values);
				return result as Partial<U>[];
			},
		};
	}

	/**
	 * Low-level select operation with new standardized interface
	 * Available to table implementers through composition
	 *
	 * @param input - Configuration object containing:
	 *   - allowedColumns: Controls which columns can be used in WHERE clauses (security/validation).
	 *     It has no default. A where key outside it throws, unless ignoreUnknownKeys is set.
	 *   - predefinedSQL: Optional pre-written SQL query. It is wrapped as a subquery when a clause
	 *     or a column list is added.
	 *   - options: Additional query options including:
	 *     - columnsToReturn: Controls which columns are returned in the SELECT statement (projection)
	 *     - where: Query conditions
	 *     - ignoreUnknownKeys: Drop where keys outside allowedColumns, where the default is to throw
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
		input: BaseOptions<T> & {options?: SelectOptions<T>}
	): QueryResult<Partial<U>[]> {
		// allowedColumns: which columns can be used in WHERE clauses (security/validation)
		// predefinedSQL: optional pre-written SQL query to extend
		// options: additional query options like where conditions, columns to return, etc.
		const {allowedColumns, predefinedSQL, options = {}} = input;
		this.requireAllowedColumns('select', allowedColumns);
		const {where = {}, ignoreUnknownKeys = false, includeMetadata = false, schemaColumns, columnsToReturn} = options;

		// Process and validate the allowed columns for WHERE clause validation
		// This ensures only valid columns are used in WHERE conditions and adds pagination support
		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns, ['limit', 'offset'], schemaColumns);

		// Build the WHERE clause and extract parameter values
		// The queryConstructor creates parameterized queries to prevent SQL injection
		// It returns both the WHERE clause SQL and an array of parameter values
		const {sqlQuery: whereClause, urlQueryValuesArray} = queryConstructor(
			treatedAllowedColumns.map((col) => `"${col.toString()}"`), // Quote column names for SQL safety
			where,
			{ignoreUnknownKeys, maxLimit: this.maxLimit}
		);

		let queryObject: QueryObject;

		if (predefinedSQL) {
			// Branch 1: predefined SQL. Its own column list stands unless columnsToReturn narrows it.
			const projection = columnsToReturn === undefined ? '*' : this.projection(columnsToReturn, schemaColumns);
			queryObject = this.wrapPredefinedSQL(predefinedSQL, projection, whereClause, urlQueryValuesArray);
		} else {
			// Branch 2: Build a standard SELECT query from scratch
			// If columnsToReturn is not specified, fall back to allowedColumns for backward compatibility
			const returnColumns = columnsToReturn !== undefined ? columnsToReturn : allowedColumns;
			const columnsToSelect = this.projection(returnColumns, schemaColumns);

			queryObject = {
				sqlText: `SELECT ${columnsToSelect} FROM ${this.tableName} ${whereClause}`,
				values: urlQueryValuesArray,
			};
		}

		// Return a QueryResult object with the query and an execute function
		return {
			query: queryObject, // The SQL query and parameters for inspection/logging
			execute: async (): Promise<Partial<U>[]> => {
				const result = await queryExecutor.executeSelectQuery(queryObject.sqlText, queryObject.values);
				return result as Partial<U>[];
			},
		};
	}

	/**
	 * Low-level update operation with new standardized interface
	 * Available to table implementers through composition
	 *
	 * allowedColumns names the columns that may be written. Keys of `data` outside it are dropped.
	 * A null value writes NULL. Only undefined is skipped.
	 */
	public update(input: UpdateBaseOptions<T> & {options: UpdateOptions<T>}): QueryResult<Partial<SchemaToData<T>>[]> {
		const {allowedColumns, options} = input;
		if ((input as {predefinedSQL?: unknown}).predefinedSQL !== undefined) {
			throw new QueryInputError(
				'update does not take predefinedSQL. Run the update on its own, or send the whole statement through PostgresConnection.query.'
			);
		}
		this.requireAllowedColumns('update', allowedColumns);
		const {data, where, returnField, idUser = 'SERVER', allowUpdateAll = false} = options;

		// Safety check: WHERE clause is required for updates to prevent accidental mass updates
		const hasWhereClause = where && Object.keys(where).length > 0;
		if (!hasWhereClause && !allowUpdateAll) {
			throw new QueryInputError(
				'WHERE clause is required for UPDATE operations. Set allowUpdateAll: true if you intentionally want to update all rows.'
			);
		}

		// Validate and process allowed columns
		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns);

		// Extract update data parts
		const {columnsNamesForUpdate, columnValuesForUpdate} = extractUpdateParts(
			data,
			treatedAllowedColumns,
			this.schema.columns,
			idUser
		);

		// Validate that there's data to update
		if (columnsNamesForUpdate.length === 0) {
			throw new QueryInputError('No valid columns provided for update operation.');
		}

		// Build WHERE clause using queryConstructor (only if WHERE conditions exist)
		let whereClause = '';
		let whereValues: any[] = [];

		if (hasWhereClause) {
			// allowedColumns only governs which columns may be written. Any column of the table
			// schema may be used to select the rows. A key outside the schema throws.
			const whereResult = queryConstructor(
				this.treatAllowedColumns('*').map((col) => `"${col.toString()}"`),
				where!
			);
			whereClause = whereResult.sqlQuery;
			whereValues = whereResult.urlQueryValuesArray;

			// Ensure WHERE clause was generated when expected
			if (!whereClause.trim()) {
				throw new QueryInputError('Failed to generate WHERE clause for update operation.');
			}
		}

		const {sqlText, values} = queryBuilder.buildUpdateSqlQuery(
			this.tableName,
			columnsNamesForUpdate,
			columnValuesForUpdate,
			whereClause,
			whereValues,
			returnField,
			this.schema.columns
		);

		const queryObject: QueryObject = {
			sqlText,
			values,
		};

		return {
			query: queryObject,
			execute: async (): Promise<Partial<SchemaToData<T>>[]> => {
				const result = await queryExecutor.executeUpdateQuery<Partial<SchemaToData<T>>>(sqlText, values);
				return result;
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
