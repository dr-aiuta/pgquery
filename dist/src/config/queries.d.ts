import { PoolConfig, QueryResult } from 'pg';
declare class PostgresConnection {
    private static instance;
    private pool;
    private constructor();
    static initialize(config: PoolConfig): PostgresConnection;
    static getInstance(): PostgresConnection;
    query(text: any, queryParams?: any[]): Promise<QueryResult<any>>;
    transaction(text: any, queryParams: any): Promise<import("pg").QueryArrayResult<any[]>>;
    static query(text: any, queryParams?: any[]): Promise<QueryResult<any>>;
    static transaction(text: any, queryParams: any): Promise<QueryResult<any>>;
}
export default PostgresConnection;
//# sourceMappingURL=queries.d.ts.map