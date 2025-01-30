import { setupTests, dbpg, usersTable } from './test-setup';
describe('PGLightQuery - Advanced Query Operations', () => {
    setupTests();
    it('gets users whose name contains a specific string', async () => {
        const nameSubstring = '%Doe%';
        const expectedResult = [
            { id: 1, name: 'John Doe', email: 'john.doe@example.com' },
            { id: 2, name: 'Jane Doe', email: 'jane.doe@example.com' },
        ];
        dbpg.query.mockResolvedValue({ rows: expectedResult });
        const result = await usersTable.selectUsers({ 'name.like': nameSubstring }, ['id', 'name', 'email']);
        expect(result).toEqual(expectedResult);
    });
    it('handles object params with nested properties correctly', async () => {
        const objParams = { 'address.neighborhood': 'COPACABANA' };
        const expectedResult = [
            {
                id: 1,
                name: 'John Doe',
                email: 'john.doe@example.com',
                addresses: [
                    {
                        id: 1,
                        street: 'Av Atlantica',
                        neighborhood: 'COPACABANA',
                        city: 'Rio de Janeiro',
                        userId: '1',
                    },
                ],
            },
            {
                id: 2,
                name: 'Rita Ora',
                email: 'rita.ora@example.com',
                addresses: [
                    {
                        id: 2,
                        street: 'Rua Bolivar',
                        neighborhood: 'COPACABANA',
                        city: 'Rio de Janeiro',
                        userId: '2',
                    },
                ],
            },
        ];
        dbpg.query.mockResolvedValue({ rows: expectedResult });
        const result = await usersTable.selectUserDetails(objParams, '*');
        expect(result).toEqual(expectedResult);
    });
    // it('gets users whose id is in a specific set', async () => {
    // 	const ids = ['1', '3', '5'];
    // 	const expectedResult = [
    // 		{id: 1, name: 'John Doe', email: 'john.doe@example.com'},
    // 		{id: 3, name: 'Alice Smith', email: 'alice.smith@example.com'},
    // 		{id: 5, name: 'Bob Johnson', email: 'bob.johnson@example.com'},
    // 	];
    // 	(dbpg.query as jest.Mock).mockResolvedValue({rows: expectedResult});
    // 	const result = await usersTable.selectUsers({'id.in': ids.join(',')}, ['id', 'name', 'email']);
    // 	const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    // 	const expectedSql = `SELECT "id", "name", "email" FROM "users" WHERE "id" IN (${placeholders})`;
    // 	expect(dbpg.query).toHaveBeenCalledWith(expectedSql, ids);
    // 	expect(result).toEqual(expectedResult);
    // });
});
