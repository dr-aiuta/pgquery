import { ColumnDefinition, SchemaToData, Mutable, QueryParams } from '@/types/column';
export type PostsColumnName = 'id' | 'userId' | 'title' | 'content' | 'createdAt' | 'updatedAt';
export type PostsSchema = {
    [K in PostsColumnName]: ColumnDefinition;
};
export declare const postsColumns: {
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
    readonly title: {
        readonly type: "TEXT";
        readonly notNull: true;
    };
    readonly content: {
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
export type PostsData = Mutable<SchemaToData<typeof postsColumns>>;
export type PostsQueryParams = QueryParams<typeof postsColumns>;
//# sourceMappingURL=posts.d.ts.map