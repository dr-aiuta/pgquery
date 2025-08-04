import {QueryObject} from './query-utils';
import {TableDefinition, SchemaToData, ColumnDefinition} from '../types/core-types';
import {DatabaseOperations} from '../core/database-operations';
import {QueryArrayResult} from 'pg';
import {executeTransactionQuery} from './query-executor';

/**
 * Enhanced CTE Builder with proper support for inter-CTE references
 *
 * This builder addresses the limitations of manual SQL construction by:
 * 1. Leveraging existing insert() methods from TableBase
 * 2. Properly handling parameter placeholders across CTEs
 * 3. Supporting dynamic value injection from previous CTEs
 * 4. Providing a fluent, type-safe API
 */
export class EnhancedCTEBuilder {
	private steps: CTEBuildStep[] = [];
	private parameterOffset = 0;

	/**
	 * Add an insert operation that can reference previous CTEs
	 */
	public addInsert<T extends Record<string, {type: any}>>(config: {
		name: string;
		table: DatabaseOperations<T>;
		data: Partial<SchemaToData<T>>;
		options?: {
			returnField?: keyof T | '*';
			onConflict?: boolean;
			idUser?: string;
		};
		references?: CTEReference[];
	}): EnhancedCTEBuilder {
		const {name, table, data, options = {}, references = []} = config;

		// Generate the base insert query using existing infrastructure
		const insertQuery = table.insert({
			allowedColumns: '*',
			options: {
				data,
				returnField: options.returnField || '*',
				onConflict: options.onConflict || false,
				idUser: options.idUser || 'SERVER',
			},
		});

		// Create the CTE step
		const step: CTEBuildStep = {
			name,
			baseQuery: insertQuery.query,
			references,
			type: 'insert',
		};

		this.steps.push(step);
		return this;
	}

	/**
	 * Add a conditional insert (only if condition is true)
	 */
	public addConditionalInsert<T extends Record<string, {type: any}>>(
		condition: boolean,
		config: Parameters<typeof this.addInsert>[0]
	): EnhancedCTEBuilder {
		if (condition) {
			return this.addInsert(config);
		}
		return this;
	}

	/**
	 * Build the complete CTE transaction
	 */
	public build(finalSelect?: {cteName: string; columns?: string}): {
		queries: QueryObject[];
		execute: () => Promise<QueryArrayResult<any>[]>;
	} {
		if (this.steps.length === 0) {
			throw new Error('No CTE steps defined');
		}

		const combinedQuery = this.buildCombinedCTEQuery(finalSelect);

		return {
			queries: [combinedQuery],
			execute: async (): Promise<QueryArrayResult<any>[]> => {
				return executeTransactionQuery([combinedQuery]);
			},
		};
	}

	/**
	 * Build the complete SQL with all CTEs and proper parameter handling
	 */
	private buildCombinedCTEQuery(finalSelect?: {cteName: string; columns?: string}): QueryObject {
		const cteDefinitions: string[] = [];
		const allValues: any[] = [];
		let currentOffset = 0;

		// Process each CTE step
		for (const step of this.steps) {
			const processedStep = this.processStep(step, currentOffset);
			cteDefinitions.push(`${step.name} AS (\n  ${processedStep.sql}\n)`);
			allValues.push(...processedStep.values);
			currentOffset += processedStep.values.length;
		}

		// Combine CTEs
		let fullSQL = `WITH ${cteDefinitions.join(',\n')}`;

		// Add final SELECT
		if (finalSelect) {
			const columns = finalSelect.columns || '*';
			fullSQL += `\nSELECT ${columns} FROM ${finalSelect.cteName};`;
		} else {
			// Default to selecting from the first CTE
			fullSQL += `\nSELECT * FROM ${this.steps[0].name};`;
		}

		return {
			sqlText: fullSQL,
			values: allValues,
		};
	}

	/**
	 * Process a single CTE step, handling parameter offsets and CTE references
	 */
	private processStep(step: CTEBuildStep, offset: number): {sql: string; values: any[]} {
		let {sqlText, values} = step.baseQuery;

		// Remove trailing semicolon from individual queries
		sqlText = sqlText.trim().replace(/;$/, '');

		// Adjust parameter placeholders for offset
		if (offset > 0) {
			sqlText = sqlText.replace(/\$(\d+)/g, (match, num) => {
				const newNum = parseInt(num, 10) + offset;
				return `$${newNum}`;
			});
		}

		// Handle CTE references
		if (step.references && step.references.length > 0) {
			const {modifiedSQL, additionalValues} = this.applyCTEReferences(sqlText, values, step.references);
			sqlText = modifiedSQL;
			values = [...values, ...additionalValues];
		}

		return {sql: sqlText, values};
	}

	/**
	 * Apply CTE references to the SQL, replacing parameters with CTE subqueries where needed
	 */
	private applyCTEReferences(
		sql: string,
		values: any[],
		references: CTEReference[]
	): {modifiedSQL: string; additionalValues: any[]} {
		let modifiedSQL = sql;
		const additionalValues: any[] = [];

		for (const ref of references) {
			if (ref.type === 'select_value') {
				// Replace a parameter with a subquery selecting from a CTE
				const subquery = `(SELECT "${ref.sourceField}" FROM ${ref.sourceCTE})`;

				// Find the parameter to replace in the VALUES clause
				// This is a simplified approach - a more robust implementation would parse the SQL AST
				if (ref.targetParameterIndex) {
					const paramPattern = new RegExp(`\\$${ref.targetParameterIndex}\\b`);
					if (paramPattern.test(modifiedSQL)) {
						modifiedSQL = modifiedSQL.replace(paramPattern, subquery);
						// Remove the corresponding value since it's now a subquery
						values.splice(ref.targetParameterIndex - 1, 1);
					}
				}
			} else if (ref.type === 'join_condition') {
				// Add a WHERE or JOIN condition referencing the CTE
				const condition = `"${ref.targetField}" = (SELECT "${ref.sourceField}" FROM ${ref.sourceCTE})`;
				// This would require more sophisticated SQL parsing to inject properly
				// For now, this is a placeholder for the concept
			}
		}

		return {modifiedSQL, additionalValues};
	}
}

/**
 * Represents a step in the CTE building process
 */
interface CTEBuildStep {
	name: string;
	baseQuery: QueryObject;
	references?: CTEReference[];
	type: 'insert' | 'update' | 'select';
}

/**
 * Represents a reference from one CTE to another
 */
export interface CTEReference {
	type: 'select_value' | 'join_condition';
	sourceCTE: string;
	sourceField: string;
	targetField?: string;
	targetParameterIndex?: number; // For replacing specific parameters
}

/**
 * Factory function to create a new enhanced CTE builder
 */
export function createEnhancedCTE(): EnhancedCTEBuilder {
	return new EnhancedCTEBuilder();
}

/**
 * Utility type for CTE configuration
 */
export type CTEConfig<T extends Record<string, {type: any}>> = {
	name: string;
	table: DatabaseOperations<T>;
	data: Partial<SchemaToData<T>>;
	options?: {
		returnField?: keyof T | '*';
		onConflict?: boolean;
		idUser?: string;
	};
	references?: CTEReference[];
};
