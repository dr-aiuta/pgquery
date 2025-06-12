// Main exports for pg-lightquery
// ✅ COMPOSITION-BASED API (RECOMMENDED)
export {TableBase} from './queries/TableBase';

// Note: DatabaseOperations is intentionally not exported
// It's an internal implementation detail for composition

// Database connection
export {default as PostgresConnection} from './config/queries';

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
} from './types/column';
export type {TableDefinition, ColumnsDefinition} from './types/table';
export type {RequireExactlyOne, UniqueArray, InArray} from './types/types';

// Shared utilities
export {pgUtilsDb} from './queries/shared';
export {pgUtilsHelpers} from './queries/shared';

export type {QueryObject} from './queries/shared/db/queryUtils';
export type {DatabaseSchema} from './types/database';

// Main export is now TableBase
export {TableBase as default} from './queries/TableBase';

// ✅ Also export TableBase as QueryBuilder alias for convenience
export {TableBase as QueryBuilder} from './queries/TableBase';
