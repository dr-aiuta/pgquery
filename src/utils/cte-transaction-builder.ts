import {QueryObject} from './query-utils';
import {TableDefinition, SchemaToData, ColumnDefinition} from '../types/core-types';
import {DatabaseOperations} from '../core/database-operations';
import {QueryArrayResult} from 'pg';
import {executeTransactionQuery} from './query-executor';

/**
 * Represents a single CTE (Common Table Expression) in a transaction
 */
export interface CTEStep<T extends Record<string, {type: any}>> {
	name: string;
	operation: 'insert' | 'update' | 'select';
	table: DatabaseOperations<T>;
	queryObject: QueryObject;
	dependencies?: string[]; // Names of CTEs this step depends on
}

/**
 * Configuration for CTE insert operations
 */
export interface CTEInsertConfig<T extends Record<string, {type: any}>> {
	name: string;
	table: DatabaseOperations<T>;
	data: Partial<SchemaToData<T>>;
	options?: {
		returnField?: keyof T | '*';
		onConflict?: boolean;
		idUser?: string;
		dependsOn?: string[]; // CTEs this insert depends on
		useValueFrom?: {cteName: string; field: string; asField: keyof T}[]; // Use values from previous CTEs
	};
}

/**
 * CTE Transaction Builder for composing complex multi-table operations
 *
 * @example
 * ```typescript
 * const builder = new CTETransactionBuilder();
 *
 * const {queries, execute} = builder
 *   .insertCTE({
 *     name: 'inserted_place',
 *     table: placesDb,
 *     data: placeData,
 *     options: { returnField: '*' }
 *   })
 *   .insertCTE({
 *     name: 'inserted_place_contact',
 *     table: placesContactsDb,
 *     data: { idContact },
 *     options: {
 *       dependsOn: ['inserted_place'],
 *       useValueFrom: [{ cteName: 'inserted_place', field: 'idPlace', asField: 'idPlace' }]
 *     }
 *   })
 *   .conditionalInsertCTE({
 *     name: 'inserted_billing',
 *     condition: isBillingPlace,
 *     table: billingDb,
 *     data: {},
 *     options: {
 *       dependsOn: ['inserted_place_contact'],
 *       useValueFrom: [{ cteName: 'inserted_place_contact', field: 'idPlaceContact', asField: 'idPlaceContact' }]
 *     }
 *   })
 *   .finalSelect('inserted_place', '*')
 *   .build();
 * ```
 */
export class CTETransactionBuilder {
	private ctes: CTEStep<any>[] = [];
	private finalSelectCTE?: string;
	private finalSelectColumns?: string;

	/**
	 * Add an insert CTE to the transaction
	 */
	public insertCTE<T extends Record<string, {type: any}>>(config: CTEInsertConfig<T>): CTETransactionBuilder {
		const {name, table, data, options = {}} = config;
		const {returnField = '*', onConflict = false, idUser = 'SERVER', dependsOn = [], useValueFrom = []} = options;

		// Build the insert query using existing infrastructure
		const insertResult = table.insert({
			allowedColumns: '*',
			options: {
				data,
				returnField,
				onConflict,
				idUser,
			},
		});

		// Modify the SQL to work as a CTE
		let {sqlText, values} = insertResult.query;

		// Extract the INSERT portion and remove the final semicolon
		sqlText = sqlText.trim().replace(/;$/, '');

		// If this CTE depends on values from other CTEs, modify the INSERT
		if (useValueFrom.length > 0) {
			sqlText = this.injectCTEReferences(sqlText, values, useValueFrom);
		}

		this.ctes.push({
			name,
			operation: 'insert',
			table,
			queryObject: {sqlText, values},
			dependencies: dependsOn,
		});

		return this;
	}

	/**
	 * Add a conditional insert CTE (only executes if condition is true)
	 */
	public conditionalInsertCTE<T extends Record<string, {type: any}>>(
		config: CTEInsertConfig<T> & {condition: boolean}
	): CTETransactionBuilder {
		if (config.condition) {
			return this.insertCTE(config);
		}
		return this;
	}

	/**
	 * Set which CTE should be used for the final SELECT
	 */
	public finalSelect(cteName: string, columns: string = '*'): CTETransactionBuilder {
		this.finalSelectCTE = cteName;
		this.finalSelectColumns = columns;
		return this;
	}

	/**
	 * Build the final CTE transaction
	 */
	public build(): {
		queries: QueryObject[];
		execute: () => Promise<QueryArrayResult<any>[]>;
	} {
		if (this.ctes.length === 0) {
			throw new Error('No CTEs defined in transaction');
		}

		const combinedQuery = this.buildCombinedSQL();

		return {
			queries: [combinedQuery],
			execute: async (): Promise<QueryArrayResult<any>[]> => {
				return executeTransactionQuery([combinedQuery]);
			},
		};
	}

	/**
	 * Inject references to previous CTEs into the current INSERT statement
	 */
	private injectCTEReferences(
		sqlText: string,
		values: any[],
		useValueFrom: {cteName: string; field: string; asField: keyof any}[]
	): string {
		// This is a simplified implementation
		// In a real implementation, you'd need more sophisticated SQL parsing
		// to properly inject CTE references into the VALUES clause

		for (const ref of useValueFrom) {
			// Replace placeholder values with CTE references
			// This would need more sophisticated logic to handle different scenarios
			const cteReference = `(SELECT "${ref.field}" FROM ${ref.cteName})`;
			// Here you would modify the SQL to use the CTE reference instead of a parameter
			// This is a simplified example - actual implementation would be more complex
		}

		return sqlText;
	}

	/**
	 * Build the complete SQL with all CTEs
	 */
	private buildCombinedSQL(): QueryObject {
		let sql = 'WITH ';
		const allValues: any[] = [];
		let valueOffset = 0;

		// Build each CTE
		this.ctes.forEach((cte, index) => {
			if (index > 0) sql += ',\n';

			sql += `${cte.name} AS (\n`;

			// Adjust parameter placeholders to avoid conflicts
			let cteSql = cte.queryObject.sqlText;
			if (valueOffset > 0) {
				cteSql = cteSql.replace(/\$(\d+)/g, (match, num) => {
					const newNum = parseInt(num, 10) + valueOffset;
					return `$${newNum}`;
				});
			}

			sql += `  ${cteSql}\n`;
			sql += ')';

			// Add values to the combined array
			allValues.push(...cte.queryObject.values);
			valueOffset += cte.queryObject.values.length;
		});

		// Add final SELECT
		if (this.finalSelectCTE) {
			sql += `\nSELECT ${this.finalSelectColumns} FROM ${this.finalSelectCTE};`;
		} else {
			// Default to selecting from the first CTE
			sql += `\nSELECT * FROM ${this.ctes[0].name};`;
		}

		return {
			sqlText: sql,
			values: allValues,
		};
	}
}

/**
 * Factory function to create a new CTE transaction builder
 */
export function createCTETransaction(): CTETransactionBuilder {
	return new CTETransactionBuilder();
}
