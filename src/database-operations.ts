import {v4 as uuidv4} from 'uuid';
import PostgresConnection from './connection';
import {TableDefinition} from './types';
import {ColumnDefinition, SchemaToData, ColumnTypeMapping} from './types';
import {QueryArrayResult, QueryResultRow} from 'pg';
import {
	QueryObject,
	QueryResult,
	TransactionResult,
	OnConflict,
	BaseOptions,
	UpdateBaseOptions,
	InsertOptions,
	SelectOptions,
	UpdateOptions,
	CustomBaseOptions,
	CustomSelectOptions,
} from './types';
import {
	extractInsertAndUpdateAssignmentParts,
	extractUpdateParts,
	buildInsertSqlQuery,
	buildUpdateSqlQuery,
} from './sql/write';
import {queryConstructor} from './sql/where';
import {QueryInputError, isIdentifier, tableName as checkedTableName} from './sql/identifiers';
import {maxPlaceholder, renumber} from './sql/placeholders';

export function checkArrayUniqueness<T>(arrayToBeChecked: T[]): void {
	// Runtime check for uniqueness
	const uniqueElements = new Set(arrayToBeChecked);
	if (uniqueElements.size !== arrayToBeChecked.length) {
		throw new QueryInputError('Array must contain unique items');
	}
}

export function generatePrimaryKey(prefix: string): string {
	const primaryKeyString = prefix.concat(
		'_',
		uuidv4()
			.replace(/[^a-zA-Z0-9]+/g, '')
			.toUpperCase()
	);
	return primaryKeyString;
}

type PredefinedSQL = {sqlText: string; values?: any[]};

/** What select and selectWithCustomSchema both take */
interface SelectInput {
	allowedColumns: unknown;
	predefinedSQL?: PredefinedSQL;
	options?: {
		where?: Record<string, any>;
		ignoreUnknownKeys?: boolean;
		columnsToReturn?: unknown;
	};
}

