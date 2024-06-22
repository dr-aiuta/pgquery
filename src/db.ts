import {Pool} from 'pg';
import {DbConfig} from './types';

export const createDbConnection = (config: DbConfig): Pool => {
	return new Pool(config);
};
