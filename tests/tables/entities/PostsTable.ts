import {TableDefinition} from '@/types/table';
import {PGLightQuery, BoundMethods} from '@/queries/PGLightQuery';
import {classUtils} from '@/queries/shared/helpers';
import {PostsSchema, postsColumns, PostsData} from '@tests/tables/definitions/posts';
import {QueryParams} from '@/types/column';
import {QueryObject} from '@/queries/shared/db/queryUtils';

const postsTable: TableDefinition<PostsSchema> = {
	tableName: 'posts',
	schema: {
		columns: postsColumns,
	},
};

class PostsTable extends PGLightQuery<PostsSchema> {
	private boundMethods: BoundMethods<PostsSchema> & PGLightQuery<PostsSchema>;

	constructor() {
		super(postsTable);
		this.boundMethods = this.bindMethods();
	}

	protected bindMethods(): BoundMethods<PostsSchema> & PGLightQuery<PostsSchema> {
		return classUtils.bindMethods(this);
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
		return this.boundMethods.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser);
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

	public async selectPostsByUserId(userId: number): Promise<Partial<PostsData>[]> {
		return this.select<PostsData>({
			params: {userId},
			allowedColumns: '*',
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
