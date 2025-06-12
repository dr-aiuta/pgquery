import {TableDefinition} from '../types/core-types';
import {ColumnDefinition, SchemaToData, ColumnTypeMapping, QueryParams} from '../types/core-types';
import {QueryArrayResult, QueryResultRow} from 'pg';
import {QueryObject} from '../utils/query-utils';
import {DatabaseOperations} from './database-operations';

/**
 * Base class for table implementations using composition
 *
 * This class provides access to database operations through a protected 'db' property,
 * ensuring that low-level database methods are not exposed in the public API of
 * table implementations.
 *
 * @example
 * ```typescript
 * class UsersTable extends TableBase<UsersSchema> {
 *   constructor() {
 *     super(usersTableDefinition);
 *   }
 *
 *   // Only methods you define here will be in the public API
 *   public async insertUser(userData: UserData): Promise<User> {
 *     return this.db.insert(userData, {allowedColumns: ['name', 'email']}).execute();
 *   }
 *
 *   public async selectUsers(filter?: UserFilter): Promise<User[]> {
 *     return this.db.select({params: filter}).execute();
 *   }
 * }
 *
 * const usersTable = new UsersTable();
 * usersTable.insertUser({name: 'John'}); // ✅ Available - intended public API
 * usersTable.insert(...);               // ❌ Not available - good!
 * ```
 */
export abstract class TableBase<T extends Record<string, {type: keyof ColumnTypeMapping}>> {
	/**
	 * Protected database operations instance
	 *
	 * This provides access to low-level database operations (insert, select, update, transaction)
	 * without exposing them in the public API of table implementations.
	 *
	 * Table implementers can use this.db.insert(), this.db.select(), etc. within their
	 * public methods, but end users cannot access this.db or the raw database methods.
	 */
	protected readonly db: DatabaseOperations<T>;

	/**
	 * Public read-only access to table name
	 */
	public readonly tableName: string;

	/**
	 * Public read-only access to schema information
	 */
	public readonly schema: {
		columns: {
			[K in keyof T]: ColumnDefinition;
		};
		primaryKeys: (keyof T)[];
	};

	constructor(tableDefinition: TableDefinition<T>) {
		this.db = new DatabaseOperations(tableDefinition);
		this.tableName = this.db.tableName;
		this.schema = this.db.schema;
	}

	/**
	 * Generate a unique primary key with the given prefix
	 *
	 * @param prefix - The prefix for the generated key
	 * @returns A unique primary key string
	 */
	public generatePrimaryKey(prefix: string): string {
		return this.db.generatePrimaryKey(prefix);
	}

	/**
	 * Access to low-level insert operation
	 * Protected method - only available to table implementers, not end users
	 *
	 * @param dataToBeInserted - Data to insert
	 * @param allowedColumns - Allowed columns for insertion
	 * @param returnField - Field to return after insertion
	 * @param onConflict - Whether to handle conflicts
	 * @param idUser - User ID for audit purposes
	 * @param predefinedSQLText - Custom SQL text if needed
	 * @returns Query object with execute method
	 */
	protected insert(
		dataToBeInserted: Partial<SchemaToData<T>>,
		allowedColumns: (keyof T)[] | '*',
		returnField: keyof T,
		onConflict: boolean = false,
		idUser: string = 'SERVER',
		predefinedSQLText?: string
	): {queryObject: QueryObject; execute: () => Promise<Partial<SchemaToData<T>>[]>} {
		return this.db.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser, predefinedSQLText);
	}

	/**
	 * Access to low-level select operation
	 * Protected method - only available to table implementers, not end users
	 */
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
		return this.db.select(paramsObj);
	}

	/**
	 * Access to low-level update operation
	 * Protected method - only available to table implementers, not end users
	 */
	protected update(predefinedSQLText?: string): string {
		return this.db.update(predefinedSQLText);
	}

	/**
	 * Access to low-level transaction operation
	 * Protected method - only available to table implementers, not end users
	 */
	protected transaction(
		queryObjects: QueryObject[] = [],
		predefinedSQLText?: string
	): {
		queryObjects: QueryObject[];
		execute: () => Promise<QueryArrayResult<any>[]>;
	} {
		return this.db.transaction(queryObjects, predefinedSQLText);
	}
}
