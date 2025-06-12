interface HandleSQLQueryBy {
	jsonField: (aliasPrefix: string, field: string, value: object, whereConditions: string[], queryValues: any[]) => void;
	dateField: (
		aliasPrefix: string,
		field: string,
		condition: string,
		value: any,
		whereConditions: string[],
		queryValues: any[]
	) => void;
	orderByField: (aliasPrefix: string, field: string, value: any, orderByParts: string[]) => void;
	likeField: (aliasPrefix: string, field: string, value: any, whereConditions: string[], queryValues: any[]) => void;
	inField: (aliasPrefix: string, field: string, value: any, whereConditions: string[], queryValues: any[]) => void;
	defaultField: (
		aliasPrefix: string,
		field: string,
		condition: string,
		value: any,
		whereConditions: string[],
		queryValues: any[]
	) => void;
}

const jsonField = function (
	aliasPrefix: string,
	field: string,
	value: object,
	whereConditions: string[],
	queryValues: any[]
) {
	for (const [jsonKey, jsonValue] of Object.entries(value)) {
		whereConditions.push(`${aliasPrefix}"${field}" ->> '${jsonKey}' = $${queryValues.length + 1}`);
		queryValues.push(jsonValue);
	}
};

const dateField = function (
	aliasPrefix: string,
	field: string,
	condition: string,
	value: any,
	whereConditions: string[],
	queryValues: any[]
) {
	const operator = condition === 'startDate' ? '>=' : '<=';
	whereConditions.push(`${aliasPrefix}"${field}" ${operator} $${queryValues.length + 1}`);
	queryValues.push(new Date(value));
};

const orderByField = function (aliasPrefix: string, field: string, value: any, orderByParts: string[]) {
	orderByParts.push(`ORDER BY ${aliasPrefix}"${field}" ${value}`);
};

const likeField = function (
	aliasPrefix: string,
	field: string,
	value: any,
	whereConditions: string[],
	queryValues: any[]
) {
	whereConditions.push(`${aliasPrefix}"${field}" LIKE $${queryValues.length + 1}`);
	queryValues.push(value);
};

const inField = function (
	aliasPrefix: string,
	field: string,
	value: any,
	whereConditions: string[],
	queryValues: any[]
) {
	const valuesArray = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
	const placeholders = valuesArray.map((_, i) => `$${queryValues.length + i + 1}`).join(', ');
	whereConditions.push(`${aliasPrefix}"${field}" IN (${placeholders})`);
	queryValues.push(...valuesArray);
};

const defaultField = function (
	aliasPrefix: string,
	field: string,
	condition: string,
	value: any,
	whereConditions: string[],
	queryValues: any[]
) {
	let sqlCondition;

	if (condition === 'null') {
		sqlCondition = value === 'true' ? 'IS NULL' : 'IS NOT NULL';
		whereConditions.push(`${aliasPrefix}"${field}" ${sqlCondition}`);
	} else if (condition === 'not') {
		sqlCondition = '<>';
		whereConditions.push(`${aliasPrefix}"${field}" ${sqlCondition} $${queryValues.length + 1}`);
		queryValues.push(value);
	} else {
		sqlCondition = '=';
		const isNull = value === null;
		whereConditions.push(
			`${aliasPrefix}"${field}" ${isNull ? 'IS' : sqlCondition} ${isNull ? 'NULL' : `$${queryValues.length + 1}`}`
		);
		if (!isNull) queryValues.push(value);
	}
};

const handleSQLQueryBy: HandleSQLQueryBy = {jsonField, dateField, orderByField, likeField, inField, defaultField};

export default handleSQLQueryBy;
