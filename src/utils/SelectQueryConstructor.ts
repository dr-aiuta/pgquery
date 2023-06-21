type Params = {
  [key: string]: any;
};

function queryConstructor(
  allowedColumns: string[],
  params: Params,
  alias: string = ""
): {
  sqlQuery: string;
  urlQueryKeysArray: string[];
  urlQueryValuesArray: any[];
} {
  const aliasPrefix = alias ? `${alias}.` : "";
  const whereConditions: string[] = [];
  const queryValues: any[] = [];
  const orderByParts: string[] = [];
  let limitPart = "";

  // console.log(Object.entries(params))
  for (const [key, value] of Object.entries(params)) {
    const [field, condition] = key.split(".");
    if (allowedColumns.includes(`"${field}"`) || allowedColumns.includes("*")) {
      switch (field) {
        case "limit":
          limitPart = `LIMIT ${value}`;
          break;
        default:
          if (typeof value === "object" && value !== null) {
            for (const [jsonKey, jsonValue] of Object.entries(value)) {
              whereConditions.push(
                `${aliasPrefix}"${field}" ->> '${jsonKey}' = $${
                  queryValues.length + 1
                }`
              );
              queryValues.push(jsonValue);
            }
          } else {
            switch (condition) {
              case "startDate":
                whereConditions.push(
                  `${aliasPrefix}"${field}" >= $${queryValues.length + 1}`
                );
                queryValues.push(new Date(value));
                break;
              case "endDate":
                whereConditions.push(
                  `${aliasPrefix}"${field}" <= $${queryValues.length + 1}`
                );
                queryValues.push(new Date(value));
                break;
              case "orderBy":
                orderByParts.push(`ORDER BY ${aliasPrefix}"${field}" ${value}`);
                break;
              case "like":
                whereConditions.push(
                  `${aliasPrefix}"${field}" LIKE $${queryValues.length + 1}`
                );
                queryValues.push(`${value}`);
                break;
              case "in":
                const valuesArray = Array.isArray(value)
                  ? value
                  : typeof value === "string"
                  ? value.split(",")
                  : [];
                const placeholders = valuesArray
                  .map((_, i) => `$${queryValues.length + i + 1}`)
                  .join(", ");
                whereConditions.push(
                  `${aliasPrefix}"${field}" IN (${placeholders})`
                );
                queryValues.push(...valuesArray); // Assuming value is an array or a string of comma-separated values
                break;
              default:
                const [column, operator] = key.split(".");
                const condition = operator === "not" ? "<>" : "=";
                const isNull = value === null;
                whereConditions.push(
                  `${aliasPrefix}"${column}" ${isNull ? "IS" : condition} ${
                    isNull ? "NULL" : `$${queryValues.length + 1}`
                  }`
                );
                if (!isNull) queryValues.push(value);
                break;
            }
          }
          break;
      }
    }
  }

  const wherePart = whereConditions.length
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  const orderByPart = orderByParts.join(", ");

  const sqlQuery = `${wherePart} ${orderByPart} ${limitPart}`.trim();
  return {
    sqlQuery,
    urlQueryKeysArray: Object.keys(params).map((key) => `"${key}"`),
    urlQueryValuesArray: queryValues,
  };
}

export { queryConstructor };
