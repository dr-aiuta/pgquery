import {TableDefinition} from '../../../src/types';
import {TableBase} from '../../../src/core/table-base';
import {PostsSchema, postsColumns, PostsData} from '../definitions/posts';
import {QueryParams} from '../../../src/types';
import {QueryObject, QueryResult} from '../../../src/utils/query-utils';

const postsTable: TableDefinition<PostsSchema> = {
	tableName: 'posts',
	schema: {
		columns: postsColumns,
	},
};

class PostsTable extends TableBase<PostsSchema> {
	constructor() {
		super(postsTable);
	}

	public insertPost(
		allowedColumns: (keyof PostsSchema)[] | '*',
		options: {
			data: Partial<PostsData>;
			returnField?: keyof PostsSchema;
			onConflict?: boolean;
			idUser?: string;
		}
	): QueryResult<Partial<PostsData>[]> {
		return this.insert({
			allowedColumns,
			options: {
				data: options.data,
				returnField: options.returnField,
				onConflict: options.onConflict || false,
				idUser: options.idUser || 'SERVER',
			},
		});
	}

	public selectPosts(
		allowedColumns: (keyof PostsSchema)[] | '*',
		options?: {
			where?: QueryParams<PostsSchema>;
			alias?: string;
		}
	): QueryResult<Partial<PostsData>[]> {
		return this.select<PostsData>({
			allowedColumns,
			options: {
				where: options?.where,
				alias: options?.alias,
			},
		});
	}

	public selectPostById(id: number): QueryResult<Partial<PostsData>[]> {
		return this.select<PostsData>({
			allowedColumns: '*',
			options: {
				where: {id},
			},
		});
	}
}

export default PostsTable;
export {PostsSchema, postsColumns};
