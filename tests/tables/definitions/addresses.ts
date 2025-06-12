import {ColumnDefinition, SchemaToData, Mutable, QueryParams} from '@/types';

export type AddressesColumnName = 'id' | 'userId' | 'street' | 'neighborhood' | 'city' | 'createdAt' | 'updatedAt';

export type AddressesSchema = {
	[K in AddressesColumnName]: ColumnDefinition;
};

export const addressesColumns = {
	id: {
		type: 'INTEGER',
		primaryKey: true,
		autoIncrement: true,
	},
	userId: {
		type: 'INTEGER',
		notNull: true,
		references: {
			table: 'users',
			column: 'id',
		},
	},
	street: {
		type: 'TEXT',
		notNull: true,
	},
	neighborhood: {
		type: 'TEXT',
		notNull: true,
	},
	city: {
		type: 'TEXT',
		notNull: true,
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
} as const;

export type AddressesData = Mutable<SchemaToData<typeof addressesColumns>>;
export type AddressesQueryParams = QueryParams<typeof addressesColumns>;
