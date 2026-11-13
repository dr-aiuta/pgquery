import handleSQLQueryParts from '../utils/helpers';

// Identifiers accepted when the allowed-columns list is the '*' wildcard.
// Every identifier is emitted inside double quotes, so a name that cannot contain a
// double quote (or anything else outside this pattern) cannot break out of them.
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isFieldAllowed(field: string, allowedColumns: string[]): boolean {
	if (allowedColumns.includes(`"${field}"`)) return true;
	if (!allowedColumns.includes('*')) return false;
	if (!SAFE_IDENTIFIER.test(field)) {
		throw new Error(`Invalid column name in query parameters: ${field}`);
	}
	return true;
}

// LIMIT and OFFSET are interpolated into the SQL text, so each must be a validated non-negative integer.
function parsePagingValue(name: 'limit' | 'offset', value: unknown): number {
	const parsed = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
	if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`Invalid ${name} value: ${String(value)}. Expected a non-negative integer.`);
	}
	return parsed;
}

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
	let offsetPart = '';

	for (const [key, value] of Object.entries(params)) {
		const [field, condition] = key.split('.');
		if (isFieldAllowed(field, allowedColumns)) {
			if (field === 'limit') {
				limitPart = `LIMIT ${parsePagingValue('limit', value)}`;
			} else if (field === 'offset') {
				offsetPart = `OFFSET ${parsePagingValue('offset', value)}`;
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
	// Sort keys keep the order of the object's keys.
	const orderByPart = orderByParts.length ? `ORDER BY ${orderByParts.join(', ')}` : '';
	// OFFSET follows LIMIT. The text in front of it is built as before, so existing queries keep their SQL.
	const withoutOffset = `${wherePart} ${orderByPart} ${limitPart}`.trim();
	const sqlQuery = offsetPart ? `${withoutOffset} ${offsetPart}`.trim() : withoutOffset;

	return {
		sqlQuery,
		urlQueryKeysArray: Object.keys(params).map((key) => `"${key}"`),
		urlQueryValuesArray: queryValues,
	};
}
