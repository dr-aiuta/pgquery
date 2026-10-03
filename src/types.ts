import {SqlExpression} from './sql/expression';

// Type mapping from SQL-like types to TypeScript types

// Type mapping from base types to TypeScript types
export type ColumnTypeMapping = {
	VARCHAR: string;
	TEXT: string;
	UUID: string;
	SMALLINT: number;
	INTEGER: number;
	BIGINT: string | number; // node-postgres returns BIGINT as a string by default to avoid precision loss
	NUMERIC: number;
	REAL: number;
	'DOUBLE PRECISION': number;
	BOOLEAN: boolean;
	JSON: unknown;
	JSONB: unknown;
	DATE: Date | string;
	ENUM: Enumerator | Enumerator[];
	'TIME WITHOUT TIME ZONE': string;
	'TIMESTAMP WITHOUT TIME ZONE': Date | string;
	'TIMESTAMP WITH TIME ZONE': Date | string;
	TIMESTAMPTZ: Date | string; // alias of TIMESTAMP WITH TIME ZONE
};

// Define the base types without parameters
export type BaseColumnType = keyof ColumnTypeMapping;

// Define the enum for possible enumerator values
export type Enumerator = string | number; // ENUM type should support strings and/or numbers

// Referential actions for foreign keys
export type ForeignKeyAction = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

// Foreign key target of a column. `table` may be schema-qualified, e.g. 'auth.users'.
export type ColumnReference = {
	table: string;
	column: string;
	onDelete?: ForeignKeyAction;
	onUpdate?: ForeignKeyAction;
};

// Model definition structure
export type ColumnDefinition<T extends BaseColumnType = any> = {
	type: T;
	primaryKey?: boolean;
	length?: number; // For VARCHAR
	precision?: number; // For NUMERIC
	scale?: number; // For NUMERIC
	enum?: Enumerator | readonly Enumerator[];
	enumTypeName?: string; // PostgreSQL enum type for ENUM columns, may be schema-qualified. Defaults to '<table>_<column>'
	autoIncrement?: boolean;
	unique?: boolean;
	notNull?: boolean;
	// Default value. A string is a literal. Use sqlExpression('now()') for an SQL expression.
	// For compatibility, exactly 'now()', 'CURRENT_TIMESTAMP', 'CURRENT_DATE' and 'gen_random_uuid()',
	// in any case, are still read as expressions. null and undefined both mean no default.
	default?: any;
	references?: ColumnReference; // Foreign key
};

// Helper type to transform the model definition into an instance type
export type SchemaToData<M extends Record<string, ColumnDefinition>> = {
	[K in keyof M]: ColumnTypeMapping[M[K]['type']];
};

// // Utility type to make properties mutable (remove readonly)
export type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

export type ConditionSuffixes = 'not' | 'startDate' | 'endDate' | 'like' | 'in' | 'orderBy' | 'null';

export type QueryConditionKeys<T extends Record<string, ColumnDefinition>> =
	Extract<keyof SchemaToData<T>, string> | `${Extract<keyof SchemaToData<T>, string>}.${ConditionSuffixes}`;

export type QueryParams<T extends Record<string, ColumnDefinition>> = {
	[key in QueryConditionKeys<T>]?: any;
};

// Table types
export interface ColumnsDefinition {
	[columnName: string]: ColumnDefinition;
}

export interface TableDefinition<T> {
	tableName: string;
	// The highest `limit` a select on this table accepts. A higher limit throws. Without it there is no ceiling.
	maxLimit?: number;
	schema: {
		columns: {
			[K in keyof T]: ColumnDefinition;
		};
		// index
	};
}

// Database types
export type DatabaseSchema<T> = {
	[tableName: string]: TableDefinition<T>;
};

// Utility types
export type RequireExactlyOne<T> = {
	[K in keyof T]: Pick<T, K> & Partial<Record<Exclude<keyof T, K>, never>>;
}[keyof T];

