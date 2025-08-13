import {TableBase} from './table-base';
import {DatabaseOperations} from './database-operations';
import {TableDefinition, SchemaToData} from '../types/core-types';
import {createChainedInsert, ChainedInsertBuilder} from '../utils/chained-insert-builder';
import {QueryObject} from '../utils/query-utils';
import {QueryArrayResult} from 'pg';

/**
 * Extension methods for TableBase to support common CTE patterns
 *
 * This mixin provides helper methods that make it easier to work with
 * related table operations without having to manually create DatabaseOperations instances.
 */

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
 * Enhanced TableBase with CTE support
 *
 * Use this as a base class instead of TableBase to get built-in CTE functionality.
 *
 * @example
 * ```typescript
 * class PlacesTable extends EnhancedTableBase<PlacesSchema> {
 *   constructor() {
 *     super(placesTable);
 *
 *     // Register related tables
 *     this.registerRelatedTable('places_contacts', {tableDefinition: placesContactsTable});
 *     this.registerRelatedTable('places_contacts_billing', {tableDefinition: placesContactsBillingTable});
 *   }
 *
 *   public insertPlaceWithRelations(data: PlacesData, idContact: number, isBilling = false) {
 *     return this.createChainedInsert()
 *       .insert('place', this.db, data)
 *       .insertWithReference('place_contact', 'places_contacts', {idContact},
 *         {from: 'place', field: 'idPlace', to: 'idPlace'})
 *       .insertWithReferenceIf(isBilling, 'billing', 'places_contacts_billing', {},
 *         {from: 'place_contact', field: 'idPlaceContact', to: 'idPlaceContact'})
 *       .selectFrom('place')
 *       .build();
 *   }
 * }
 * ```
 */
export abstract class EnhancedTableBase<T extends Record<string, {type: any}>> extends TableBase<T> {
	private relatedTables: RelatedTablesRegistry;

	constructor(tableDefinition: TableDefinition<T>) {
		super(tableDefinition);
		this.relatedTables = new RelatedTablesRegistry();
	}

	/**
	 * Register a related table for use in chained operations
	 */
	protected registerRelatedTable<R extends Record<string, {type: any}>>(
		name: string,
		config: RelatedTableConfig<R>
	): void {
		this.relatedTables.register(name, config);
	}

	/**
	 * Get a registered related table
	 */
	protected getRelatedTable<R extends Record<string, {type: any}>>(name: string): DatabaseOperations<R> {
		return this.relatedTables.get(name);
	}

	/**
	 * Create a new chained insert builder with enhanced functionality
	 */
	protected createChainedInsert(): EnhancedChainedInsertBuilder {
		return new EnhancedChainedInsertBuilder(this.relatedTables);
	}

	/**
	 * Quick method for simple chained inserts
	 */
	protected chainedInsert(): EnhancedChainedInsertBuilder {
		return this.createChainedInsert();
	}
}

/**
 * Enhanced ChainedInsertBuilder that works with the RelatedTablesRegistry
 */
export class EnhancedChainedInsertBuilder extends ChainedInsertBuilder {
	constructor(private registry: RelatedTablesRegistry) {
		super();
	}

