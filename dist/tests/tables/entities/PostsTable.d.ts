import { PGLightQuery, BoundMethods } from '@/queries/PGLightQuery';
import { PostsSchema, postsColumns, PostsData } from '@tests/tables/definitions/posts';
import { QueryParams } from '@/types/column';
import { QueryObject } from '@/queries/shared/db/queryUtils';
declare class PostsTable extends PGLightQuery<PostsSchema> {
    private boundMethods;
    constructor();
    protected bindMethods(): BoundMethods<PostsSchema> & PGLightQuery<PostsSchema>;
    insertPost(dataToBeInserted: Partial<PostsData>, allowedColumns: (keyof PostsSchema)[] | '*', returnField: keyof PostsSchema, onConflict: boolean, idUser?: string): {
        queryObject: QueryObject;
        execute: () => Promise<Partial<PostsData>[]>;
    };
    selectPosts(params: QueryParams<PostsSchema>, allowedColumns: (keyof PostsSchema)[] | '*'): Promise<Partial<PostsData>[]>;
    selectPostsByUserId(userId: number): Promise<Partial<PostsData>[]>;
    selectPostById(id: number): Promise<Partial<PostsData>[]>;
}
export default PostsTable;
export { PostsSchema, postsColumns };
//# sourceMappingURL=PostsTable.d.ts.map