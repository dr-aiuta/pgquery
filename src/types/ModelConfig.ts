import { Schema } from './Schema';

export interface ModelConfig {
  schema: Schema;
  queries?: {
    [queryName: string]: {
      sql: string;
      values?: (input: any) => any[];
      processResult?: (result: any) => any;
    };
  };
}
