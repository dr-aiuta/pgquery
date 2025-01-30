// Type mapping from SQL-like types to TypeScript types

// Type mapping from base types to TypeScript types
export type ColumnTypeMapping = {
	VARCHAR: string;
	INTEGER: number;
	NUMERIC: number;
	TEXT: string;
	DATE: Date | string;
	ENUM: Enumerator | Enumerator[];
	'TIMESTAMP WITHOUT TIME ZONE': Date | string;
};

// Define the base types without parameters
export type BaseColumnType = keyof ColumnTypeMapping;

// Define the enum for possible enumerator values
export type Enumerator = string | number; // ENUM type should support strings and/or numbers

// Model definition structure
export type ColumnDefinition<T extends BaseColumnType = any> = {
	type: T;
	primaryKey?: boolean;
	length?: number; // For VARCHAR
	precision?: number; // For NUMERIC
	scale?: number; // For NUMERIC
	enum?: Enumerator | readonly Enumerator[];
	autoIncrement?: boolean;
	unique?: boolean;
	notNull?: boolean;
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
