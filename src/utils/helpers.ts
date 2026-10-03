import {QueryInputError} from './query-input-error';

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

const handleSQLQueryBy: HandleSQLQueryBy = {
	jsonField,
	dateField,
	orderByField,
	likeField,
	inField,
	nullField,
	defaultField,
};

export default handleSQLQueryBy;
