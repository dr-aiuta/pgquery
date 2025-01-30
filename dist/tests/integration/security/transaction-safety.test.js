"use strict";
// import {setupTests, dbpg, usersTable} from '../pg-lightquery/test-setup';
// describe('Security - Transaction Safety', () => {
// 	setupTests();
// 	it('rolls back transaction on error', async () => {
// 		const error = new Error('Query failed');
// 		(dbpg.query as jest.Mock)
// 			.mockResolvedValueOnce({rows: []}) // BEGIN
// 			.mockRejectedValueOnce(error) // First query fails
// 			.mockResolvedValueOnce({rows: []}); // ROLLBACK
// 		const transaction = [
// 			{
// 				sqlText: 'INSERT INTO users(name, email) VALUES($1, $2)',
// 				valuesToBeInserted: ['John', 'john@example.com'],
// 			},
// 			{
// 				sqlText: 'UPDATE users SET name = $1 WHERE id = $2',
// 				valuesToBeInserted: ['Jane', 1],
// 			},
// 		];
// 		await expect(usersTable.transaction(transaction).execute()).rejects.toThrow(error);
// 		// Verify that ROLLBACK was called
// 		expect(dbpg.query).toHaveBeenCalledWith('ROLLBACK');
// 	});
// 	it('prevents transaction interleaving', async () => {
// 		const expectedResults = [
// 			{rows: []}, // BEGIN
// 			{rows: [{id: 1}]}, // First query
// 			{rows: [{id: 2}]}, // Second query
// 			{rows: []}, // COMMIT
// 		];
// 		(dbpg.query as jest.Mock).mockImplementation((query) => {
// 			return Promise.resolve(expectedResults.shift());
// 		});
// 		const transaction = [
// 			{
// 				sqlText: 'INSERT INTO users(name, email) VALUES($1, $2)',
// 				valuesToBeInserted: ['John', 'john@example.com'],
// 			},
// 			{
// 				sqlText: 'INSERT INTO users(name, email) VALUES($1, $2)',
// 				valuesToBeInserted: ['Jane', 'jane@example.com'],
// 			},
// 		];
// 		await usersTable.transaction(transaction).execute();
// 		// Verify transaction isolation
// 		expect(dbpg.query).toHaveBeenCalledWith('BEGIN');
// 		expect(dbpg.query).toHaveBeenCalledWith('COMMIT');
// 	});
// });
