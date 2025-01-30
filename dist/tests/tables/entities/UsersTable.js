import { PGLightQuery } from '@/queries/PGLightQuery';
import { classUtils } from '@/queries/shared/helpers';
import { usersColumns } from '@tests/tables/definitions/users';
import predefinedUsersQueries from '../queries/predefined/users';
const usersTable = {
    tableName: 'users',
    schema: {
        columns: usersColumns,
    },
};
class UsersTable extends PGLightQuery {
    constructor() {
        super(usersTable);
        this.predefinedQueries = {
            selectUserDetails: predefinedUsersQueries.selectUserDetails,
        };
        this.boundMethods = this.bindMethods();
    }
    bindMethods() {
        return classUtils.bindMethods(this);
    }
    insertUser(dataToBeInserted, allowedColumns, returnField, onConflict, idUser) {
        return this.boundMethods.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser);
    }
    async selectUsers(params, allowedColumns) {
        return this.select({
            params,
            allowedColumns,
        }).execute();
    }
    async selectUserById(id) {
        return this.select({
            params: { id },
            allowedColumns: '*',
        }).execute();
    }
    async selectUserDetails(params, allowedColumns, whereClause) {
        let sqlText = this.predefinedQueries.selectUserDetails;
        if (whereClause) {
            sqlText += ` AND ${whereClause}`;
        }
        return this.select({
            params,
            allowedColumns,
            predefinedSQL: {
                sqlText,
            },
        }).execute();
    }
}
export default UsersTable;
export { usersColumns };
