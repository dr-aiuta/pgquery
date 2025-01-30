import {TableDefinition} from './table';

export type DatabaseSchema<T> = {
	[tableName: string]: TableDefinition<T>;
};
