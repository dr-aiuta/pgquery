import {PostgresTypes} from './PostgresTypes';

export interface Column {
	type: PostgresTypes;
	primaryKey?: boolean;
	notNull?: boolean;
	unique?: boolean;
	default?: string;
	constraints?: string;
}

export interface Schema {
	[columnName: string]: Column;
}
