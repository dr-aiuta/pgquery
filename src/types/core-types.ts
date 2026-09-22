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
	'TIMESTAMP WITHOUT TIME ZONE': Date | string;
	'TIMESTAMP WITH TIME ZONE': Date | string;
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
	default?: any; // Default value. Use sqlExpression('now()') for an SQL expression; strings like 'NOW()' are also treated as expressions
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

export type ConditionSuffixes = 'not' | 'startDate' | 'endDate' | 'like' | 'in' | 'orderBy';

export type QueryConditionKeys<T extends Record<string, ColumnDefinition>> =
	| Extract<keyof SchemaToData<T>, string>
	| `${Extract<keyof SchemaToData<T>, string>}.${ConditionSuffixes}`;

export type QueryParams<T extends Record<string, ColumnDefinition>> = {
	[key in QueryConditionKeys<T>]?: any;
};

// Table types
export interface ColumnsDefinition {
	[columnName: string]: ColumnDefinition;
}

export interface TableDefinition<T> {
	tableName: string;
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
