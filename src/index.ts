import { Pool } from 'pg';
import { DbConfig, ModelsConfig, Model } from './types';

export default class DatabaseManager {
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
        const queryConfig = model.queries[queryName];

        // Create a function for each query and bind it to the current instance
        this.models[modelName].queries[queryName] = async (...args: any[]) => {
          const result = await this.db.query(queryConfig.sql, queryConfig.values(...args));
          return queryConfig.processResult(result);
        };
      }
    }
  }
}
