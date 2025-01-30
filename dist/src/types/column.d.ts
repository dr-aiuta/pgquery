export type ColumnTypeMapping = {
    VARCHAR: string;
    INTEGER: number;
    NUMERIC: number;
    TEXT: string;
    DATE: Date | string;
    ENUM: Enumerator | Enumerator[];
    'TIMESTAMP WITHOUT TIME ZONE': Date | string;
};
export type BaseColumnType = keyof ColumnTypeMapping;
export type Enumerator = string | number;
export type ColumnDefinition<T extends BaseColumnType = any> = {
    type: T;
    primaryKey?: boolean;
    length?: number;
    precision?: number;
    scale?: number;
    enum?: Enumerator | readonly Enumerator[];
    autoIncrement?: boolean;
    unique?: boolean;
    notNull?: boolean;
};
export type SchemaToData<M extends Record<string, ColumnDefinition>> = {
    [K in keyof M]: ColumnTypeMapping[M[K]['type']];
};
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
export type ConditionSuffixes = 'not' | 'startDate' | 'endDate' | 'like' | 'in' | 'orderBy';
export type QueryConditionKeys<T extends Record<string, ColumnDefinition>> = Extract<keyof SchemaToData<T>, string> | `${Extract<keyof SchemaToData<T>, string>}.${ConditionSuffixes}`;
export type QueryParams<T extends Record<string, ColumnDefinition>> = {
    [key in QueryConditionKeys<T>]?: any;
};
//# sourceMappingURL=column.d.ts.map