export const postsColumns = {
    id: {
        type: 'INTEGER',
        primaryKey: true,
        autoIncrement: true,
    },
    userId: {
        type: 'INTEGER',
        notNull: true,
        references: {
            table: 'users',
            column: 'id',
        },
    },
    title: {
        type: 'TEXT',
        notNull: true,
    },
    content: {
        type: 'TEXT',
        notNull: true,
    },
    createdAt: {
        type: 'TIMESTAMP WITHOUT TIME ZONE',
        notNull: true,
        default: 'NOW()',
    },
    updatedAt: {
        type: 'TIMESTAMP WITHOUT TIME ZONE',
        notNull: true,
        default: 'NOW()',
    },
};
