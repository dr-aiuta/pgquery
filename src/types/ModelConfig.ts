import { Schema } from './Schema';

export interface ModelConfig {
  schema: Schema;
  tableName: string;
  queries?: {
    [queryName: string]: {
      sql: string;
      values?: (input: any) => any[];
      processResult?: (result: any) => any;
    };
  };
}
