import { ColumnDefinition } from './column';
export interface ColumnsDefinition {
    [columnName: string]: ColumnDefinition;
}
export interface TableDefinition<T> {
    tableName: string;
    schema: {
        columns: {
            [K in keyof T]: ColumnDefinition;
        };
    };
}
//# sourceMappingURL=table.d.ts.map