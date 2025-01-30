export const usersColumns = {
    id: {
        type: 'INTEGER',
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: 'TEXT',
        notNull: true,
    },
    email: {
        type: 'TEXT',
        unique: true,
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
