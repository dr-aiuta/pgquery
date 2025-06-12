import {setupTests, dbpg, usersTable} from '../pg-lightquery/test-setup';

describe('Security - Input Validation', () => {
	setupTests();

	it('handles null values safely', async () => {
		const expectedResult: any[] = [];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers({email: null}, ['id', 'name', 'email']);

		expect(dbpg.query).toHaveBeenCalledWith(expect.stringMatching(/WHERE.*IS NULL/), expect.any(Array));
		expect(result).toEqual(expectedResult);
	});

	it('handles undefined values safely', async () => {
		const expectedResult: any[] = [];
		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers({email: undefined}, ['id', 'name', 'email']);

		// Undefined values are handled as parameters in the query
		expect(dbpg.query).toHaveBeenCalledWith(
			expect.stringMatching(/WHERE.*email.*\$1/),
			expect.arrayContaining([undefined])
		);
		expect(result).toEqual(expectedResult);
	});

	it('sanitizes special characters in string values', async () => {
		const maliciousInput = 'test"; DROP TABLE users; --';
		const expectedResult: any[] = [];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers({name: maliciousInput}, ['id', 'name', 'email']);

		// Verify that the query was parameterized
		expect(dbpg.query).toHaveBeenCalledWith(expect.stringMatching(/\$1/), expect.any(Array));
		expect(result).toEqual(expectedResult);
	});
});
