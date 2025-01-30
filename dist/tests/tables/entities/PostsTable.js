import { PGLightQuery } from '@/queries/PGLightQuery';
import { classUtils } from '@/queries/shared/helpers';
import { postsColumns } from '@tests/tables/definitions/posts';
const postsTable = {
    tableName: 'posts',
    schema: {
        columns: postsColumns,
    },
};
class PostsTable extends PGLightQuery {
    constructor() {
        super(postsTable);
        this.boundMethods = this.bindMethods();
    }
    bindMethods() {
        return classUtils.bindMethods(this);
    }
    insertPost(dataToBeInserted, allowedColumns, returnField, onConflict, idUser) {
        return this.boundMethods.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser);
    }
    async selectPosts(params, allowedColumns) {
        return this.select({
            params,
            allowedColumns,
        }).execute();
    }
    async selectPostsByUserId(userId) {
        return this.select({
            params: { userId },
            allowedColumns: '*',
        }).execute();
    }
    async selectPostById(id) {
        return this.select({
            params: { id },
            allowedColumns: '*',
        }).execute();
    }
}
export default PostsTable;
export { postsColumns };
