import {pgUtilsDb, pgUtilsHelpers} from './shared';
import {TableDefinition} from '../types/table';
import {ColumnDefinition, SchemaToData, ColumnTypeMapping, QueryParams} from '../types/column';
import {QueryArrayResult, QueryResultRow} from 'pg';
import {QueryObject, adjustPlaceholders, findMaxPlaceholder} from './shared/db/queryUtils';
import {queryConstructor} from './selectQueryConstructor';

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
			pgUtilsHelpers.arrayUtils.checkArrayUniqueness(allowedColumns);
		}
		if (allowedColumns === '*') {
			allowedColumns = Object.keys(schemaColumns || this.schema.columns) as (keyof T)[];
		} else {
			pgUtilsHelpers.arrayUtils.checkArrayUniqueness(allowedColumns);
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
		return pgUtilsHelpers.classUtils.generatePrimaryKey(prefix);
	}

	/**
	 * Low-level insert operation
	 * Available to table implementers through composition
	 */
	public insert(
		dataToBeInserted: Partial<SchemaToData<T>>,
		allowedColumns: (keyof T)[] | '*',
		returnField: keyof T,
		onConflict: boolean = false,
		idUser: string = 'SERVER',
		predefinedSQLText?: string
	): {queryObject: QueryObject; execute: () => Promise<Partial<SchemaToData<T>>[]>} {
		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns);

		const {columnsNamesForInsert, columnValuesForInsert, assignmentsForConflictUpdate} =
			pgUtilsDb.queryUtils.extractInsertAndUpdateAssignmentParts(
				dataToBeInserted,
				treatedAllowedColumns,
				this.schema.columns,
				this.schema.primaryKeys,
				idUser
			);

		const {sqlText, valuesToBeInserted} = pgUtilsDb.queryBuilder.buildInsertSqlQuery(
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
			valuesToBeInserted,
		};

		return {
			queryObject,
			execute: async (): Promise<Partial<SchemaToData<T>>[]> => {
				const result = await pgUtilsDb.queryExecutor.executeInsertQuery<Partial<SchemaToData<T>>>(
					sqlText,
					valuesToBeInserted
				);
				return result;
			},
		};
	}

	/**
	 * Low-level select operation
	 * Available to table implementers through composition
	 */
	public select<U extends QueryResultRow = SchemaToData<T>>(
		paramsObj: {
			params?: QueryParams<T>;
			allowedColumns?: (keyof T)[] | '*';
			alias?: string;
			allowedColumnsOptions?: ('limit' | 'offset')[];
			predefinedSQL?: {sqlText: string; values?: any[]};
			schemaColumns?: U;
		} = {}
	): {sqlText: string; values: any[]; execute: () => Promise<Partial<U>[]>} {
		const {
			params = {},
			allowedColumns = '*',
			alias = '',
			allowedColumnsOptions = ['limit', 'offset'],
			predefinedSQL,
			schemaColumns,
		} = paramsObj;

		const selectAllColumns = allowedColumns === '*';
		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns, allowedColumnsOptions, schemaColumns);

		let {sqlQuery: whereClause, urlQueryValuesArray} = queryConstructor(
			treatedAllowedColumns.map((col) => `"${col.toString()}"`),
			params,
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

		return {
			sqlText,
			values: urlQueryValuesArray,
			execute: async (): Promise<Partial<U>[]> => {
				const result = await pgUtilsDb.queryExecutor.executeSelectQuery(sqlText, urlQueryValuesArray);
				return result as Partial<U>[];
			},
		};
	}

	/**
	 * Low-level update operation
	 * Available to table implementers through composition
	 */
	public update(predefinedSQLText?: string): string {
		return `UPDATE ${this.tableName} SET ...`;
	}

	/**
	 * Low-level transaction operation
	 * Available to table implementers through composition
	 */
	public transaction(
		queryObjects: QueryObject[] = [],
		predefinedSQLText?: string
	): {
		queryObjects: QueryObject[];
		execute: () => Promise<QueryArrayResult<any>[]>;
	} {
		return {
			queryObjects,
			execute: async (): Promise<QueryArrayResult<any[]>[]> => {
				return pgUtilsDb.queryExecutor.executeTransactionQuery(queryObjects);
			},
		};
	}
}
