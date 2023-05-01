// import { Parser } from 'sql-ddl-to-json-schema';
// import { PostgresTypes } from '../models/types';
// import { IDbColumn, IDbTable } from '../models/IDbTable';


// export function parseCreateTableSql(sql: string): IDbTable {
//   const parser = new Parser('mysql');
//   const schema = parser.feed(sql).toJsonSchemaArray({useRef:true});
//   console.log(`Parsing SQL: ${sql}`);
//   console.log(`Parsed Result: ${JSON.stringify(schema, null, 2)}`);
//   const table = Object.keys(schema)[0];
//   const columns = schema.length > 0 ? (schema[0] as unknown as { properties: { [key: string]: unknown } }).properties : {};

//   const dbColumns: IDbColumn[] = [];
//   let primaryKey: string[] | undefined;

//   for (const [columnName, columnProperties] of Object.entries(columns)) {
//     const typedColumnProperties = columnProperties as { type: string; required?: boolean; default?: string };
//     const typeParts = typedColumnProperties.type.split('(');
//     const typeName = typeParts[0].toUpperCase() as PostgresTypes;
//     const typeSize = typeParts[1]?.slice(0, -1);

//     dbColumns.push({
//       name: columnName,
//       type: typeName,
//       nullable: !typedColumnProperties.required,
//       default: typedColumnProperties.default,
//       primary: primaryKey?.includes(columnName)
//     });

//     if ((columnProperties as { primary?: boolean }).primary) {
//       primaryKey = [columnName];
//     }
//   }

//   return {
//     name: table,
//     columns: dbColumns,
//     primaryKey
//   };
// }
