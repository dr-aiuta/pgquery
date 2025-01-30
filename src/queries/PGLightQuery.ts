import {pgUtilsDb, pgUtilsHelpers} from './shared';
import {TableDefinition} from '../types/table';
import {ColumnDefinition, SchemaToData, ColumnTypeMapping, QueryParams, QueryConditionKeys} from '../types/column';
import dbpg from '../config/queries';
import {QueryArrayResult, QueryResult, QueryResultRow} from 'pg';
import {QueryObject, adjustPlaceholders, findMaxPlaceholder} from './shared/db/queryUtils';
import {queryConstructor} from './selectQueryConstructor';

export interface BoundMethods<T extends Record<string, ColumnDefinition>> {
	insert: (
		dataToBeInserted: Partial<SchemaToData<T>>,
		allowedColumns: (keyof T)[],
		returnField: keyof T,
		onConflict: boolean,
		idUser: string,
		predefinedSQLText?: string
	) => {queryObject: QueryObject; execute: () => Promise<Partial<SchemaToData<T>>[]>};
	select: (paramsObj: {
		params?: QueryParams<T>;
		allowedColumns?: (keyof T)[] | '*';
		alias?: string;
		allowedColumnsOptions?: ('limit' | 'offset')[];
		predefinedSQL?: {sqlText: string; values?: any[]};
	}) => {sqlText: string; values: any[]; execute: () => Promise<Partial<SchemaToData<T>[]>[]>};
	update: () => string;
	// Add more methods if necessary
}

export class PGLightQuery<T extends Record<string, {type: keyof ColumnTypeMapping}>> {
	public tableName: string;
	public schema: {
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

	public generatePrimaryKey(prefix: string) {
		return pgUtilsHelpers.classUtils.generatePrimaryKey(prefix);
	}

	// Ensure the method signature in PGLightQuery matches what's expected in BoundMethods
	protected insert(
		dataToBeInserted: Partial<SchemaToData<T>>,
		allowedColumns: (keyof T)[] | '*',
		returnField: keyof T,
		onConflict: boolean,
		idUser: string = 'SERVER',
		predefinedSQLText?: string
	): {queryObject: QueryObject; execute: () => Promise<Partial<SchemaToData<T>>[]>} {
		allowedColumns = this.treatAllowedColumns(allowedColumns);

		const {columnsNamesForInsert, columnValuesForInsert, assignmentsForConflictUpdate} =
			pgUtilsDb.queryUtils.extractInsertAndUpdateAssignmentParts(
				dataToBeInserted,
				allowedColumns,
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
		// Return queryObject and the execute function
		const queryObject: QueryObject = {
			sqlText,
			valuesToBeInserted,
		};

		return {
			queryObject,
			execute: async (): Promise<Partial<SchemaToData<T>>[]> => {
				// Execute the query and return the result
				const result = await pgUtilsDb.queryExecutor.executeInsertQuery<Partial<SchemaToData<T>>>(
					sqlText,
					valuesToBeInserted
				);
				return result;
			},
		};
	}

	protected select<U extends QueryResultRow = SchemaToData<T>>(
		paramsObj: {
			params?: QueryParams<T>;
			allowedColumns?: (keyof T)[] | '*';
			alias?: string;
			allowedColumnsOptions?: ('limit' | 'offset')[];
			predefinedSQL?: {sqlText: string; values?: any[]};
			schemaColumns?: U;
		} = {}
	): {sqlText: string; values: any[]; execute: () => Promise<Partial<U>[]>} {
		// Destructure the input object with defaults
		const {
			params = {},
			allowedColumns = '*',
			alias = '',
			allowedColumnsOptions = ['limit', 'offset'],
			predefinedSQL,
			schemaColumns,
		} = paramsObj;

		// Step 1: Determine if we're selecting all columns
		const selectAllColumns = allowedColumns === '*';

		// Step 2: Treat allowed columns
		const treatedAllowedColumns = this.treatAllowedColumns(allowedColumns, allowedColumnsOptions, schemaColumns);

		// Step 3: Build the WHERE clause and collect query values
		let {sqlQuery: whereClause, urlQueryValuesArray} = queryConstructor(
			treatedAllowedColumns.map((col) => `"${col.toString()}"`),
			params,
			alias
		);

		let sqlText: string = '';

		if (predefinedSQL) {
			// Remove any trailing semicolons
			predefinedSQL.sqlText = predefinedSQL.sqlText.trim().replace(/;+$/, '');

			let maxPlaceholder: number = findMaxPlaceholder(predefinedSQL.sqlText);

			// Adjust the placeholders in whereClause
			const adjustedWhereClause = adjustPlaceholders(whereClause, maxPlaceholder);

			// Append the adjusted WHERE clause to the SQL text
			sqlText = `${predefinedSQL.sqlText} ${adjustedWhereClause}`;

			// Combine predefined values with whereClause values
			urlQueryValuesArray = (predefinedSQL.values || []).concat(urlQueryValuesArray);
		} else {
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
			execute: async (): Promise<Partial<U>[]> => {
				// Standard selection using the table's schema T
				const result = await pgUtilsDb.queryExecutor.executeSelectQuery(sqlText, urlQueryValuesArray);
				return result as Partial<U>[];
			},
		};
	}

	protected update(predefinedSQLText?: string): string {
		// Implementation of update
		return `UPDATE ${this.tableName} SET ...`;
	}

	protected transaction(
		queryObjects: QueryObject[] = [],
		predefinedSQLText?: string
	): {
		queryObjects: QueryObject[];
		execute: () => Promise<QueryArrayResult<any>[]>;
	} {
		return {
			queryObjects,
			execute: async (): Promise<QueryArrayResult<any[]>[]> => {
				// Execute the query and return the result
				return pgUtilsDb.queryExecutor.executeTransactionQuery(queryObjects);
			},
		};
	}
}
