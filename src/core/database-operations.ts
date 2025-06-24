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
			allowedColumns.forEach((column) => {
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
	 * Low-level select operation with new standardized interface
	 * Available to table implementers through composition
	 */
	public select<U extends QueryResultRow = SchemaToData<T>>(
		input: BaseOptions<T> & {options?: SelectOptions<T>} = {}
	): QueryResult<Partial<U>[]> {
		const {allowedColumns = '*', predefinedSQL, options = {}} = input;
		const {where = {}, alias = '', includeMetadata = false, schemaColumns} = options;

		const selectAllColumns = allowedColumns === '*';
		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns, ['limit', 'offset'], schemaColumns);

		let {sqlQuery: whereClause, urlQueryValuesArray} = queryConstructor(
			treatedAllowedColumns.map((col) => `"${col.toString()}"`),
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
			const columnsToSelect = selectAllColumns
				? '*'
				: treatedAllowedColumns.map((col) => `"${col.toString()}"`).join(', ');
			sqlText = `SELECT ${columnsToSelect} FROM ${this.tableName} ${whereClause}`;
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
