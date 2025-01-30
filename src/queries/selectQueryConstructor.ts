import handleSQLQueryParts from '@/queries/shared/helpers/utils';

export function queryConstructor(
	allowedColumns: string[],
	params: {[key: string]: any},
	alias: string = ''
): {
	sqlQuery: string;
	urlQueryKeysArray: string[];
	urlQueryValuesArray: any[];
} {
	const aliasPrefix: string = alias ? `${alias}.` : '';
	const whereConditions: string[] = [];
	const queryValues: any[] = [];
	const orderByParts: string[] = [];
	let limitPart = '';

	for (const [key, value] of Object.entries(params)) {
		const [field, condition] = key.split('.');
		if (allowedColumns.includes(`"${field}"`) || allowedColumns.includes('*')) {
			if (field === 'limit') {
				limitPart = `LIMIT ${value}`;
			} else if (condition) {
				switch (condition) {
					case 'startDate':
					case 'endDate':
						handleSQLQueryParts.dateField(aliasPrefix, field, condition, value, whereConditions, queryValues);
						break;
					case 'orderBy':
						handleSQLQueryParts.orderByField(aliasPrefix, field, value, orderByParts);
						break;
					case 'like':
						handleSQLQueryParts.likeField(aliasPrefix, field, value, whereConditions, queryValues);
						break;
					case 'in':
						handleSQLQueryParts.inField(aliasPrefix, field, value, whereConditions, queryValues);
						break;
					case 'null':
						// Pass the 'null' condition to defaultField
						handleSQLQueryParts.defaultField(aliasPrefix, field, condition, value, whereConditions, queryValues);
						break;
					default:
						handleSQLQueryParts.defaultField(aliasPrefix, field, condition, value, whereConditions, queryValues);
						break;
				}
			} else if (typeof value === 'object' && value !== null) {
				// Only use jsonField if no condition is specified
				handleSQLQueryParts.jsonField(aliasPrefix, field, value, whereConditions, queryValues);
			} else {
				handleSQLQueryParts.defaultField(aliasPrefix, field, '', value, whereConditions, queryValues);
			}
		}
	}

	const wherePart = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';
	const orderByPart = orderByParts.join(', ');
	const sqlQuery = `${wherePart} ${orderByPart} ${limitPart}`.trim();

	return {
		sqlQuery,
		urlQueryKeysArray: Object.keys(params).map((key) => `"${key}"`),
		urlQueryValuesArray: queryValues,
	};
}
