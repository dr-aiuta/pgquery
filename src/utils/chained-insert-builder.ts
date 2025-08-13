import {QueryObject} from './query-utils';
import {SchemaToData} from '../types/core-types';
import {DatabaseOperations} from '../core/database-operations';
import {QueryArrayResult} from 'pg';
import {executeTransactionQuery} from './query-executor';

/**
 * Simplified builder for chained inserts with CTE support
 *
 * This addresses the specific use case of inserting into multiple related tables
 * where each subsequent insert depends on the previous one's generated ID.
 *
 * @example
 * ```typescript
 * const result = new ChainedInsertBuilder()
 *   .insert('inserted_place', placesDb, placeData, {returnField: '*'})
 *   .insertWithReference('inserted_place_contact', placesContactsDb,
 *     {idContact},
 *     {from: 'inserted_place', field: 'idPlace', to: 'idPlace'}
 *   )
 *   .insertWithReferenceIf(isBillingPlace, 'inserted_billing', billingDb,
 *     {},
 *     {from: 'inserted_place_contact', field: 'idPlaceContact', to: 'idPlaceContact'}
 *   )
 *   .selectFrom('inserted_place')
 *   .build();
 * ```
 */
export class ChainedInsertBuilder {
	private insertSteps: InsertStep[] = [];
	private updateSteps: UpdateStep[] = [];
	private finalSelectStep?: {cteName: string; columns: string};

	/**
	 * Add a base insert operation (typically the first in the chain)
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
	): ChainedInsertBuilder {
		const insertQuery = table.insert({
			allowedColumns: '*',
			options: {
				data,
				returnField: options?.returnField || '*',
				onConflict: options?.onConflict || false,
				idUser: options?.idUser || 'SERVER',
			},
		});

		this.insertSteps.push({
			cteName,
			query: insertQuery.query,
			reference: null,
		});

		return this;
	}

	/**
	 * Add an insert that references a field from a previous CTE
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
	): ChainedInsertBuilder {
		// Create the insert query without the referenced field
		const dataWithoutRef = {...data};
		delete dataWithoutRef[reference.to];

		const insertQuery = table.insert({
			allowedColumns: '*',
			options: {
				data: dataWithoutRef,
				returnField: options?.returnField || '*',
				onConflict: options?.onConflict || false,
				idUser: options?.idUser || 'SERVER',
			},
		});

		this.insertSteps.push({
			cteName,
			query: insertQuery.query,
			reference: reference
				? {
						from: reference.from,
						field: reference.field,
						to: reference.to as string,
				  }
				: null,
		});

		return this;
	}

	/**
	 * Conditionally add an insert with reference
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
	): ChainedInsertBuilder {
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
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): ChainedInsertBuilder {
		const updateQuery = table.update({
			allowedColumns: '*',
			options: {
				data,
				where,
				returnField: options?.returnField || '*',
				idUser: options?.idUser || 'SERVER',
			},
		});

		this.updateSteps.push({
			cteName,
			query: updateQuery.query,
			reference: null,
		});

		return this;
	}

	/**
	 * Add an update that references a field from a previous CTE
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
	): ChainedInsertBuilder {
		// Create the update query with the referenced field
		const dataWithRef = {
			...data,
			// The reference will be injected later
		};

		const updateQuery = table.update({
			allowedColumns: '*',
			options: {
				data: dataWithRef,
				where,
				returnField: options?.returnField || '*',
				idUser: options?.idUser || 'SERVER',
			},
		});

		this.updateSteps.push({
			cteName,
			query: updateQuery.query,
			reference: reference
				? {
						from: reference.from,
						field: reference.field,
						to: reference.to as string,
				  }
				: null,
		});

		return this;
	}

	/**
	 * Conditionally add an update operation
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
	): ChainedInsertBuilder {
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
		table: DatabaseOperations<T>,
		data: Partial<SchemaToData<T>>,
		where: Partial<SchemaToData<T>>,
		reference: {from: string; field: string; to: keyof T},
		options?: {
			returnField?: keyof T | '*';
			idUser?: string;
		}
	): ChainedInsertBuilder {
		if (condition) {
			return this.updateWithReference(cteName, table, data, where, reference, options);
		}
		return this;
	}

	/**
	 * Set which CTE to select from in the final result
	 */
	public selectFrom(cteName: string, columns: string = '*'): ChainedInsertBuilder {
		this.finalSelectStep = {cteName, columns};
		return this;
	}

	/**
	 * Build the final query with CTE structure
	 */
	public build(): {
		queries: QueryObject[];
		execute: () => Promise<QueryArrayResult<any>[]>;
	} {
		if (this.insertSteps.length === 0 && this.updateSteps.length === 0) {
			throw new Error('No insert or update steps defined');
		}

		const combinedQuery = this.buildCTEQuery();

		return {
			queries: [combinedQuery],
			execute: async (): Promise<QueryArrayResult<any>[]> => {
				return executeTransactionQuery([combinedQuery]);
			},
		};
	}

