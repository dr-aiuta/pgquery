import {TableDefinition} from '../types/core-types';
import {ColumnDefinition, SchemaToData, ColumnTypeMapping, QueryParams} from '../types/core-types';
import {QueryArrayResult, QueryResultRow} from 'pg';
import {
	QueryObject,
	QueryResult,
	TransactionResult,
	BaseOptions,
	InsertOptions,
	SelectOptions,
	UpdateOptions,
	CustomBaseOptions,
	CustomSelectOptions,
} from '../utils/query-utils';
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
	 * Access to low-level insert operation with new standardized interface
	 * Protected method - only available to table implementers, not end users
	 */
	protected insert(input: BaseOptions<T> & {options: InsertOptions<T>}): QueryResult<Partial<SchemaToData<T>>[]> {
		return this.db.insert(input);
	}

	/**
	 * Access to low-level select operation with new standardized interface
	 * Protected method - only available to table implementers, not end users
	 */
	protected select<U extends QueryResultRow = SchemaToData<T>>(
		input: BaseOptions<T> & {options?: SelectOptions<T>} = {}
	): QueryResult<Partial<U>[]> {
		return this.db.select(input);
	}

	/**
	 * Access to custom select operation for predefined SQL with custom schema types
	 * Allows filtering and column selection based on joined result schema
	 * Protected method - only available to table implementers, not end users
	 */
	protected selectWithCustomSchema<U extends QueryResultRow, CustomSchema extends Record<string, any>>(
		input: CustomBaseOptions<CustomSchema> & {options?: CustomSelectOptions<CustomSchema>}
	): QueryResult<Partial<U>[]> {
		return this.db.selectWithCustomSchema(input);
	}

	/**
	 * Access to low-level update operation with new standardized interface
	 * Protected method - only available to table implementers, not end users
	 */
	protected update(input: BaseOptions<T> & {options: UpdateOptions<T>}): QueryResult<Partial<SchemaToData<T>>[]> {
		return this.db.update(input);
	}

	/**
	 * Access to low-level transaction operation with new standardized interface
	 * Protected method - only available to table implementers, not end users
	 */
	protected transaction(): TransactionResult<QueryArrayResult<any>[]> {
		return this.db.transaction();
	}
}
