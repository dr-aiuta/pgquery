import {buildInsertSqlQuery, buildUpdateSqlQuery, returningClause} from '../../src/sql/write';
import {UniqueArray} from '../../src/types';

describe('returnField functionality', () => {
	// Test data setup
	const tableName = 'test_table';
	const columnsForInsert: UniqueArray<string[]> = ['id', 'name', 'email', 'status'] as UniqueArray<string[]>;
	const valuesForInsert = [1, 'John Doe', 'john@example.com', 'active'];
	const primaryKeyColumns: UniqueArray<string[]> = ['id'] as UniqueArray<string[]>;
	const conflictUpdateAssignments = ['"name" = EXCLUDED."name"', '"email" = EXCLUDED."email"'];

	const columnsForUpdate: UniqueArray<string[]> = ['name', 'email'] as UniqueArray<string[]>;
	const valuesForUpdate = ['Jane Doe', 'jane@example.com'];
	const whereClause = 'WHERE "id" = $3';
	const whereValues = [1];

	// The columns of the table definition. returnField is validated against their names.
	const schemaColumns = {
		id: {type: 'INTEGER'},
		name: {type: 'TEXT'},
		email: {type: 'TEXT'},
		status: {type: 'TEXT'},
		'user-id': {type: 'TEXT'},
		'first name': {type: 'TEXT'},
	};

	describe('INSERT queries', () => {
		describe('returnField with single field', () => {
			it('should generate correct RETURNING clause for a single field', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					false,
					primaryKeyColumns,
					[],
					'id' as any,
					schemaColumns
				);

				expect(result.sqlText).toContain('RETURNING "id"');
				expect(result.sqlText).not.toContain('RETURNING *');
				expect(result.values).toEqual(valuesForInsert);
			});
		});

		describe('returnField with array of fields', () => {
			it('should generate correct RETURNING clause for multiple fields', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					false,
					primaryKeyColumns,
					[],
					['id', 'name', 'email'] as any,
					schemaColumns
				);

				expect(result.sqlText).toContain('RETURNING "id", "name", "email"');
				expect(result.sqlText).not.toContain('RETURNING *');
				expect(result.values).toEqual(valuesForInsert);
			});

			it('should handle single field array correctly', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					false,
					primaryKeyColumns,
					[],
					['id'] as any,
					schemaColumns
				);

				expect(result.sqlText).toContain('RETURNING "id"');
				expect(result.sqlText).not.toContain('RETURNING "id",');
			});

			it('should handle empty array as no RETURNING clause', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					false,
					primaryKeyColumns,
					[],
					[] as any,
					schemaColumns
				);

				expect(result.sqlText).not.toContain('RETURNING');
			});
		});

		describe('returnField with asterisk (*)', () => {
			it('should generate RETURNING * for asterisk', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					false,
					primaryKeyColumns,
					[],
					'*',
					schemaColumns
				);

				expect(result.sqlText).toContain('RETURNING *');
				expect(result.sqlText).not.toContain('RETURNING "*"');
				expect(result.values).toEqual(valuesForInsert);
			});
		});

		describe('returnField with ON CONFLICT', () => {
			it('should work with single field and ON CONFLICT', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					true,
					primaryKeyColumns,
					conflictUpdateAssignments,
					'id' as any,
					schemaColumns
				);

				expect(result.sqlText).toContain('ON CONFLICT ("id") DO UPDATE SET');
				expect(result.sqlText).toContain('RETURNING "id"');
			});

			it('should work with array of fields and ON CONFLICT', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					true,
					primaryKeyColumns,
					conflictUpdateAssignments,
					['id', 'name'] as any,
					schemaColumns
				);

				expect(result.sqlText).toContain('ON CONFLICT ("id") DO UPDATE SET');
				expect(result.sqlText).toContain('RETURNING "id", "name"');
			});

			it('should work with asterisk and ON CONFLICT', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					true,
					primaryKeyColumns,
					conflictUpdateAssignments,
					'*',
					schemaColumns
				);

				expect(result.sqlText).toContain('ON CONFLICT ("id") DO UPDATE SET');
				expect(result.sqlText).toContain('RETURNING *');
			});
		});

		describe('returnField undefined', () => {
			it('should not include RETURNING clause when returnField is undefined', () => {
				const result = buildInsertSqlQuery(
					tableName,
					columnsForInsert,
					valuesForInsert,
					false,
					primaryKeyColumns,
					[],
					undefined,
					schemaColumns
				);

				expect(result.sqlText).not.toContain('RETURNING');
			});
		});
	});

	describe('UPDATE queries', () => {
		describe('returnField with single field', () => {
			it('should generate correct RETURNING clause for a single field', () => {
				const result = buildUpdateSqlQuery(
					tableName,
					columnsForUpdate,
					valuesForUpdate,
					whereClause,
					whereValues,
					'id' as any,
					schemaColumns
				);

				expect(result.sqlText).toContain('RETURNING "id"');
				expect(result.sqlText).not.toContain('RETURNING *');
				expect(result.values).toEqual([...valuesForUpdate, ...whereValues]);
			});
		});

		describe('returnField with array of fields', () => {
			it('should generate correct RETURNING clause for multiple fields', () => {
				const result = buildUpdateSqlQuery(
					tableName,
					columnsForUpdate,
					valuesForUpdate,
					whereClause,
					whereValues,
					['id', 'name', 'email'] as any,
					schemaColumns
				);

				expect(result.sqlText).toContain('RETURNING "id", "name", "email"');
				expect(result.sqlText).not.toContain('RETURNING *');
			});

			it('should handle single field array correctly', () => {
				const result = buildUpdateSqlQuery(
					tableName,
					columnsForUpdate,
					valuesForUpdate,
					whereClause,
					whereValues,
					['name'] as any,
					schemaColumns
				);

				expect(result.sqlText).toContain('RETURNING "name"');
				expect(result.sqlText).not.toContain('RETURNING "name",');
			});

			it('should handle empty array as no RETURNING clause', () => {
				const result = buildUpdateSqlQuery(
					tableName,
					columnsForUpdate,
					valuesForUpdate,
					whereClause,
					whereValues,
					[] as any,
					schemaColumns
				);

				expect(result.sqlText).not.toContain('RETURNING');
			});
		});

		describe('returnField with asterisk (*)', () => {
			it('should generate RETURNING * for asterisk', () => {
				const result = buildUpdateSqlQuery(
					tableName,
					columnsForUpdate,
					valuesForUpdate,
					whereClause,
					whereValues,
					'*',
					schemaColumns
				);

				expect(result.sqlText).toContain('RETURNING *');
				expect(result.sqlText).not.toContain('RETURNING "*"');
			});
		});

		describe('returnField undefined', () => {
			it('should not include RETURNING clause when returnField is undefined', () => {
				const result = buildUpdateSqlQuery(
					tableName,
					columnsForUpdate,
					valuesForUpdate,
					whereClause,
					whereValues,
					undefined,
					schemaColumns
				);

				expect(result.sqlText).not.toContain('RETURNING');
			});
		});
	});

	describe('SQL generation edge cases', () => {
		it('should properly escape field names with special characters', () => {
			const result = buildInsertSqlQuery(
				tableName,
				columnsForInsert,
				valuesForInsert,
				false,
				primaryKeyColumns,
				[],
				['user-id', 'first name'] as any,
				schemaColumns
			);

			expect(result.sqlText).toContain('RETURNING "user-id", "first name"');
		});

		it('should maintain correct parameter numbering', () => {
			const result = buildUpdateSqlQuery(
				tableName,
				columnsForUpdate,
				valuesForUpdate,
				'WHERE "id" = $1', // Original WHERE clause with $1
				whereValues,
				['id', 'name'] as any,
				schemaColumns
			);

			// Check that WHERE clause parameters are correctly offset after SET parameters
			// Since we have 2 SET parameters ($1, $2), WHERE clause $1 becomes $3
			expect(result.sqlText).toContain('WHERE "id" = $3');
			expect(result.sqlText).toContain('SET "name" = $1, "email" = $2');
		});
	});
});

