import {TableDefinition} from '@/types';
import {TableBase} from '@/core/table-base';
import {PostsSchema, postsColumns, PostsData} from '@tests/tables/definitions/posts';
import {QueryParams} from '@/types';
import {QueryObject} from '@/utils/query-utils';

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
		dataToBeInserted: Partial<PostsData>,
		allowedColumns: (keyof PostsSchema)[] | '*',
		returnField: keyof PostsSchema,
		onConflict: boolean,
		idUser?: string
	): {
		queryObject: QueryObject;
		execute: () => Promise<Partial<PostsData>[]>;
	} {
		return this.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser || 'SERVER');
	}

	public async selectPosts(
		params: QueryParams<PostsSchema>,
		allowedColumns: (keyof PostsSchema)[] | '*'
	): Promise<Partial<PostsData>[]> {
		return this.select<PostsData>({
			params,
			allowedColumns,
		}).execute();
	}

	public async selectPostById(id: number): Promise<Partial<PostsData>[]> {
		return this.select<PostsData>({
			params: {id},
			allowedColumns: '*',
		}).execute();
	}
}

export default PostsTable;
export {PostsSchema, postsColumns};
