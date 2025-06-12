import {setupTests, dbpg, usersTable} from '../pg-lightquery/test-setup';

describe('Security - SQL Injection Prevention', () => {
	setupTests();

	it('prevents SQL injection in WHERE clause', async () => {
		const maliciousInput = "1'; DROP TABLE users; --";
		const expectedResult: any[] = [];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers({id: maliciousInput}, ['id', 'name', 'email']);

		// Verify that the query was parameterized
		expect(dbpg.query).toHaveBeenCalledWith(
			expect.stringMatching(/WHERE.*\$1/),
			expect.arrayContaining([maliciousInput])
		);
		expect(result).toEqual(expectedResult);
	});

	it('prevents SQL injection in LIKE clause', async () => {
		const maliciousInput = "%'; DROP TABLE users; --";
		const expectedResult: any[] = [];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers({'name.like': maliciousInput}, ['id', 'name', 'email']);

		// Verify that the query was parameterized
		expect(dbpg.query).toHaveBeenCalledWith(
			expect.stringMatching(/LIKE.*\$1/),
			expect.arrayContaining([maliciousInput])
		);
		expect(result).toEqual(expectedResult);
	});

	it('prevents SQL injection in ORDER BY clause', async () => {
		const maliciousInput = 'name; DROP TABLE users; --';
		const expectedResult: any[] = [];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers({'name.orderBy': maliciousInput}, ['id', 'name', 'email']);

		// The query should either fail or ignore the malicious input
		expect(dbpg.query).toHaveBeenCalledWith(expect.stringMatching(/ORDER BY.*"name"/), expect.any(Array));
		expect(result).toEqual(expectedResult);
	});
});
