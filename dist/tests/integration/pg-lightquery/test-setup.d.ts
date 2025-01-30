import { QueryResultRow, QueryResult } from 'pg';
import PostsTable from '@tests/tables/entities/PostsTable';
import UsersTable from '@tests/tables/entities/UsersTable';
import AddressesTable from '@tests/tables/entities/AddressesTable';
import dbpg from '@/config/queries';
export declare const createQueryResult: <T extends QueryResultRow>(rows: T[]) => QueryResult<T>;
export declare const usersTable: UsersTable;
export declare const postsTable: PostsTable;
export declare const addressesTable: AddressesTable;
export declare const setupTests: () => void;
export { dbpg };
//# sourceMappingURL=test-setup.d.ts.map