export type UniqueArray<T> = T extends readonly [infer X, ...infer Rest]
	? InArray<Rest, X> extends true
		? ['Encountered value with duplicates:', X]
		: readonly [X, ...UniqueArray<Rest>]
	: T;

export type InArray<T, X> = T extends readonly [X, ...infer _Rest]
	? true
	: T extends readonly [X]
		? true
		: T extends readonly [infer _, ...infer Rest]
			? InArray<Rest, X>
			: false;

// Query and option types
export type QueryObject = {
	sqlText: string;
	values: any[];
};

// New standardized interfaces
interface QueryResult<T> {
	query: QueryObject;
	execute(): Promise<T>;
}

interface TransactionResult<T> {
	queries: QueryObject[];
	execute(): Promise<T>;
	add(query: QueryObject): TransactionResult<T>;
}

/** Which columns a call may use. '*' means every column of the schema, and has to be written out. */
type AllowedColumns<T> = (keyof T)[] | '*';

interface BaseOptions<T extends Record<string, ColumnDefinition>> {
	allowedColumns: AllowedColumns<T>;
	predefinedSQL?: {
		sqlText: string;
		values?: any[];
	};
}

/** update takes no predefinedSQL: PostgreSQL rejects two commands in one prepared statement. */
type UpdateBaseOptions<T extends Record<string, ColumnDefinition>> = Omit<BaseOptions<T>, 'predefinedSQL'>;

/**
 * The data of an insert or an update. A value is the column's type, or sqlExpression(...).
 * An expression is written into the SQL text and is not bound.
 */
type WriteData<T extends Record<string, ColumnDefinition>> = {
	[K in keyof SchemaToData<T>]?: SchemaToData<T>[K] | SqlExpression;
};

/** true targets the primary key. {target} names the columns of another unique constraint. */
type OnConflict<T> = boolean | {target: (keyof T)[]};

interface InsertOptions<T extends Record<string, ColumnDefinition>> {
	data: WriteData<T>;
	returnField?: keyof T | (keyof T)[] | '*';
	onConflict?: OnConflict<T>;
	idUser?: string;
}

interface SelectOptions<T extends Record<string, ColumnDefinition>> {
	where?: QueryParams<T>;
	/** Drop where keys whose column is not in allowedColumns, where the default is to throw. */
	ignoreUnknownKeys?: boolean;
	/** @deprecated The option was never used. It is ignored. */
	includeMetadata?: boolean;
	schemaColumns?: any;
	columnsToReturn?: (keyof T)[] | '*';
}

interface UpdateOptions<T extends Record<string, ColumnDefinition>> {
	data: WriteData<T>;
	where: QueryParams<T>; // Required for safety unless allowUpdateAll is true
	returnField?: keyof T | (keyof T)[] | '*';
	idUser?: string;
	allowUpdateAll?: boolean; // Allows updates without WHERE clause (dangerous - use with caution)
}

// Custom interfaces for predefined SQL with custom schema types
interface CustomBaseOptions<T extends Record<string, any>> {
	allowedColumns: AllowedColumns<T>;
	predefinedSQL: {
		sqlText: string;
		values?: any[];
	};
}

interface CustomSelectOptions<T extends Record<string, any>> {
	where?: QueryParams<T>;
	/** Drop where keys whose column is not in allowedColumns, where the default is to throw. */
	ignoreUnknownKeys?: boolean;
	/** @deprecated The option was never used. It is ignored. */
	includeMetadata?: boolean;
	schemaColumns?: any;
	columnsToReturn?: (keyof T)[] | '*';
}

// Export the new interfaces
export type {
	QueryResult,
	TransactionResult,
	AllowedColumns,
	OnConflict,
	WriteData,
	BaseOptions,
	UpdateBaseOptions,
	InsertOptions,
	SelectOptions,
	UpdateOptions,
	CustomBaseOptions,
	CustomSelectOptions,
};
