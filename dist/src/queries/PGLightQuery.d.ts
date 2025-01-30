import { TableDefinition } from '../types/table';
import { ColumnDefinition, SchemaToData, ColumnTypeMapping, QueryParams } from '../types/column';
import { QueryArrayResult, QueryResultRow } from 'pg';
import { QueryObject } from './shared/db/queryUtils';
export interface BoundMethods<T extends Record<string, ColumnDefinition>> {
    insert: (dataToBeInserted: Partial<SchemaToData<T>>, allowedColumns: (keyof T)[], returnField: keyof T, onConflict: boolean, idUser: string, predefinedSQLText?: string) => {
        queryObject: QueryObject;
        execute: () => Promise<Partial<SchemaToData<T>>[]>;
    };
    select: (paramsObj: {
        params?: QueryParams<T>;
        allowedColumns?: (keyof T)[] | '*';
        alias?: string;
        allowedColumnsOptions?: ('limit' | 'offset')[];
        predefinedSQL?: {
            sqlText: string;
            values?: any[];
        };
    }) => {
        sqlText: string;
        values: any[];
        execute: () => Promise<Partial<SchemaToData<T>[]>[]>;
    };
    update: () => string;
}
export declare class PGLightQuery<T extends Record<string, {
    type: keyof ColumnTypeMapping;
}>> {
    tableName: string;
    schema: {
        columns: {
            [K in keyof T]: ColumnDefinition;
        };
        primaryKeys: (keyof T)[];
    };
    constructor(tableDefinition: TableDefinition<T>);
    private filterPrimaryKeys;
    private treatAllowedColumns;
    generatePrimaryKey(prefix: string): string;
    protected insert(dataToBeInserted: Partial<SchemaToData<T>>, allowedColumns: (keyof T)[] | '*', returnField: keyof T, onConflict: boolean, idUser?: string, predefinedSQLText?: string): {
        queryObject: QueryObject;
        execute: () => Promise<Partial<SchemaToData<T>>[]>;
    };
    protected select<U extends QueryResultRow = SchemaToData<T>>(paramsObj?: {
        params?: QueryParams<T>;
        allowedColumns?: (keyof T)[] | '*';
        alias?: string;
        allowedColumnsOptions?: ('limit' | 'offset')[];
        predefinedSQL?: {
            sqlText: string;
            values?: any[];
        };
        schemaColumns?: U;
    }): {
        sqlText: string;
        values: any[];
        execute: () => Promise<Partial<U>[]>;
    };
    protected update(predefinedSQLText?: string): string;
    protected transaction(queryObjects?: QueryObject[], predefinedSQLText?: string): {
        queryObjects: QueryObject[];
        execute: () => Promise<QueryArrayResult<any>[]>;
    };
}
//# sourceMappingURL=PGLightQuery.d.ts.map