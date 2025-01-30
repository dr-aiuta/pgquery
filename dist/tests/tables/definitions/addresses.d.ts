import { ColumnDefinition, SchemaToData, Mutable, QueryParams } from '@/types/column';
export type AddressesColumnName = 'id' | 'userId' | 'street' | 'neighborhood' | 'city' | 'createdAt' | 'updatedAt';
export type AddressesSchema = {
    [K in AddressesColumnName]: ColumnDefinition;
};
export declare const addressesColumns: {
    readonly id: {
        readonly type: "INTEGER";
        readonly primaryKey: true;
        readonly autoIncrement: true;
    };
    readonly userId: {
        readonly type: "INTEGER";
        readonly notNull: true;
        readonly references: {
            readonly table: "users";
            readonly column: "id";
        };
    };
    readonly street: {
        readonly type: "TEXT";
        readonly notNull: true;
    };
    readonly neighborhood: {
        readonly type: "TEXT";
        readonly notNull: true;
    };
    readonly city: {
        readonly type: "TEXT";
        readonly notNull: true;
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
export type AddressesData = Mutable<SchemaToData<typeof addressesColumns>>;
export type AddressesQueryParams = QueryParams<typeof addressesColumns>;
//# sourceMappingURL=addresses.d.ts.map