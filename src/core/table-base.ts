import {TableDefinition} from '../types/core-types';
import {ColumnDefinition, SchemaToData, ColumnTypeMapping} from '../types/core-types';
import {QueryArrayResult, QueryResultRow} from 'pg';
import {
	QueryResult,
	TransactionResult,
	BaseOptions,
	UpdateBaseOptions,
	InsertOptions,
	SelectOptions,
	UpdateOptions,
	CustomBaseOptions,
	CustomSelectOptions,
} from '../utils/query-utils';
import {DatabaseOperations, registerTableOperations} from './database-operations';
import {ChainedInsertBuilder} from '../utils/chained-insert-builder';

/**
 * Configuration for related table operations
 */
export interface RelatedTableConfig<T extends Record<string, {type: any}>> {
	tableDefinition: TableDefinition<T>;
	db?: DatabaseOperations<T>; // Optional pre-created instance
}

/**
 * Registry for related tables that can be used in chained operations
 */
export class RelatedTablesRegistry {
	private tables = new Map<string, DatabaseOperations<any>>();

	public register<T extends Record<string, {type: any}>>(name: string, config: RelatedTableConfig<T>): void {
		if (config.db) {
			this.tables.set(name, config.db);
		} else {
			this.tables.set(name, new DatabaseOperations(config.tableDefinition));
		}
	}

	public get<T extends Record<string, {type: any}>>(name: string): DatabaseOperations<T> {
		const table = this.tables.get(name);
		if (!table) {
			throw new Error(`Related table '${name}' is not registered. Call registerRelatedTable() first.`);
		}
		return table;
	}

	public has(name: string): boolean {
		return this.tables.has(name);
	}
}

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
 *   public async insertUser(userData: UserData): Promise<User[]> {
 *     return this.insert({allowedColumns: ['name', 'email'], options: {data: userData}}).execute();
 *   }
 *
 *   public async selectUsers(filter?: UserFilter): Promise<User[]> {
 *     return this.select({allowedColumns: ['id', 'name'], options: {where: filter}}).execute();
 *   }
 * }
 *
 * const usersTable = new UsersTable();
 * usersTable.insertUser({name: 'John'}); // ✅ Available - intended public API
 * usersTable.insert(...);               // ❌ Not available - good!
 * ```
 *
 * A table class can also run chained inserts. Register the other tables once, then name them in a chain:
 *
 * @example
 * ```typescript
 * class PlacesTable extends TableBase<PlacesSchema> {
 *   constructor() {
 *     super(placesTable);
 *     this.registerRelatedTable('places_contacts', {tableDefinition: placesContactsTable});
 *   }
 *
 *   public insertPlaceWithContact(data: PlacesData, idContact: number) {
 *     return this.createChainedInsert()
 *       .insert('place', this, data, {allowedColumns: ['name', 'street']})
 *       .insertIntoTableWithReference('place_contact', 'places_contacts', {idContact},
 *         {from: 'place', field: 'idPlace', to: 'idPlace'}, {allowedColumns: ['idContact']})
 *       .selectFrom('place')
 *       .build();
 *   }
 * }
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

	/** The tables registered for chained operations. Created on first use. */
	private relatedTables?: RelatedTablesRegistry;

	constructor(tableDefinition: TableDefinition<T>) {
		this.db = new DatabaseOperations(tableDefinition);
		this.tableName = this.db.tableName;
		this.schema = this.db.schema;
		// Lets a chained insert take this table class, without making db public.
		registerTableOperations(this, this.db);
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
		input: BaseOptions<T> & {options?: SelectOptions<T>}
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
	protected update(input: UpdateBaseOptions<T> & {options: UpdateOptions<T>}): QueryResult<Partial<SchemaToData<T>>[]> {
		return this.db.update(input);
	}

	/**
	 * Access to low-level transaction operation with new standardized interface
	 * Protected method - only available to table implementers, not end users
	 */
	protected transaction(): TransactionResult<QueryArrayResult<any>[]> {
		return this.db.transaction();
	}

	private relatedTablesRegistry(): RelatedTablesRegistry {
		if (!this.relatedTables) {
			this.relatedTables = new RelatedTablesRegistry();
		}
		return this.relatedTables;
	}

	/**
	 * Register a related table for use in chained operations
	 */
	protected registerRelatedTable<R extends Record<string, {type: any}>>(
		name: string,
		config: RelatedTableConfig<R>
	): void {
		this.relatedTablesRegistry().register(name, config);
	}

	/**
	 * Get a registered related table
	 */
	protected getRelatedTable<R extends Record<string, {type: any}>>(name: string): DatabaseOperations<R> {
		return this.relatedTablesRegistry().get(name);
	}

	/**
	 * Create a new chained insert builder that knows this table's registered tables
	 */
	protected createChainedInsert(): ChainedInsertBuilder {
		return new ChainedInsertBuilder(this.relatedTablesRegistry());
	}

	/**
	 * Quick method for simple chained inserts
	 */
	protected chainedInsert(): ChainedInsertBuilder {
		return this.createChainedInsert();
	}
}

/**
 * Simple utility function for tables that don't want to extend TableBase
 */
export function createRelatedTablesHelper(): RelatedTablesRegistry {
	return new RelatedTablesRegistry();
}
