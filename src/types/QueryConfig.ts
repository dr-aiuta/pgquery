export interface QueryConfig {
  sql: string;
  values?: (...args: any[]) => any[];
  processResult?: (result: any) => any;
}