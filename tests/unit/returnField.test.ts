import {buildInsertSqlQuery, buildUpdateSqlQuery} from '../../src/utils/query-builder';
import {UniqueArray} from '../../src/types/utility-types';
import {ColumnDefinition} from '../../src/types/core-types';

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
					'id' as any
				);

				expect(result.sqlText).toContain('RETURNING "id"');
				expect(result.sqlText).not.toContain('RETURNING *');
				expect(result.values).toEqual(valuesForInsert);
			});
		});

		describe('returnField with array of fields', () => {
			it('should generate correct RETURNING clause for multiple fields', () => {
				const result = buildInsertSqlQuery(tableName, columnsForInsert, valuesForInsert, false, primaryKeyColumns, [], [
					'id',
					'name',
					'email',
				] as any);

				expect(result.sqlText).toContain('RETURNING "id", "name", "email"');
				expect(result.sqlText).not.toContain('RETURNING *');
				expect(result.values).toEqual(valuesForInsert);
			});

			it('should handle single field array correctly', () => {
				const result = buildInsertSqlQuery(tableName, columnsForInsert, valuesForInsert, false, primaryKeyColumns, [], [
					'id',
				] as any);

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
					[] as any
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
					'*'
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
					'id' as any
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
					['id', 'name'] as any
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
					'*'
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
					undefined
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
					'id' as any
				);

				expect(result.sqlText).toContain('RETURNING "id"');
				expect(result.sqlText).not.toContain('RETURNING *');
				expect(result.values).toEqual([...valuesForUpdate, ...whereValues]);
			});
		});

		describe('returnField with array of fields', () => {
			it('should generate correct RETURNING clause for multiple fields', () => {
				const result = buildUpdateSqlQuery(tableName, columnsForUpdate, valuesForUpdate, whereClause, whereValues, [
					'id',
					'name',
					'email',
				] as any);

				expect(result.sqlText).toContain('RETURNING "id", "name", "email"');
				expect(result.sqlText).not.toContain('RETURNING *');
			});

			it('should handle single field array correctly', () => {
				const result = buildUpdateSqlQuery(tableName, columnsForUpdate, valuesForUpdate, whereClause, whereValues, [
					'name',
				] as any);

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
					[] as any
				);

				expect(result.sqlText).not.toContain('RETURNING');
			});
		});

		describe('returnField with asterisk (*)', () => {
			it('should generate RETURNING * for asterisk', () => {
				const result = buildUpdateSqlQuery(tableName, columnsForUpdate, valuesForUpdate, whereClause, whereValues, '*');

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
					undefined
				);

				expect(result.sqlText).not.toContain('RETURNING');
			});
		});
	});

	describe('SQL generation edge cases', () => {
		it('should properly escape field names with special characters', () => {
			const result = buildInsertSqlQuery(tableName, columnsForInsert, valuesForInsert, false, primaryKeyColumns, [], [
				'user-id',
				'first name',
			] as any);

			expect(result.sqlText).toContain('RETURNING "user-id", "first name"');
		});

		it('should maintain correct parameter numbering', () => {
			const result = buildUpdateSqlQuery(
				tableName,
				columnsForUpdate,
				valuesForUpdate,
				'WHERE "id" = $1', // Original WHERE clause with $1
				whereValues,
				['id', 'name'] as any
			);

			// Check that WHERE clause parameters are correctly offset after SET parameters
			// Since we have 2 SET parameters ($1, $2), WHERE clause $1 becomes $3
			expect(result.sqlText).toContain('WHERE "id" = $3');
			expect(result.sqlText).toContain('SET "name" = $1, "email" = $2');
		});
	});
});
