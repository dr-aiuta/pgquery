import {setupTests, dbpg, usersTable} from '../pg-lightquery/test-setup';

describe('Security - SQL Injection Prevention', () => {
	setupTests();

	it('prevents SQL injection in insert operations', async () => {
		const maliciousData = {
			name: "'; DROP TABLE users; --",
			email: 'hacker@evil.com',
		};
		const expectedResult = [{id: 1, name: maliciousData.name, email: maliciousData.email}];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const insertResult = usersTable.insertUser(['name', 'email'], {
			data: maliciousData,
			returnField: 'id',
		});

		// Test that the query is properly parameterized
		expect(insertResult.query.sqlText).toMatch(/\$1.*\$2.*\$3/);
		expect(insertResult.query.sqlText).not.toContain(maliciousData.name);
		expect(insertResult.query.sqlText).not.toContain('DROP TABLE');
		expect(insertResult.query.values).toEqual([maliciousData.name, maliciousData.email, 'SERVER']);

		const result = await insertResult.execute();
		expect(result).toEqual(expectedResult);
	});

	it('prevents SQL injection in select operations', async () => {
		const maliciousInput = "1'; DROP TABLE users; --";
		const expectedResult: any[] = [];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const selectResult = usersTable.selectUsers(['id', 'name', 'email'], {
			where: {id: maliciousInput},
		});

		// Test that the query is properly parameterized
		expect(selectResult.query.sqlText).toMatch(/\$\d+/);
		expect(selectResult.query.sqlText).not.toContain('DROP TABLE');
		expect(selectResult.query.values).toContain(maliciousInput);

		const result = await selectResult.execute();
		expect(result).toEqual(expectedResult);
	});

	it('prevents injection in LIKE operations', async () => {
		const maliciousPattern = "%'; DROP TABLE users; --";
		const expectedResult: any[] = [];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const selectResult = usersTable.selectUsers(['id', 'name'], {
			where: {'name.like': maliciousPattern},
		});

		// Verify parameterized query
		expect(selectResult.query.sqlText).toMatch(/LIKE \$\d+/);
		expect(selectResult.query.sqlText).not.toContain('DROP TABLE');
		expect(selectResult.query.values).toContain(maliciousPattern);

		const result = await selectResult.execute();
		expect(result).toEqual(expectedResult);
	});

	it('prevents injection in IN operations', async () => {
		const maliciousIds = ["1'; DROP TABLE users; --", '2', '3'];
		const expectedResult: any[] = [];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		// NEW STANDARDIZED PATTERN:
		const selectResult = usersTable.selectUsers(['id', 'name'], {
			where: {'id.in': maliciousIds},
		});

		// Verify parameterized query with multiple placeholders
		expect(selectResult.query.sqlText).toMatch(/IN \(\$\d+, \$\d+, \$\d+\)/);
		expect(selectResult.query.sqlText).not.toContain('DROP TABLE');
		expect(selectResult.query.values).toEqual(maliciousIds);

		const result = await selectResult.execute();
		expect(result).toEqual(expectedResult);
	});

	// NEW TEST: Test transaction safety against injection
	it('prevents SQL injection in transaction operations', async () => {
		const maliciousData1 = {name: "'; DROP TABLE users; --", email: 'hack1@evil.com'};
		const maliciousData2 = {name: "'; DELETE FROM users; --", email: 'hack2@evil.com'};

		// NEW STANDARDIZED PATTERN - Transaction with injection attempts:
		const insert1 = usersTable.insertUser(['name', 'email'], {
			data: maliciousData1,
			returnField: 'id',
		});
		const insert2 = usersTable.insertUser(['name', 'email'], {
			data: maliciousData2,
			returnField: 'id',
		});

		const transaction = usersTable.transaction().add(insert1.query).add(insert2.query);

		// Verify both queries are properly parameterized
		expect(transaction.queries[0].sqlText).not.toContain('DROP TABLE');
		expect(transaction.queries[1].sqlText).not.toContain('DELETE FROM');
		expect(transaction.queries[0].values).toEqual([maliciousData1.name, maliciousData1.email, 'SERVER']);
		expect(transaction.queries[1].values).toEqual([maliciousData2.name, maliciousData2.email, 'SERVER']);

		// Mock transaction execution
		(dbpg.query as jest.Mock).mockResolvedValue({rows: []});
		await transaction.execute();

		expect(dbpg.query).toHaveBeenCalled();
	});

	// GHSA-m2wx-4cwh-cgw5: values and keys that used to be interpolated into the SQL text
	describe('GHSA-m2wx-4cwh-cgw5 regression', () => {
		describe('limit value', () => {
			it('rejects a limit that is not a non-negative integer', () => {
				const payloads = [
					'1; DELETE FROM users',
					'(SELECT pg_sleep(5))',
					'10 OFFSET 1',
					'-1',
					'1.5',
					'',
					null,
					true,
					{},
				];
				for (const limit of payloads) {
					expect(() => usersTable.selectUsers(['id', 'name'], {where: {limit} as any})).toThrow(/Invalid limit value/);
				}
			});

			it('accepts an integer limit given as a number or a numeric string', () => {
				const fromNumber = usersTable.selectUsers(['id', 'name'], {where: {limit: 10} as any});
				expect(fromNumber.query.sqlText).toMatch(/LIMIT 10$/);
				expect(fromNumber.query.values).toEqual([]);

				const fromString = usersTable.selectUsers(['id', 'name'], {where: {id: 1, limit: '25'} as any});
				expect(fromString.query.sqlText).toMatch(/WHERE "id" = \$1\s+LIMIT 25$/);
				expect(fromString.query.values).toEqual([1]);
			});
		});

		describe('orderBy direction', () => {
			it('rejects a direction outside ASC and DESC', () => {
				const payloads = ['ASC; DROP TABLE users', 'ASC, (SELECT pg_sleep(5))', 'ASCENDING', '', undefined, null, 1];
				for (const direction of payloads) {
					expect(() => usersTable.selectUsers(['id', 'name'], {where: {'name.orderBy': direction}})).toThrow(
						/Invalid orderBy direction/
					);
				}
			});

			it('accepts ASC and DESC in any case and normalizes them', () => {
				const asc = usersTable.selectUsers(['id', 'name'], {where: {'name.orderBy': 'asc'}});
				expect(asc.query.sqlText).toMatch(/ORDER BY "name" ASC$/);

				const desc = usersTable.selectUsers(['id', 'name'], {where: {'name.orderBy': 'DESC'}});
				expect(desc.query.sqlText).toMatch(/ORDER BY "name" DESC$/);
			});
		});

		describe('WHERE column names under the "*" wildcard', () => {
			const injectedKey = 'id" = $1 OR true OR "id';

			it('ignores a column name outside the table schema in select', () => {
				// select() expands '*' to the table schema before validation, so the key is dropped.
				const select = usersTable.selectUsers('*', {where: {[injectedKey]: 1} as any});
				expect(select.query.sqlText).not.toContain('OR true');
				expect(select.query.sqlText).not.toContain('WHERE');
				expect(select.query.values).toEqual([]);
			});

			it('rejects a column name that is not a plain identifier in selectWithCustomSchema', () => {
				expect(() => usersTable.selectUserDetails('*', {where: {[injectedKey]: 1} as any})).toThrow(
					/Invalid column name in query parameters/
				);
			});

			it('rejects a WHERE column outside the table schema in update, regardless of allowedColumns', () => {
				for (const where of [{[injectedKey]: 1}, {password: 'x'}]) {
					expect(() =>
						usersTable.updateUser(['name'], {
							data: {name: 'Jane'},
							where: where as any,
						})
					).toThrow(/Failed to generate WHERE clause|Invalid column name/);
				}
			});

			it('still accepts any schema column in the update WHERE clause', () => {
				const update = usersTable.updateUser(['name'], {
					data: {name: 'Jane'},
					where: {email: 'jane@example.com'},
				});
				expect(update.query.sqlText).toMatch(/WHERE "email" = \$\d+/);
				expect(update.query.values).toContain('jane@example.com');
			});
		});

		describe('nested JSON keys', () => {
			it('binds the JSON key as a parameter instead of interpolating it', () => {
				const injectedKey = 'theme\' = $1 OR true OR "posts" ->> \'theme';
				const select = usersTable.selectUserDetails(['posts'], {
					where: {posts: {[injectedKey]: 'x'}} as any,
				});

				expect(select.query.sqlText).toMatch(/"posts" ->> \$\d+ = \$\d+/);
				expect(select.query.sqlText).not.toContain("'theme");
				expect(select.query.sqlText).not.toContain('OR true');
				expect(select.query.values.slice(-2)).toEqual([injectedKey, 'x']);
			});
		});
	});
});
