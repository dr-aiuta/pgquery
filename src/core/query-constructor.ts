import handleSQLQueryParts from '../utils/helpers';
import {QueryInputError} from '../utils/query-input-error';
import {isIdentifier} from '../sql/identifiers';


// The suffixes a where key may carry, as in 'name.like'. Any other suffix throws.
const SUPPORTED_OPERATORS = ['not', 'startDate', 'endDate', 'like', 'in', 'orderBy', 'null'];

export interface QueryConstructorOptions {
	/** Drop keys whose column is not on the allow-list, where the default is to throw. */
	ignoreUnknownKeys?: boolean;
	/** The highest limit a query may ask for. A higher limit throws. */
	maxLimit?: number;
}

// Returns why a field cannot be used, or null when it is allowed.
function fieldProblem(field: string, allowedColumns: string[]): string | null {
	if (allowedColumns.includes(`"${field}"`)) return null;
	if (!allowedColumns.includes('*')) return `Unknown column in query parameters: ${field}`;
	// Under the '*' wildcard there is no list to check against, so the name must be a plain identifier.
	// It is emitted inside double quotes, and a plain identifier cannot break out of them.
	if (!isIdentifier(field)) return `Invalid column name in query parameters: ${field}`;
	return null;
}

// LIMIT and OFFSET are interpolated into the SQL text, so each must be a validated non-negative integer.
function parsePagingValue(name: 'limit' | 'offset', value: unknown): number {
	const parsed = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
	if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 0) {
		throw new QueryInputError(`Invalid ${name} value: ${String(value)}. Expected a non-negative integer.`);
	}
	return parsed;
}

export function queryConstructor(
	allowedColumns: string[],
	params: {[key: string]: any},
	options: QueryConstructorOptions = {}
): {
	sqlQuery: string;
	urlQueryKeysArray: string[];
	urlQueryValuesArray: any[];
} {
	const whereConditions: string[] = [];
	const queryValues: any[] = [];
	const orderByParts: string[] = [];
	let limitPart = '';
	let offsetPart = '';

	for (const [key, value] of Object.entries(params)) {
		const parts = key.split('.');
		const field = parts[0];
		const condition = parts.length > 1 ? parts.slice(1).join('.') : undefined;

		// An operator outside the supported list never falls back to equality.
		// This check comes first, so it holds with and without ignoreUnknownKeys.
		if (condition !== undefined && !SUPPORTED_OPERATORS.includes(condition)) {
			throw new QueryInputError(
				`Unknown operator in query parameters: ${key}. Supported operators: ${SUPPORTED_OPERATORS.join(', ')}.`
			);
		}

		const problem = fieldProblem(field, allowedColumns);
		if (problem) {
			if (options.ignoreUnknownKeys) continue;
			throw new QueryInputError(problem);
		}

		if (field === 'limit' || field === 'offset') {
			if (condition !== undefined) {
				throw new QueryInputError(`Unknown operator in query parameters: ${key}. ${field} takes no operator.`);
			}
			const parsed = parsePagingValue(field, value);
			if (field === 'limit') {
				if (options.maxLimit !== undefined && parsed > options.maxLimit) {
					throw new QueryInputError(`Invalid limit value: ${parsed}. The maximum for this table is ${options.maxLimit}.`);
				}
				limitPart = `LIMIT ${parsed}`;
			} else {
				offsetPart = `OFFSET ${parsed}`;
			}
			continue;
		}

		switch (condition) {
			case 'startDate':
			case 'endDate':
				handleSQLQueryParts.dateField(field, condition, value, whereConditions, queryValues);
				break;
			case 'orderBy':
				handleSQLQueryParts.orderByField(field, value, orderByParts);
				break;
			case 'like':
				handleSQLQueryParts.likeField(field, value, whereConditions, queryValues);
				break;
			case 'in':
				handleSQLQueryParts.inField(field, value, whereConditions, queryValues);
				break;
			case 'null':
				handleSQLQueryParts.nullField(field, value, whereConditions);
				break;
			case 'not':
				handleSQLQueryParts.defaultField(field, condition, value, whereConditions, queryValues);
				break;
			default:
				if (typeof value === 'object' && value !== null) {
					// An object value filters on the keys of a JSON column.
					handleSQLQueryParts.jsonField(field, value, whereConditions, queryValues);
				} else {
					handleSQLQueryParts.defaultField(field, '', value, whereConditions, queryValues);
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
