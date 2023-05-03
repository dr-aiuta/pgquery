import { Pool } from 'pg';
import { DbConfig, ModelsConfig, Model } from '../types';
import { queryConstructor } from '../utils/SelectQueryConstructor';

class DatabaseManager {
  private db: Pool;
  public models: Record<string, Model>;

  constructor(dbConfig: DbConfig, modelsConfig: ModelsConfig) {
    this.db = new Pool(dbConfig);
    this.models = {};

    // Loop through the models in modelsConfig
    for (const modelName in modelsConfig) {
      const model = modelsConfig[modelName];
      this.models[modelName] = {
        schema: model.schema,
        queries: {},
      };

      // Loop through the queries in each model
      for (const queryName in model.queries) {
        const query = model.queries[queryName];

        // Create a function for each query and bind it to the current instance
        this.models[modelName].queries[queryName] = async (allowedColumns:string[],args: any) => {

          let sqlQuery: string;
          let queryValues: any[] = [];
          
          switch (query.type) {
            case 'select': {
              const constructedQuery = queryConstructor(allowedColumns, args);
              
              sqlQuery = `${query.sql} ${constructedQuery.sqlQuery}`;
              queryValues = constructedQuery.urlQueryValuesArray;
              break;
            }
            default: {
          
              sqlQuery = query.sql;
              queryValues = query.values?.(args) ?? [];
              
              break;
            }
          }

          const result = await this.db.query(sqlQuery, queryValues);
          return query.processResult?.(result) ?? result;
          













          // // Store the result of the optional chaining expression in a variable
          // const queryValues = query.values?.(args) ?? [];

          // // Spread the variable when calling the query
          // const result = await this.db.query(query.sql, queryValues);
          // return query.processResult?.(result) ?? result;
        };
      }
    }
  }
}

export {
  DatabaseManager,
};