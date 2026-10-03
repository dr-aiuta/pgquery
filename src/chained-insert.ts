import PostgresConnection from './connection';
import {QueryObject, AllowedColumns, OnConflict, WriteData} from './types';
import {SchemaToData} from './types';
import {DatabaseOperations, operationsOf} from './database-operations';
import type {TableBase} from './table-base';
import {QueryArrayResult} from 'pg';
import {QueryInputError} from './sql/identifiers';
import {sqlExpression} from './sql/expression';
import {ident, plainName} from './sql/identifiers';
import {renumber} from './sql/placeholders';

/**
 * Options of an insert step. allowedColumns is required: every write names its columns.
 * Keys of the step's data outside allowedColumns are dropped.
 */
export interface InsertStepOptions<T> {
	allowedColumns: AllowedColumns<T>;
	returnField?: keyof T | (keyof T)[] | '*';
	onConflict?: OnConflict<T>;
	idUser?: string;
}

/** Options of an update step. allowedColumns is required: every write names its columns. */
export interface UpdateStepOptions<T> {
	allowedColumns: AllowedColumns<T>;
	returnField?: keyof T | (keyof T)[] | '*';
	idUser?: string;
}

/** A value an earlier step returned: the field of that step, written into a column of this one. */
export interface StepReference<T> {
	/** The name of the earlier step */
	from: string;
	/** The field of the earlier step to read */
	field: string;
	/** The column of this step's table to write */
	to: keyof T;
}

/** The table of a step: a table class instance, or the operations object of one. */
export type StepTable<T extends Record<string, {type: any}>> = DatabaseOperations<T> | TableBase<T>;

/** Looks up a table by the name it was registered under. A table class supplies one to its chains. */
export interface TableRegistry {
	get<T extends Record<string, {type: any}>>(name: string): DatabaseOperations<T>;
}

/**
 * Simplified builder for chained inserts with CTE support
 *
 * This addresses the specific use case of inserting into multiple related tables
 * where each subsequent insert depends on the previous one's generated ID.
 *
 * Steps run in the order they are called. A step takes a table class instance, or, when the
 * builder comes from a table class, the name of a registered table.
 *
 * @example
 * ```typescript
 * const result = new ChainedInsertBuilder()
 *   .insert('inserted_place', placesTable, placeData, {allowedColumns: ['name', 'street'], returnField: '*'})
 *   .insertWithReference('inserted_place_contact', placesContactsTable,
 *     {idContact},
 *     {from: 'inserted_place', field: 'idPlace', to: 'idPlace'},
 *     {allowedColumns: ['idContact']}
 *   )
 *   .insertWithReferenceIf(isBillingPlace, 'inserted_billing', billingTable,
 *     {},
 *     {from: 'inserted_place_contact', field: 'idPlaceContact', to: 'idPlaceContact'},
 *     {allowedColumns: []}
 *   )
 *   .selectFrom('inserted_place')
 *   .build();
 * ```
 */
export class ChainedInsertBuilder {
	private steps: ChainStep[] = [];
	private finalSelectStep?: {cteName: string; columns: string};

	/**
	 * @param registry - The registered tables of a table class. Without it, the name-based methods throw.
	 */
	constructor(private registry?: TableRegistry) {}

	/**
	 * Add a base insert operation (typically the first in the chain)
	 */
	public insert<T extends Record<string, {type: any}>>(
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		options: InsertStepOptions<T>
	): this {
		return this.addInsert(cteName, table, data, null, options);
	}

	/**
	 * Add an insert that references a field from a previous CTE
	 */
	public insertWithReference<T extends Record<string, {type: any}>>(
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		reference: StepReference<T>,
		options: InsertStepOptions<T>
	): this {
		return this.addInsert(cteName, table, data, reference, options);
	}

