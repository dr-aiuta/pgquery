const jsonField = function (aliasPrefix, field, value, whereConditions, queryValues) {
    for (const [jsonKey, jsonValue] of Object.entries(value)) {
        whereConditions.push(`${aliasPrefix}"${field}" ->> '${jsonKey}' = $${queryValues.length + 1}`);
        queryValues.push(jsonValue);
    }
};
const dateField = function (aliasPrefix, field, condition, value, whereConditions, queryValues) {
    const operator = condition === 'startDate' ? '>=' : '<=';
    whereConditions.push(`${aliasPrefix}"${field}" ${operator} $${queryValues.length + 1}`);
    queryValues.push(new Date(value));
};
const orderByField = function (aliasPrefix, field, value, orderByParts) {
    orderByParts.push(`ORDER BY ${aliasPrefix}"${field}" ${value}`);
};
const likeField = function (aliasPrefix, field, value, whereConditions, queryValues) {
    whereConditions.push(`${aliasPrefix}"${field}" LIKE $${queryValues.length + 1}`);
    queryValues.push(value);
};
const inField = function (aliasPrefix, field, value, whereConditions, queryValues) {
    const valuesArray = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
    const placeholders = valuesArray.map((_, i) => `$${queryValues.length + i + 1}`).join(', ');
    whereConditions.push(`${aliasPrefix}"${field}" IN (${placeholders})`);
    queryValues.push(...valuesArray);
};
const defaultField = function (aliasPrefix, field, condition, value, whereConditions, queryValues) {
    let sqlCondition;
    if (condition === 'null') {
        sqlCondition = value === 'true' ? 'IS NULL' : 'IS NOT NULL';
        whereConditions.push(`${aliasPrefix}"${field}" ${sqlCondition}`);
    }
    else if (condition === 'not') {
        sqlCondition = '<>';
        whereConditions.push(`${aliasPrefix}"${field}" ${sqlCondition} $${queryValues.length + 1}`);
        queryValues.push(value);
    }
    else {
        sqlCondition = '=';
        const isNull = value === null;
        whereConditions.push(`${aliasPrefix}"${field}" ${isNull ? 'IS' : sqlCondition} ${isNull ? 'NULL' : `$${queryValues.length + 1}`}`);
        if (!isNull)
            queryValues.push(value);
    }
};
const handleSQLQueryBy = { jsonField, dateField, orderByField, likeField, inField, defaultField };
export default handleSQLQueryBy;
