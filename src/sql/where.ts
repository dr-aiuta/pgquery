import {QueryInputError, isIdentifier} from './identifiers';

interface HandleSQLQueryBy {
	jsonField: (field: string, value: object, whereConditions: string[], queryValues: any[]) => void;
	dateField: (field: string, condition: string, value: any, whereConditions: string[], queryValues: any[]) => void;
	orderByField: (field: string, value: any, orderByParts: string[]) => void;
	likeField: (field: string, value: any, whereConditions: string[], queryValues: any[]) => void;
	inField: (field: string, value: any, whereConditions: string[], queryValues: any[]) => void;
	nullField: (field: string, value: any, whereConditions: string[]) => void;
	defaultField: (field: string, condition: string, value: any, whereConditions: string[], queryValues: any[]) => void;
}

const jsonField = function (field: string, value: object, whereConditions: string[], queryValues: any[]) {
	for (const [jsonKey, jsonValue] of Object.entries(value)) {
		// The key is bound as a parameter, never interpolated, so it cannot break out of the SQL text.
		whereConditions.push(`"${field}" ->> $${queryValues.length + 1} = $${queryValues.length + 2}`);
		queryValues.push(jsonKey, jsonValue);
	}
};

const dateField = function (
	field: string,
	condition: string,
	value: any,
	whereConditions: string[],
	queryValues: any[]
) {
	const operator = condition === 'startDate' ? '>=' : '<=';
	whereConditions.push(`"${field}" ${operator} $${queryValues.length + 1}`);
	queryValues.push(new Date(value));
};

const ORDER_BY_DIRECTIONS = ['ASC', 'DESC'];

const orderByField = function (field: string, value: any, orderByParts: string[]) {
	// The direction is interpolated into the SQL text, so it must come from a fixed allow-list.
	const direction = String(value).toUpperCase();
	if (!ORDER_BY_DIRECTIONS.includes(direction)) {
		throw new QueryInputError(`Invalid orderBy direction for ${field}: ${String(value)}. Expected 'ASC' or 'DESC'.`);
	}
	// queryConstructor writes the ORDER BY keyword once, in front of all the parts.
	orderByParts.push(`"${field}" ${direction}`);
};

const likeField = function (field: string, value: any, whereConditions: string[], queryValues: any[]) {
	whereConditions.push(`"${field}" LIKE $${queryValues.length + 1}`);
	queryValues.push(value);
};

// An IN list is sent as one array parameter. The cap keeps a request from sending an unbounded list.
export const MAX_IN_VALUES = 10000;

const inField = function (field: string, value: any, whereConditions: string[], queryValues: any[]) {
	let valuesArray: any[];
	if (Array.isArray(value)) {
		valuesArray = value;
	} else if (typeof value === 'string') {
		// A comma-separated string is split. An empty string is an empty list.
		valuesArray = value === '' ? [] : value.split(',');
	} else {
		throw new QueryInputError(
			`Invalid value for ${field}.in: ${String(value)}. Expected an array or a comma-separated string.`
		);
	}
	if (valuesArray.length > MAX_IN_VALUES) {
		throw new QueryInputError(
			`Too many values for ${field}.in: ${valuesArray.length}. The maximum is ${MAX_IN_VALUES}.`
		);
	}
	// One array parameter. PostgreSQL takes the array type from the column, and an empty array matches no row.
	whereConditions.push(`"${field}" = ANY($${queryValues.length + 1})`);
	queryValues.push(valuesArray);
};

const nullField = function (field: string, value: any, whereConditions: string[]) {
	// true means IS NULL and false means IS NOT NULL, as a boolean or as the string a query string carries.
	if (value === true || value === 'true') {
		whereConditions.push(`"${field}" IS NULL`);
	} else if (value === false || value === 'false') {
		whereConditions.push(`"${field}" IS NOT NULL`);
	} else {
		throw new QueryInputError(`Invalid value for ${field}.null: ${String(value)}. Expected true or false.`);
	}
};

const defaultField = function (
	field: string,
	condition: string,
	value: any,
	whereConditions: string[],
	queryValues: any[]
) {
	if (condition === 'not') {
		whereConditions.push(`"${field}" <> $${queryValues.length + 1}`);
		queryValues.push(value);
	} else {
		const isNull = value === null;
		whereConditions.push(`"${field}" ${isNull ? 'IS' : '='} ${isNull ? 'NULL' : `$${queryValues.length + 1}`}`);
		if (!isNull) queryValues.push(value);
	}
};

const handleSQLQueryParts: HandleSQLQueryBy = {
	jsonField,
	dateField,
	orderByField,
	likeField,
	inField,
	nullField,
	defaultField,
};

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
					throw new QueryInputError(
						`Invalid limit value: ${parsed}. The maximum for this table is ${options.maxLimit}.`
					);
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
