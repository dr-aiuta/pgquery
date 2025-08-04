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
});