	/**
	 * Conditionally add an insert with reference
	 */
	public insertWithReferenceIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		reference: StepReference<T>,
		options: InsertStepOptions<T>
	): this {
		if (condition) {
			return this.insertWithReference(cteName, table, data, reference, options);
		}
		return this;
	}

	/**
	 * Add an update operation to the chain
	 */
	public update<T extends Record<string, {type: any}>>(
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		where: Partial<SchemaToData<T>>,
		options: UpdateStepOptions<T>
	): this {
		return this.addUpdate(cteName, table, data, where, null, options);
	}

	/**
	 * Add an update that references a field from a previous CTE
	 */
	public updateWithReference<T extends Record<string, {type: any}>>(
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		where: Partial<SchemaToData<T>>,
		reference: StepReference<T>,
		options: UpdateStepOptions<T>
	): this {
		return this.addUpdate(cteName, table, data, where, reference, options);
	}

	/**
	 * Conditionally add an update operation
	 */
	public updateIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		where: Partial<SchemaToData<T>>,
		options: UpdateStepOptions<T>
	): this {
		if (condition) {
			return this.update(cteName, table, data, where, options);
		}
		return this;
	}

	/**
	 * Conditionally add an update with reference
	 */
	public updateWithReferenceIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		where: Partial<SchemaToData<T>>,
		reference: StepReference<T>,
		options: UpdateStepOptions<T>
	): this {
		if (condition) {
			return this.updateWithReference(cteName, table, data, where, reference, options);
		}
		return this;
	}

	/**
	 * Insert using a registered related table name instead of a table object
	 */
	public insertIntoTable<T extends Record<string, {type: any}>>(
		cteName: string,
		tableName: string,
		data: WriteData<T>,
		options: InsertStepOptions<T>
	): this {
		return this.insert(cteName, this.registered<T>(tableName), data, options);
	}

	/**
	 * Insert with reference using registered table name
	 */
	public insertIntoTableWithReference<T extends Record<string, {type: any}>>(
		cteName: string,
		tableName: string,
		data: WriteData<T>,
		reference: StepReference<T>,
		options: InsertStepOptions<T>
	): this {
		return this.insertWithReference(cteName, this.registered<T>(tableName), data, reference, options);
	}

	/**
	 * Conditional insert with reference using registered table name
	 */
	public insertIntoTableWithReferenceIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		tableName: string,
		data: WriteData<T>,
		reference: StepReference<T>,
		options: InsertStepOptions<T>
	): this {
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
		data: WriteData<T>,
		where: Partial<SchemaToData<T>>,
		options: UpdateStepOptions<T>
	): this {
		return this.update(cteName, this.registered<T>(tableName), data, where, options);
	}

	/**
	 * Update a table with reference to a previous CTE using registered table name
	 */
	public updateTableWithReference<T extends Record<string, {type: any}>>(
		cteName: string,
		tableName: string,
		data: WriteData<T>,
		where: Partial<SchemaToData<T>>,
		reference: StepReference<T>,
		options: UpdateStepOptions<T>
	): this {
		return this.updateWithReference(cteName, this.registered<T>(tableName), data, where, reference, options);
	}

	/**
	 * Conditionally update a table using registered table name
	 */
	public updateTableIf<T extends Record<string, {type: any}>>(
		condition: boolean,
		cteName: string,
		tableName: string,
		data: WriteData<T>,
		where: Partial<SchemaToData<T>>,
		options: UpdateStepOptions<T>
	): this {
		if (condition) {
			return this.updateTable(cteName, tableName, data, where, options);
		}
		return this;
	}

	/**
	 * Set which CTE to select from in the final result
	 *
	 * @param columns - '*', one column name, or an array of column names. An expression is not accepted.
	 */
	public selectFrom(cteName: string, columns: string | string[] = '*'): this {
		const names = Array.isArray(columns) ? columns : [columns];
		const columnList =
			columns === '*' ? '*' : names.map((column) => ident(column, 'selectFrom column')).join(', ');
		if (columnList === '') {
			throw new QueryInputError(`Invalid selectFrom columns. Expected '*', a column name or an array of column names.`);
		}
		this.finalSelectStep = {cteName: plainName(cteName, 'step name'), columns: columnList};
		return this;
	}

	/**
	 * Build the final query with CTE structure
	 */
	public build(): {
		queries: QueryObject[];
		execute: () => Promise<QueryArrayResult<any>[]>;
	} {
		if (this.steps.length === 0) {
			throw new Error('No insert or update steps defined');
		}

		const combinedQuery = this.buildCTEQuery();

		return {
			queries: [combinedQuery],
			execute: async (): Promise<QueryArrayResult<any>[]> => {
				// One client runs BEGIN, the statement and COMMIT.
				const results = await PostgresConnection.transaction([combinedQuery]);
				return results as unknown as QueryArrayResult<any>[];
			},
		};
	}

	/** The registered table behind a name. Only a builder that came from a table class has a registry. */
	private registered<T extends Record<string, {type: any}>>(tableName: string): DatabaseOperations<T> {
		if (!this.registry) {
			throw new QueryInputError(
				`Cannot look up the table '${tableName}': this chain has no registered tables. ` +
					'Create the chain with createChainedInsert() of a table class, or pass a table object.'
			);
		}
		return this.registry.get<T>(tableName);
	}

	/**
	 * The reference as ordinary data: the column gets a subquery on the earlier step.
	 * The column is always written, so it is added to the allowed columns of the step.
	 */
	private withReference<T extends Record<string, {type: any}>>(
		table: DatabaseOperations<T>,
		data: WriteData<T>,
		reference: StepReference<T> | null,
		allowedColumns: AllowedColumns<T>
	): {data: WriteData<T>; allowedColumns: AllowedColumns<T>} {
		if (!reference) {
			return {data, allowedColumns};
		}
		const to = reference.to as string;
		if (typeof to !== 'string' || !Object.prototype.hasOwnProperty.call(table.schema.columns, to)) {
			throw new QueryInputError(`Invalid reference: ${String(to)} is not a column of ${table.tableName}.`);
		}
		const value = sqlExpression(
			`(SELECT ${ident(reference.field, 'reference field')} FROM ${plainName(reference.from, 'step name')})`
		);
		// The referenced value replaces whatever the data held for that column.
		const rest: Record<string, unknown> = {...data};
		delete rest[to];
		const columns =
			Array.isArray(allowedColumns) && !allowedColumns.includes(reference.to)
				? [...allowedColumns, reference.to]
				: allowedColumns;
		return {data: {...rest, [to]: value} as WriteData<T>, allowedColumns: columns};
	}

	private addInsert<T extends Record<string, {type: any}>>(
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		reference: StepReference<T> | null,
		options: InsertStepOptions<T>
	): this {
		const name = plainName(cteName, 'step name');
		const operations = operationsOf<T>(table);
		const step = this.withReference(operations, data, reference, options?.allowedColumns);

		const insertQuery = operations.insert(
			{
				allowedColumns: step.allowedColumns,
				options: {
					data: step.data,
					returnField: options?.returnField || '*',
					onConflict: options?.onConflict || false,
					idUser: options?.idUser || 'SERVER',
				},
			},
			// A referenced step has always been written on one line. Its SQL text is kept.
			{compact: reference !== null}
		);

		this.steps.push({cteName: name, kind: 'insert', query: insertQuery.query});
		return this;
	}

	private addUpdate<T extends Record<string, {type: any}>>(
		cteName: string,
		table: StepTable<T>,
		data: WriteData<T>,
		where: Partial<SchemaToData<T>>,
		reference: StepReference<T> | null,
		options: UpdateStepOptions<T>
	): this {
		const name = plainName(cteName, 'step name');
		const operations = operationsOf<T>(table);
		const step = this.withReference(operations, data, reference, options?.allowedColumns);

		const updateQuery = operations.update(
			{
				allowedColumns: step.allowedColumns,
				options: {
					data: step.data,
					where,
					returnField: options?.returnField || '*',
					idUser: options?.idUser || 'SERVER',
				},
			},
			{compact: reference !== null}
		);

		this.steps.push({cteName: name, kind: 'update', query: updateQuery.query});
		return this;
	}

	/**
	 * Build the complete CTE query. Steps are written in the order they were called.
	 */
	private buildCTEQuery(): QueryObject {
		const cteDefinitions: string[] = [];
		const allValues: any[] = [];

		for (const step of this.steps) {
			// Each step was built on its own, with placeholders from $1. They continue across the chain.
			const sql = renumber(step.query.sqlText.trim().replace(/;$/, ''), allValues.length);
			cteDefinitions.push(`${step.cteName} AS (\n  ${sql}\n)`);
			allValues.push(...step.query.values);
		}

		// Without selectFrom, the final SELECT reads the first insert, or the first step when there is none.
		const defaultStep = this.steps.find((step) => step.kind === 'insert') ?? this.steps[0];
		const selectStep = this.finalSelectStep || {cteName: defaultStep.cteName, columns: '*'};

		return {
			sqlText: `WITH ${cteDefinitions.join(',\n')}\nSELECT ${selectStep.columns} FROM ${selectStep.cteName};`,
			values: allValues,
		};
	}
}

/**
 * One step of the chain: an insert or an update, already built for its table
 */
interface ChainStep {
	cteName: string;
	kind: 'insert' | 'update';
	query: QueryObject;
}

/**
 * Factory function to create a new chained insert builder
 */
export function createChainedInsert(): ChainedInsertBuilder {
	return new ChainedInsertBuilder();
}
