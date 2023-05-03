type Params = {
  [key: string]: any;
  rangeField?: string;
};

function queryConstructor(allowedColumns: string[], params: Params, alias: string = ''): {
  sqlQuery: string;
  urlQueryKeysArray: string[];
  urlQueryValuesArray: any[];
} {
  const aliasPrefix = alias ? `${alias}.` : '';
  const whereConditions: string[] = [];
  const queryValues: any[] = [];
  const orderByParts: string[] = [];
  let limitPart = '';

  for (const [key, value] of Object.entries(params)) {
    if (allowedColumns.includes(`"${key.split('.')[0]}"`)) {
      switch (key) {
        case 'startDate':
          whereConditions.push(`${aliasPrefix}"${params.rangeField}" >= $${queryValues.length + 1}`);
          queryValues.push(value);
          break;
        case 'endDate':
          whereConditions.push(`${aliasPrefix}"${params.rangeField}" <= $${queryValues.length + 1}`);
          queryValues.push(value);
          break;
        case 'orderBy':
          orderByParts.push(`ORDER BY ${aliasPrefix}"${value}"`);
          break;
        case 'limit':
          limitPart = `LIMIT ${value}`;
          break;
        default:
          const [column, operator] = key.split('.');
          const condition = operator === 'not' ? '<>' : '=';
          const isNull = value === null;
          whereConditions.push(
            `${aliasPrefix}"${column}" ${isNull ? 'IS' : condition} $${isNull ? '' : queryValues.length + 1}`
          );
          if (!isNull) queryValues.push(value);
          break;
      }
    }
  }

  const wherePart = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const orderByPart = orderByParts.join(', ');

  const sqlQuery = `${wherePart} ${orderByPart} ${limitPart}`.trim();
  return { sqlQuery, urlQueryKeysArray: Object.keys(params).map(key => `"${key}"`), urlQueryValuesArray: queryValues };
}

export {
 queryConstructor 
}