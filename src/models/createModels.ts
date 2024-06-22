import {ModelsConfig, Model} from '../types';
import {createModel} from './createModel';
import {Pool} from 'pg';

export const createModels = (config: ModelsConfig, db: Pool): Model => {
	const models: Model = {
		schema: {},
	};

	for (const modelName in config) {
		models[modelName] = createModel(config[modelName], db);
	}

	return models;
};
