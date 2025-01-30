"use strict";
// import { parseCreateTableSql } from '../../src/services/BaseService';
// describe('parseCreateTableSql', () => {
//   it('parses CREATE TABLE SQL into an IDbTable object', () => {
//     const sql = `
//       CREATE TABLE users (
//         id INT NOT NULL AUTO_INCREMENT,
//         name VARCHAR(255) NOT NULL,
//         email VARCHAR(255) NOT NULL UNIQUE,
//         password VARCHAR(255) NOT NULL,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//         PRIMARY KEY (id)
//       )
//     `;
//     const expected = {
//       name: 'users',
//       columns: [
//         {
//           name: 'id',
//           type: 'INT',
//           nullable: false,
//           default: 'AUTO_INCREMENT',
//           primary: true,
//         },
//         {
//           name: 'name',
//           type: 'VARCHAR',
//           nullable: false,
//           default: undefined,
//           primary: undefined,
//         },
//         {
//           name: 'email',
//           type: 'VARCHAR',
//           nullable: false,
//           default: undefined,
//           primary: undefined,
//         },
//         {
//           name: 'password',
//           type: 'VARCHAR',
//           nullable: false,
//           default: undefined,
//           primary: undefined,
//         },
//         {
//           name: 'created_at',
//           type: 'TIMESTAMP',
//           nullable: true,
//           default: 'CURRENT_TIMESTAMP',
//           primary: undefined,
//         },
//         {
//           name: 'updated_at',
//           type: 'TIMESTAMP',
//           nullable: true,
//           default: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
//           primary: undefined,
//         },
//       ],
//       primaryKey: ['id'],
//     };
//     expect(parseCreateTableSql(sql)).toEqual(expected);
//   });
// });
