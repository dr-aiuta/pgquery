import {ColumnDefinition, SchemaToData, Mutable, QueryParams} from '../../../src/types';

// Define a type for the array of column names
export type UsersColumnName = 'id' | 'name' | 'email' | 'createdAt' | 'updatedAt' | 'lastChangedBy';

export type UsersSchema = {
	[K in UsersColumnName]: ColumnDefinition;
};

export const usersColumns = {
	id: {
		type: 'INTEGER',
		primaryKey: true,
		autoIncrement: true,
	},
	name: {
		type: 'TEXT',
		notNull: true,
	},
	email: {
		type: 'TEXT',
		unique: true,
	},
	createdAt: {
		type: 'TIMESTAMP WITHOUT TIME ZONE',
		notNull: true,
		default: 'NOW()',
	},
	updatedAt: {
		type: 'TIMESTAMP WITHOUT TIME ZONE',
		notNull: true,
		default: 'NOW()',
	},
	lastChangedBy: {
		type: 'TEXT',
		notNull: false,
	},
} as const;

export type UsersData = Mutable<SchemaToData<typeof usersColumns>>;
export type UsersQueryParams = QueryParams<typeof usersColumns>;
