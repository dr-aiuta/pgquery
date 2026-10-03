import {ColumnDefinition, QueryParams, SchemaToData} from '../types';
import {SqlExpression} from '../sql/expression';

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
