import { PGLightQuery, BoundMethods } from '@/queries/PGLightQuery';
import { UsersSchema, usersColumns, UsersData } from '@tests/tables/definitions/users';
import { QueryParams } from '@/types/column';
import { QueryObject } from '@/queries/shared/db/queryUtils';
import { SelectUserDetailsInterface } from '../views/selectUserDetails';
declare class UsersTable extends PGLightQuery<UsersSchema> {
    private boundMethods;
    private predefinedQueries;
    constructor();
    protected bindMethods(): BoundMethods<UsersSchema> & PGLightQuery<UsersSchema>;
    insertUser(dataToBeInserted: Partial<UsersData>, allowedColumns: (keyof UsersSchema)[] | '*', returnField: keyof UsersSchema, onConflict: boolean, idUser?: string): {
        queryObject: QueryObject;
        execute: () => Promise<Partial<UsersData>[]>;
    };
    selectUsers(params: QueryParams<UsersSchema>, allowedColumns: (keyof UsersSchema)[] | '*'): Promise<Partial<UsersData>[]>;
    selectUserById(id: number): Promise<Partial<UsersData>[]>;
    selectUserDetails(params: Record<string, any>, allowedColumns: (keyof UsersSchema)[] | '*', whereClause?: string): Promise<Partial<SelectUserDetailsInterface>[]>;
}
export default UsersTable;
export { UsersSchema, usersColumns };
//# sourceMappingURL=UsersTable.d.ts.map