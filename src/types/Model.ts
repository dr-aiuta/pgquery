import { Schema } from './Schema';

export interface Model {
  schema: Schema;
  [queryName: string]: any;
}
