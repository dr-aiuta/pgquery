import {setupTests, dbpg, usersTable} from './test-setup';

describe('PGLightQuery - Date Range and Ordering', () => {
	setupTests();

	it('gets users ordered by createdAt within a date range', async () => {
		const startDate = '2023-01-01';
		const endDate = '2023-12-31';
		const expectedResult = [
			{id: 1, name: 'John Doe', email: 'john.doe@example.com', createdAt: new Date('2023-06-15T00:00:00Z')},
			{id: 2, name: 'Jane Doe', email: 'jane.doe@example.com', createdAt: new Date('2023-03-20T00:00:00Z')},
		];

		(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});

		const result = await usersTable.selectUsers(
			{
				'createdAt.startDate': startDate,
				'createdAt.endDate': endDate,
				'createdAt.orderBy': 'DESC',
			},
			['id', 'name', 'email', 'createdAt']
		);

		expect(result).toEqual(expectedResult);
	});
});