describe('returnField validation', () => {
	const schemaColumns = {
		id: {type: 'INTEGER'},
		name: {type: 'TEXT'},
		email: {type: 'TEXT'},
		status: {type: 'TEXT'},
	};
	const columnsForInsert: UniqueArray<string[]> = ['name', 'email'] as UniqueArray<string[]>;
	const primaryKeyColumns: UniqueArray<string[]> = ['id'] as UniqueArray<string[]>;
	const injected = 'id"; DROP TABLE users; --';

	it('rejects a value with a double quote in an insert', () => {
		expect(() =>
			buildInsertSqlQuery(
				'users',
				columnsForInsert,
				['John', 'john@example.com'],
				false,
				primaryKeyColumns,
				[],
				injected as any,
				schemaColumns
			)
		).toThrow(/Invalid returnField/);
	});

	it('rejects a value with a double quote in an update', () => {
		expect(() =>
			buildUpdateSqlQuery(
				'users',
				columnsForInsert,
				['John', 'john@example.com'],
				'WHERE "id" = $1',
				[1],
				injected as any,
				schemaColumns
			)
		).toThrow(/Invalid returnField/);
	});

	it('rejects one bad name inside a list', () => {
		expect(() => returningClause(['id', injected], schemaColumns)).toThrow(/Invalid returnField/);
	});

	it('rejects a name that is not a column of the table definition', () => {
		expect(() => returningClause('password', schemaColumns)).toThrow(/Invalid returnField: password/);
		// Inherited object properties are not columns.
		expect(() => returningClause('constructor', schemaColumns)).toThrow(/Invalid returnField/);
		expect(() => returningClause(['*'], schemaColumns)).toThrow(/Invalid returnField/);
		expect(() => returningClause(1, schemaColumns)).toThrow(/Invalid returnField/);
	});

	it("keeps the SQL of '*', one column and a list as it was", () => {
		expect(returningClause('*', schemaColumns)).toBe('RETURNING *');
		expect(returningClause('id', schemaColumns)).toBe('RETURNING "id"');
		expect(returningClause(['id', 'name'], schemaColumns)).toBe('RETURNING "id", "name"');
		expect(returningClause(undefined, schemaColumns)).toBe('');
		expect(returningClause([], schemaColumns)).toBe('');

		const insert = (returnField: any) =>
			buildInsertSqlQuery(
				'users',
				columnsForInsert,
				['John', 'john@example.com'],
				false,
				primaryKeyColumns,
				[],
				returnField,
				schemaColumns
			).sqlText;
		expect(insert('*')).toBe('INSERT INTO users ("name", "email")\nVALUES ($1, $2)\nRETURNING *;');
		expect(insert('id')).toBe('INSERT INTO users ("name", "email")\nVALUES ($1, $2)\nRETURNING "id";');
		expect(insert(['id', 'name'])).toBe(
			'INSERT INTO users ("name", "email")\nVALUES ($1, $2)\nRETURNING "id", "name";'
		);

		const update = (returnField: any) =>
			buildUpdateSqlQuery(
				'users',
				columnsForInsert,
				['John', 'john@example.com'],
				'WHERE "id" = $1',
				[1],
				returnField,
				schemaColumns
			).sqlText;
		expect(update('*')).toBe('UPDATE users\nSET "name" = $1, "email" = $2\nWHERE "id" = $3\nRETURNING *;');
		expect(update('id')).toBe('UPDATE users\nSET "name" = $1, "email" = $2\nWHERE "id" = $3\nRETURNING "id";');
		expect(update(['id', 'name'])).toBe(
			'UPDATE users\nSET "name" = $1, "email" = $2\nWHERE "id" = $3\nRETURNING "id", "name";'
		);
	});
});
