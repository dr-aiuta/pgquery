// Main exports for pg-lightquery
// ✅ COMPOSITION-BASED API (RECOMMENDED)
export {TableBase} from './core/table-base';

// Note: DatabaseOperations is intentionally not exported
// It's an internal implementation detail for composition

// Database connection
export {default as PostgresConnection} from './connection/postgres-connection';

// Types exports
export type {
	ColumnDefinition,
	SchemaToData,
	ColumnTypeMapping,
	QueryParams,
	QueryConditionKeys,
	BaseColumnType,
	Enumerator,
	ConditionSuffixes,
	Mutable,
	TableDefinition,
	ColumnsDefinition,
	DatabaseSchema,
} from './types';
export type {RequireExactlyOne, UniqueArray, InArray} from './types/utility-types';

// Shared utilities
export * as pgUtilsDb from './utils/query-utils';
export * as pgUtilsHelpers from './utils/helpers';

export type {QueryObject} from './utils/query-utils';

// CTE (Common Table Expression) features
export {EnhancedCTEBuilder, createEnhancedCTE} from './utils/enhanced-cte-builder';
export type {CTEReference, CTEConfig} from './utils/enhanced-cte-builder';
export {CTETransactionBuilder, createCTETransaction} from './utils/cte-transaction-builder';
export type {CTEStep, CTEInsertConfig} from './utils/cte-transaction-builder';

// Chained Insert features
export {ChainedInsertBuilder, createChainedInsert} from './utils/chained-insert-builder';

// Main export is now TableBase
export {TableBase as default} from './core/table-base';

// ✅ Also export TableBase as QueryBuilder alias for convenience
export {TableBase as QueryBuilder} from './core/table-base';
