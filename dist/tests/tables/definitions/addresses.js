export const addressesColumns = {
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
    street: {
        type: 'TEXT',
        notNull: true,
    },
    neighborhood: {
        type: 'TEXT',
        notNull: true,
    },
    city: {
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
