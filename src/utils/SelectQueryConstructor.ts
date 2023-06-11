type Params = {
  [key: string]: any;
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

  // console.log(Object.entries(params))
  for (const [key, value] of Object.entries(params)) {
    const [field, condition] = key.split('.');
    if (allowedColumns.includes(`"${field}"`) || allowedColumns.includes('*')) {
      switch (field) {
        case 'limit':
          limitPart = `LIMIT ${value}`;
          break;
        default:
          switch(condition){
            case 'startDate':
              whereConditions.push(`${aliasPrefix}"${field}" >= $${queryValues.length + 1}`);
              queryValues.push(new Date(value));
              break;
            case 'endDate':
              whereConditions.push(`${aliasPrefix}"${field}" <= $${queryValues.length + 1}`);
              queryValues.push(new Date(value));
              break;
            case 'orderBy':
              orderByParts.push(`ORDER BY ${aliasPrefix}"${field}" ${value}`);
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
  }

  const wherePart = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const orderByPart = orderByParts.join(', ');

  const sqlQuery = `${wherePart} ${orderByPart} ${limitPart}`.trim();
  return { sqlQuery, urlQueryKeysArray: Object.keys(params).map(key => `"${key}"`), urlQueryValuesArray: queryValues };
}

export {
 queryConstructor 
}