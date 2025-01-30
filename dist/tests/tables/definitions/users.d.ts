import { ColumnDefinition, SchemaToData, Mutable, QueryParams } from '@/types/column';
export type UsersColumnName = 'id' | 'name' | 'email' | 'createdAt' | 'updatedAt';
export type UsersSchema = {
    [K in UsersColumnName]: ColumnDefinition;
};
export declare const usersColumns: {
    readonly id: {
        readonly type: "INTEGER";
        readonly primaryKey: true;
        readonly autoIncrement: true;
    };
    readonly name: {
        readonly type: "TEXT";
        readonly notNull: true;
    };
    readonly email: {
        readonly type: "TEXT";
        readonly unique: true;
    };
    readonly createdAt: {
        readonly type: "TIMESTAMP WITHOUT TIME ZONE";
        readonly notNull: true;
        readonly default: "NOW()";
    };
    readonly updatedAt: {
        readonly type: "TIMESTAMP WITHOUT TIME ZONE";
        readonly notNull: true;
        readonly default: "NOW()";
    };
};
export type UsersData = Mutable<SchemaToData<typeof usersColumns>>;
export type UsersQueryParams = QueryParams<typeof usersColumns>;
//# sourceMappingURL=users.d.ts.map