import { Schema } from '../types';

export const generateCreateTableSQL = (tableName: string, schema: Schema): string => {
  const columns = Object.entries(schema)
    .map(([name, column]) => `${name} ${column.type} ${column.constraints || ''}`)
    .join(', ');

  return `CREATE TABLE IF NOT EXISTS ${tableName} (${columns});`;
};
