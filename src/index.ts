// export { IDbTable, IDbColumn } from './models/IDbTable';
// export { IDbObject } from './models/IDbObject';
// // export { PostgresDb } from './models/PostgresDb';
// // export { BaseRepository } from './repositories/BaseRepository';
// export { parseCreateTableSql } from './services/BaseService';


import { createDbConnection } from './db';
import { createModels } from './models/createModels';
import { DbConfig, ModelsConfig, Model } from './types';

export const createDbModule = (dbConfig: DbConfig, modelsConfig: ModelsConfig): Record<string, Model> => {
  const db = createDbConnection(dbConfig);
  return createModels(modelsConfig, db);
};