	// Override parent methods to return EnhancedChainedInsertBuilder type
	/**
	 * Add a base insert operation (typically the first in the chain)
	 * Overrides parent to return correct type
	 */
	public insert<T extends Record<string, {type: any}>>(
		cteName: string,
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		options?: {
			returnField?: keyof T | '*';
			onConflict?: boolean;
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		super.insert(cteName, table, data, options);
		return this;
	}

	/**
	 * Add an insert that references a field from a previous CTE
	 * Overrides parent to return correct type
	 */
	public insertWithReference<T extends Record<string, {type: any}>>(
		cteName: string,
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		reference: {from: string; field: string; to: keyof T},
		options?: {
			returnField?: keyof T | '*';
			onConflict?: boolean;
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		super.insertWithReference(cteName, table, data, reference, options);
		return this;
	}

	/**
	 * Conditionally add an insert with reference
	 * Overrides parent to return correct type
	 */
	public insertWithReferenceIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		reference: {from: string; field: string; to: keyof T},
		options?: {
			returnField?: keyof T | '*';
			onConflict?: boolean;
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		super.insertWithReferenceIf(condition, cteName, table, data, reference, options);
		return this;
	}

	/**
	 * Set which CTE to select from in the final result
	 * Overrides parent to return correct type
	 */
	public selectFrom(cteName: string, columns: string = '*'): EnhancedChainedInsertBuilder {
		super.selectFrom(cteName, columns);
		return this;
	}

	/**
	 * Add an update operation to the chain
	 * Overrides parent to return correct type
	 */
	public update<T extends Record<string, {type: any}>>(
		cteName: string,
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		super.update(cteName, table, data, where, options);
		return this;
	}

	/**
	 * Add an update that references a field from a previous CTE
	 * Overrides parent to return correct type
	 */
	public updateWithReference<T extends Record<string, {type: any}>>(
		cteName: string,
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		reference: {from: string; field: string; to: keyof T},
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		super.updateWithReference(cteName, table, data, where, reference, options);
		return this;
	}

	/**
	 * Conditionally add an update operation
	 * Overrides parent to return correct type
	 */
	public updateIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		super.updateIf(condition, cteName, table, data, where, options);
		return this;
	}

	/**
	 * Conditionally add an update with reference
	 * Overrides parent to return correct type
	 */
	public updateWithReferenceIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		reference: {from: string; field: string; to: keyof T},
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		super.updateWithReferenceIf(condition, cteName, table, data, where, reference, options);
		return this;
	}

	/**
	 * Insert using a registered related table name instead of DatabaseOperations instance
	 */
	public insertIntoTable<T extends Record<string, {type: any}>>(
		cteName: string,
		tableName: string,
		data: Partial<SchemaToData<T>>,
		options?: {
			returnField?: keyof T | '*';
			onConflict?: boolean;
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		const table = this.registry.get<T>(tableName);
		super.insert(cteName, table, data, options);
		return this;
	}

	/**
	 * Insert with reference using registered table name
	 */
	public insertIntoTableWithReference<T extends Record<string, {type: any}>>(
		cteName: string,
		tableName: string,
		data: Partial<SchemaToData<T>>,
		reference: {from: string; field: string; to: keyof T},
		options?: {
			returnField?: keyof T | '*';
			onConflict?: boolean;
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		const table = this.registry.get<T>(tableName);
		super.insertWithReference(cteName, table, data, reference, options);
		return this;
	}

	/**
	 * Conditional insert with reference using registered table name
	 */
	public insertIntoTableWithReferenceIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		tableName: string,
		data: Partial<SchemaToData<T>>,
		reference: {from: string; field: string; to: keyof T},
		options?: {
			returnField?: keyof T | '*';
			onConflict?: boolean;
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		if (condition) {
			return this.insertIntoTableWithReference(cteName, tableName, data, reference, options);
		}
		return this;
	}

	/**
	 * Update a table using a registered table name
	 */
	public updateTable<T extends Record<string, {type: any}>>(
		cteName: string,
		tableName: string,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		const table = this.registry.get<T>(tableName);
		super.update(cteName, table, data, where, options);
		return this;
	}

	/**
	 * Update a table with reference to a previous CTE using registered table name
	 */
	public updateTableWithReference<T extends Record<string, {type: any}>>(
		cteName: string,
		tableName: string,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		reference: {from: string; field: string; to: keyof T},
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		const table = this.registry.get<T>(tableName);
		super.updateWithReference(cteName, table, data, where, reference, options);
		return this;
	}

	/**
	 * Conditionally update a table using registered table name
	 */
	public updateTableIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		tableName: string,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): EnhancedChainedInsertBuilder {
		if (condition) {
			return this.updateTable(cteName, tableName, data, where, options);
		}
		return this;
	}
}

/**
 * Simple utility function for tables that don't want to extend EnhancedTableBase
 */
export function createRelatedTablesHelper(): RelatedTablesRegistry {
	return new RelatedTablesRegistry();
}

export default EnhancedTableBase;
