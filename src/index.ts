// Main exports for pg-lightquery. Every export has one name.
// ✅ COMPOSITION-BASED API (RECOMMENDED)
export {TableBase} from './core/table-base';
export {EnhancedTableBase} from './core/table-base-extensions';

// Note: DatabaseOperations is intentionally not exported
// It's an internal implementation detail for composition

// Database connection
export {default as PostgresConnection} from './connection/postgres-connection';
export type {ConnectionOptions, QueryLogger, QueryLogEntry} from './connection/postgres-connection';

// The error thrown for every input the library rejects. Errors from PostgreSQL pass through unchanged.
export {QueryInputError} from './utils/query-input-error';

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
	ColumnReference,
	ForeignKeyAction,
} from './types';
export type {RequireExactlyOne, UniqueArray, InArray} from './types/utility-types';

export type {QueryObject} from './utils/query-utils';

// Marks an SQL expression, for example a column default: sqlExpression('now()').
// checkSchemaDrift and generateMigration are served from 'pg-lightquery/schema'.
export {sqlExpression} from './utils/sql-expression';
export type {SqlExpression} from './utils/sql-expression';

// Chained Insert features
export {ChainedInsertBuilder, createChainedInsert} from './utils/chained-insert-builder';
export type {InsertStepOptions, UpdateStepOptions} from './utils/chained-insert-builder';