	/**
	 * Build the complete CTE query
	 */
	private buildCTEQuery(): QueryObject {
		const cteDefinitions: string[] = [];
		const allValues: any[] = [];
		let parameterOffset = 0;

		// Process each insert step
		for (const step of this.insertSteps) {
			const processedStep = this.processInsertStep(step, parameterOffset);
			cteDefinitions.push(`${step.cteName} AS (\n  ${processedStep.sql}\n)`);
			allValues.push(...processedStep.values);
			parameterOffset += processedStep.values.length;
		}

		// Process each update step
		for (const step of this.updateSteps) {
			const processedStep = this.processUpdateStep(step, parameterOffset);
			cteDefinitions.push(`${step.cteName} AS (\n  ${processedStep.sql}\n)`);
			allValues.push(...processedStep.values);
			parameterOffset += processedStep.values.length;
		}

		// Build the final SQL
		let sql = `WITH ${cteDefinitions.join(',\n')}`;

		// Add final SELECT
		const defaultCteName = this.insertSteps.length > 0 ? this.insertSteps[0].cteName : this.updateSteps[0].cteName;
		const selectStep = this.finalSelectStep || {cteName: defaultCteName, columns: '*'};
		sql += `\nSELECT ${selectStep.columns} FROM ${selectStep.cteName};`;

		return {
			sqlText: sql,
			values: allValues,
		};
	}

	/**
	 * Process a single insert step, handling parameter offsets and references
	 */
	private processInsertStep(step: InsertStep, offset: number): {sql: string; values: any[]} {
		let {sqlText, values} = step.query;

		// Remove trailing semicolon
		sqlText = sqlText.trim().replace(/;$/, '');

		// Adjust parameter numbers for offset
		if (offset > 0) {
			sqlText = sqlText.replace(/\$(\d+)/g, (match, num) => {
				const newNum = parseInt(num, 10) + offset;
				return `$${newNum}`;
			});
		}

		// Handle reference injection
		if (step.reference) {
			const {modifiedSQL, newValues} = this.injectReference(sqlText, values, step.reference);
			sqlText = modifiedSQL;
			values = newValues;
		}

		return {sql: sqlText, values};
	}

	/**
	 * Process a single update step, handling parameter offsets and references
	 */
	private processUpdateStep(step: UpdateStep, offset: number): {sql: string; values: any[]} {
		let {sqlText, values} = step.query;

		// Remove trailing semicolon
		sqlText = sqlText.trim().replace(/;$/, '');

		// Adjust parameter numbers for offset
		if (offset > 0) {
			sqlText = sqlText.replace(/\$(\d+)/g, (match, num) => {
				const newNum = parseInt(num, 10) + offset;
				return `$${newNum}`;
			});
		}

		// Handle reference injection for updates
		if (step.reference) {
			const {modifiedSQL, newValues} = this.injectUpdateReference(sqlText, values, step.reference);
			sqlText = modifiedSQL;
			values = newValues;
		}

		return {sql: sqlText, values};
	}

	/**
	 * Inject a CTE reference into the UPDATE statement
	 */
	private injectUpdateReference(
		sql: string,
		values: any[],
		reference: {from: string; field: string; to: string}
	): {modifiedSQL: string; newValues: any[]} {
		// Parse the UPDATE statement to add the referenced field
		const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE/i);

		if (!updateMatch) {
			throw new Error('Unable to parse UPDATE statement for reference injection');
		}

		const [fullMatch, tableName, setPart] = updateMatch;

		// Add the referenced column to the SET clause
		const cteReference = `(SELECT "${reference.field}" FROM ${reference.from})`;
		const newSetPart = `${setPart}, "${reference.to}" = ${cteReference}`;

		// Reconstruct the UPDATE with WHERE and RETURNING clauses
		const remainingSQL = sql.substring(fullMatch.length);
		const modifiedSQL = `UPDATE ${tableName} SET ${newSetPart} WHERE${remainingSQL}`;

		return {
			modifiedSQL,
			newValues: values, // Values array stays the same since we're using a subquery
		};
	}

	/**
	 * Inject a CTE reference into the INSERT statement
	 */
	private injectReference(
		sql: string,
		values: any[],
		reference: {from: string; field: string; to: string}
	): {modifiedSQL: string; newValues: any[]} {
		// Parse the INSERT statement to add the referenced field
		const insertMatch = sql.match(/INSERT INTO (\w+) \(([^)]+)\)\s*VALUES \(([^)]+)\)/i);

		if (!insertMatch) {
			throw new Error('Unable to parse INSERT statement for reference injection');
		}

		const [, tableName, columnsPart, valuesPart] = insertMatch;

		// Add the referenced column
		const columns = columnsPart + `, "${reference.to}"`;

		// Add the CTE reference to values
		const cteReference = `(SELECT "${reference.field}" FROM ${reference.from})`;
		const newValues = valuesPart + `, ${cteReference}`;

		// Reconstruct the INSERT with RETURNING clause
		const returningMatch = sql.match(/RETURNING (.+)$/i);
		const returningClause = returningMatch ? ` RETURNING ${returningMatch[1]}` : '';

		const modifiedSQL = `INSERT INTO ${tableName} (${columns}) VALUES (${newValues})${returningClause}`;

		return {
			modifiedSQL,
			newValues: values, // Values array stays the same since we're using a subquery
		};
	}
}

/**
 * Represents a single insert step in the chain
 */
interface InsertStep {
	cteName: string;
	query: QueryObject;
	reference: {from: string; field: string; to: string} | null;
}

/**
 * Represents a single update step in the chain
 */
interface UpdateStep {
	cteName: string;
	query: QueryObject;
	reference: {from: string; field: string; to: string} | null;
}

/**
 * Factory function to create a new chained insert builder
 */
export function createChainedInsert(): ChainedInsertBuilder {
	return new ChainedInsertBuilder();
}
