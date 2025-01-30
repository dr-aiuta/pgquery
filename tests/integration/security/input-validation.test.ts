// import {setupTests, dbpg, usersTable} from '../pg-lightquery/test-setup';

// describe('Security - Input Validation', () => {
// 	setupTests();

// 	it('handles null values safely', async () => {
// 		const expectedResult = [];
// 		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

// 		const result = await usersTable.selectUsers({email: null}, ['id', 'name', 'email']);

// 		expect(dbpg.query).toHaveBeenCalledWith(expect.stringMatching(/WHERE.*IS NULL/), expect.any(Array));
// 		expect(result).toEqual(expectedResult);
// 	});

// 	it('handles undefined values safely', async () => {
// 		const expectedResult = [];
// 		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

// 		const result = await usersTable.selectUsers({email: undefined}, ['id', 'name', 'email']);

// 		// Undefined values should be ignored in the query
// 		expect(dbpg.query).toHaveBeenCalledWith(expect.not.stringMatching(/WHERE.*email/), expect.any(Array));
// 		expect(result).toEqual(expectedResult);
// 	});

// 	it('sanitizes special characters in JSON operations', async () => {
// 		const maliciousJson = {
// 			'malicious": (SELECT * FROM users); --': 'value',
// 		};
// 		const expectedResult = [];

// 		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

// 		const result = await usersTable.selectUsers({metadata: maliciousJson}, ['id', 'name', 'email']);

// 		// Verify that the JSON operation is properly escaped
// 		expect(dbpg.query).toHaveBeenCalledWith(expect.stringMatching(/\$1/), expect.any(Array));
// 		expect(result).toEqual(expectedResult);
// 	});
// });
