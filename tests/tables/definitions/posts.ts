import {ColumnDefinition, SchemaToData, Mutable, QueryParams} from '@/types/column';

export type PostsColumnName = 'id' | 'userId' | 'title' | 'content' | 'createdAt' | 'updatedAt';

export type PostsSchema = {
	[K in PostsColumnName]: ColumnDefinition;
};

export const postsColumns = {
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
	title: {
		type: 'TEXT',
		notNull: true,
	},
	content: {
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

export type PostsData = Mutable<SchemaToData<typeof postsColumns>>;
export type PostsQueryParams = QueryParams<typeof postsColumns>;
