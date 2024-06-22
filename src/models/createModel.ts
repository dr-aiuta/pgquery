import {Model} from '../types/Model';
import {ModelConfig} from '../types/ModelConfig';
import {Pool} from 'pg';

export const createModel = (config: ModelConfig, db: Pool): Model => {
	const model: Model = {
		schema: config.schema,
	};

	if (config.queries) {
		for (const queryName in config.queries) {
			const queryConfig = config.queries[queryName];
			model[queryName] = async (input: any) => {
				const values = queryConfig.values ? queryConfig.values(input) : [];
				const sql = typeof queryConfig.sql === 'function' ? queryConfig.sql(input) : queryConfig.sql;
				const result = await db.query(sql, values);
				return queryConfig.processResult ? queryConfig.processResult(result) : result;
			};
		}
	}

	return model;
};
