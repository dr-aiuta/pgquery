import { PostgresTypes } from './PostgresTypes';

export interface Column {
  name: string;
  type: PostgresTypes;
  constraints?: string;
}

export interface Schema {
  [columnName: string]: Column;
}