const PAGING_KEYS = ['limit', 'offset'];

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
		// The table name is written into the SQL text without quotes, so it is checked once, here.
		this.tableName = checkedTableName(tableDefinition.tableName);
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
		schemaColumns?: Record<string, unknown>
	): Array<keyof T | 'limit' | 'offset'> {
		let treated: Array<keyof T | 'limit' | 'offset'>;
		if (allowedColumns === '*') {
			treated = Object.keys(schemaColumns || this.schema.columns) as (keyof T)[];
		} else {
			checkArrayUniqueness(allowedColumns);
			const schemaKeys = new Set(Object.keys(schemaColumns || this.schema.columns));

			// Filter out pagination parameters before schema validation
			const paginationParams = new Set(PAGING_KEYS);
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
		const highestPlaceholder = maxPlaceholder(predefinedSQL.sqlText);
		// Values that do not match the placeholders would only fail once the query reaches PostgreSQL.
		if (predefinedSQL.values !== undefined && predefinedSQL.values.length !== highestPlaceholder) {
			throw new QueryInputError(
				`predefinedSQL has ${predefinedSQL.values.length} values, but its highest placeholder is $${highestPlaceholder}.`
			);
		}
		const predefinedValues = predefinedSQL.values || [];
		if (clause === '' && projection === '*') {
			return {sqlText: predefinedSQL.sqlText, values: predefinedValues};
		}

		const innerSql = predefinedSQL.sqlText.trim().replace(/;+$/, '');
		// Placeholders of the clause continue after the highest one of the predefined SQL.
		const adjustedClause = renumber(clause, highestPlaceholder);
		// The line breaks keep a trailing line comment of the predefined SQL from swallowing the rest.
		const sqlText = `SELECT ${projection} FROM (\n${innerSql}\n) AS q ${adjustedClause}`.trim();
		return {sqlText, values: predefinedValues.concat(clauseValues)};
	}

	/**
	 * The one implementation behind select and selectWithCustomSchema.
	 *
	 * @param schema - The columns to check names against. select passes the table schema, or
	 *   options.schemaColumns. selectWithCustomSchema passes options.schemaColumns, which may be undefined:
	 *   then '*' accepts any plain identifier, and a column to return must be a plain identifier.
	 * @param listIsChecked - Whether an explicit allowedColumns list must be part of the schema.
	 *   A custom schema declares its columns through the list itself, so there the list is taken as given.
	 */
	private buildSelect<U extends QueryResultRow>(
		method: string,
		input: SelectInput,
		schema: Record<string, unknown> | undefined,
		listIsChecked: boolean
	): QueryResult<Partial<U>[]> {
		const {allowedColumns, predefinedSQL, options = {}} = input;
		this.requireAllowedColumns(method, allowedColumns);
		const {where = {}, ignoreUnknownKeys = false, columnsToReturn} = options;
		const quote = (column: unknown) => `"${String(column)}"`;

		// 1. The columns a where key may name. limit and offset are paging keys, allowed next to any list.
		let filterColumns: string[];
		if (allowedColumns === '*' && !schema) {
			// No schema to expand '*' with. queryConstructor still restricts fields to plain identifiers.
			filterColumns = ['*'];
		} else if (listIsChecked || allowedColumns === '*') {
			filterColumns = this.treatAllowedColumns(allowedColumns as (keyof T)[] | '*', ['limit', 'offset'], schema).map(quote);
		} else {
			filterColumns = (allowedColumns as unknown[]).map(quote).concat(PAGING_KEYS.map(quote));
		}

		// 2. The WHERE, ORDER BY, LIMIT and OFFSET clause, with its values bound as parameters
		const {sqlQuery: clause, urlQueryValuesArray: clauseValues} = queryConstructor(filterColumns, where, {
			ignoreUnknownKeys,
			maxLimit: this.maxLimit,
		});

		// 3. The columns to return. They are written into the SQL text, so each one is checked first.
		// Without predefined SQL, a missing columnsToReturn falls back to allowedColumns.
		const returnColumns = columnsToReturn !== undefined ? columnsToReturn : predefinedSQL ? '*' : allowedColumns;
		let projection = '*';
		if (returnColumns !== '*') {
			if (!Array.isArray(returnColumns)) {
				throw new QueryInputError(`Invalid columnsToReturn. Expected '*' or an array of column names.`);
			}
			checkArrayUniqueness(returnColumns);
			const columns = returnColumns.filter((column) => !PAGING_KEYS.includes(String(column)));
			for (const column of columns) {
				const known = schema ? Object.prototype.hasOwnProperty.call(schema, String(column)) : isIdentifier(column);
				if (!known) {
					throw new QueryInputError(`Column ${String(column)} is not in the provided schema`);
				}
			}
			projection = columns.map(quote).join(', ');
		}

		// 4. The statement
		const queryObject: QueryObject = predefinedSQL
			? this.wrapPredefinedSQL(predefinedSQL, projection, clause, clauseValues)
			: {sqlText: `SELECT ${projection} FROM ${this.tableName} ${clause}`, values: clauseValues};

		return {
			query: queryObject, // The SQL query and parameters for inspection/logging
			execute: async (): Promise<Partial<U>[]> => {
				const result = await PostgresConnection.query(queryObject.sqlText, queryObject.values);
				return result.rows as Partial<U>[];
			},
		};
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
		checkArrayUniqueness(target);
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
		return generatePrimaryKey(prefix);
	}

	/**
	 * Low-level insert operation with new standardized interface
	 * Available to table implementers through composition
	 *
	 * allowedColumns names the columns that may be written. Keys of `data` outside it are dropped.
	 * A null value writes NULL. Only undefined is skipped. A sqlExpression(...) value is written
	 * into the SQL text and is not bound.
	 *
	 * @param layout - Internal. The chained builder asks for the one-line layout of a referenced step.
	 */
	public insert(
		input: BaseOptions<T> & {options: InsertOptions<T>},
		layout: {compact?: boolean} = {}
	): QueryResult<Partial<SchemaToData<T>>[]> {
		const {allowedColumns, options} = input;
		this.requireAllowedColumns('insert', allowedColumns);
		const {data, returnField, onConflict = false, idUser = 'SERVER'} = options;

		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns);

		// On conflict, the key columns and the target columns are never rewritten.
		const conflictTarget = this.conflictTarget(onConflict);
		const keptOnConflict = [...new Set([...this.schema.primaryKeys, ...conflictTarget])];

		const {columnsNamesForInsert, columnValuesForInsert, expressionsForInsert, assignmentsForConflictUpdate} =
			extractInsertAndUpdateAssignmentParts(
				data,
				treatedAllowedColumns,
				this.schema.columns,
				keptOnConflict,
				idUser
			);

		const {sqlText, values} = buildInsertSqlQuery(
			this.tableName,
			columnsNamesForInsert,
			columnValuesForInsert,
			conflictTarget.length > 0,
			conflictTarget,
			assignmentsForConflictUpdate,
			returnField,
			this.schema.columns,
			{expressions: expressionsForInsert, compact: layout.compact}
		);

		const queryObject: QueryObject = {
			sqlText,
			values,
		};

		return {
			query: queryObject,
			execute: async (): Promise<Partial<SchemaToData<T>>[]> => {
				const result = await PostgresConnection.query(sqlText, values);
				return result.rows;
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
		if (!input.predefinedSQL) {
			this.requireAllowedColumns('selectWithCustomSchema', input.allowedColumns);
			throw new QueryInputError('predefinedSQL is required when using selectWithCustomSchema');
		}
		// A custom schema is not bound to the table schema. With '*', options.schemaColumns is the
		// allow-list when it is given. An explicit list is taken as given.
		return this.buildSelect<U>('selectWithCustomSchema', input, input.options?.schemaColumns, false);
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
		return this.buildSelect<U>('select', input, input?.options?.schemaColumns || this.schema.columns, true);
	}

	/**
	 * Low-level update operation with new standardized interface
	 * Available to table implementers through composition
	 *
	 * allowedColumns names the columns that may be written. Keys of `data` outside it are dropped.
	 * A null value writes NULL. Only undefined is skipped. A sqlExpression(...) value is written
	 * into the SQL text and is not bound.
	 *
	 * @param layout - Internal. The chained builder asks for the one-line layout of a referenced step.
	 */
	public update(
		input: UpdateBaseOptions<T> & {options: UpdateOptions<T>},
		layout: {compact?: boolean} = {}
	): QueryResult<Partial<SchemaToData<T>>[]> {
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
		const {columnsNamesForUpdate, columnValuesForUpdate, expressionsForUpdate} = extractUpdateParts(
			data,
			treatedAllowedColumns,
			this.schema.columns,
			idUser
		);

		// Validate that there's data to update
		if (columnsNamesForUpdate.length === 0 && expressionsForUpdate.length === 0) {
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

		const {sqlText, values} = buildUpdateSqlQuery(
			this.tableName,
			columnsNamesForUpdate,
			columnValuesForUpdate,
			whereClause,
			whereValues,
			returnField,
			this.schema.columns,
			{expressions: expressionsForUpdate, compact: layout.compact}
		);

		const queryObject: QueryObject = {
			sqlText,
			values,
		};

		return {
			query: queryObject,
			execute: async (): Promise<Partial<SchemaToData<T>>[]> => {
				const result = await PostgresConnection.query(sqlText, values);
				return result.rows;
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
				// One client runs BEGIN, every statement and COMMIT.
				const results = await PostgresConnection.transaction(queries);
				return results as unknown as QueryArrayResult<any>[];
			},
			add: (query: QueryObject): TransactionResult<QueryArrayResult<any>[]> => {
				queries.push(query);
				return transactionResult;
			},
		};

		return transactionResult;
	}
}

// ---------- Access for the chained builder ----------

// A table class keeps its DatabaseOperations in a protected member. The chained builder needs it
// to build a step for that table. This map is how it gets it. It is not part of the package entry.
const operationsOfTable = new WeakMap<object, DatabaseOperations<any>>();

/** Called by TableBase, so a chain can take the table class itself. */
export function registerTableOperations(table: object, operations: DatabaseOperations<any>): void {
	operationsOfTable.set(table, operations);
}

/** Returns the DatabaseOperations behind a chain step's table: the object itself, or the one of a table class. */
export function operationsOf<T extends Record<string, {type: keyof ColumnTypeMapping}>>(
	table: unknown
): DatabaseOperations<T> {
	if (table instanceof DatabaseOperations) {
		return table;
	}
	const operations = typeof table === 'object' && table !== null ? operationsOfTable.get(table) : undefined;
	if (!operations) {
		throw new QueryInputError('Invalid table for a chain step. Pass a table class instance, or a registered table name.');
	}
	return operations;
}
