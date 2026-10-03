import {DatabaseOperations} from '../../../src/core/database-operations';
import {TableDefinition} from '../../../src/types/core-types';
import UsersTable from '../../tables/entities/UsersTable';
import {UsersSchema, usersColumns} from '../../tables/definitions/users';
import {
	describeLive,
	createLiveSchema,
	dropLiveSchema,
	fixtureTablesDdl,
	postTagsTable,
	postTagsDdl,
	visitsTable,
	visitsDdl,
	LiveSchema,
} from './live-setup';

const usersTableDefinition: TableDefinition<UsersSchema> = {
	tableName: 'users',
	schema: {columns: usersColumns},
};

describeLive('live: inserts, upserts and updates', () => {
	let schema: LiveSchema;
	const usersTable = new UsersTable();
	const usersDb = new DatabaseOperations(usersTableDefinition);
	const postTagsDb = new DatabaseOperations(postTagsTable);
	const visitsDb = new DatabaseOperations(visitsTable);

	beforeAll(async () => {
		schema = await createLiveSchema([...fixtureTablesDdl, postTagsDdl, visitsDdl]);
	});

	afterAll(async () => {
		await dropLiveSchema(schema);
	});

	it('round-trips an insert, a select and an update', async () => {
		const [inserted] = await usersTable
			.insertUser(['name', 'email'], {
				data: {name: 'John Doe', email: 'john.doe@example.com'},
				returnField: 'id',
				idUser: 'tester',
			})
			.execute();
		expect(inserted.id).toEqual(expect.any(Number));

		const [selected] = await usersTable.selectUsers(['id', 'name', 'email'], {where: {id: inserted.id}}).execute();
		expect(selected).toEqual({id: inserted.id, name: 'John Doe', email: 'john.doe@example.com'});

		const updated = await usersTable
			.updateUser(['name'], {data: {name: 'John Updated'}, where: {id: inserted.id}, returnField: 'id', idUser: 'editor'})
			.execute();
		expect(updated).toEqual([{id: inserted.id}]);

		const stored = await schema.admin.query('SELECT name, email, "lastChangedBy" FROM users WHERE id = $1', [
			inserted.id,
		]);
		expect(stored.rows).toEqual([{name: 'John Updated', email: 'john.doe@example.com', lastChangedBy: 'editor'}]);
	});

	describe('upserts', () => {
		it('upserts on a two-column primary key', async () => {
			const upsert = (note: string) =>
				postTagsDb
					.insert({
						allowedColumns: '*',
						options: {data: {postId: 1, tag: 'news', note}, onConflict: true, returnField: '*'},
					})
					.execute();

			expect(await upsert('first')).toEqual([{postId: 1, tag: 'news', note: 'first'}]);
			expect(await upsert('second')).toEqual([{postId: 1, tag: 'news', note: 'second'}]);

			const stored = await schema.admin.query('SELECT "postId", tag, note FROM post_tags');
			expect(stored.rows).toEqual([{postId: 1, tag: 'news', note: 'second'}]);
		});

		it('does nothing on conflict when the data holds only the key', async () => {
			const upsertKeyOnly = () =>
				postTagsDb
					.insert({
						allowedColumns: '*',
						options: {data: {postId: 2, tag: 'draft'}, onConflict: true, returnField: '*'},
					})
					.execute();

			expect(await upsertKeyOnly()).toEqual([{postId: 2, tag: 'draft', note: null}]);
			// The second call conflicts, changes nothing and returns no row.
			expect(await upsertKeyOnly()).toEqual([]);

			const stored = await schema.admin.query('SELECT count(*)::int AS count FROM post_tags WHERE "postId" = 2');
			expect(stored.rows).toEqual([{count: 1}]);
		});

		it('inserts a row of defaults when the data is empty', async () => {
			const [first] = await visitsDb.insert({allowedColumns: '*', options: {data: {}, returnField: '*'}}).execute();
			const [second] = await visitsDb.insert({allowedColumns: '*', options: {data: {}, returnField: 'id'}}).execute();

			expect(first.id).toEqual(expect.any(Number));
			expect(first.createdAt).toBeInstanceOf(Date);
			expect(second).toEqual({id: (first.id as number) + 1});
		});
	});

	describe('returnField', () => {
		it("returns '*', one column or a list of columns from an insert", async () => {
			const insert = (email: string, returnField: any) =>
				usersDb.insert({allowedColumns: ['name', 'email'], options: {data: {name: 'Return', email}, returnField}}).execute();

			const [all] = await insert('return-all@example.com', '*');
			expect(Object.keys(all).sort()).toEqual(['createdAt', 'email', 'id', 'lastChangedBy', 'name', 'updatedAt']);

			const [one] = await insert('return-one@example.com', 'email');
			expect(one).toEqual({email: 'return-one@example.com'});

			const [list] = await insert('return-list@example.com', ['name', 'email']);
			expect(list).toEqual({name: 'Return', email: 'return-list@example.com'});

			expect(await insert('return-none@example.com', undefined)).toEqual([]);
		});

		it('returns a list of columns from an update', async () => {
			const updated = await usersDb
				.update({
					allowedColumns: ['name'],
					options: {data: {name: 'Returned'}, where: {email: 'return-one@example.com'}, returnField: ['name', 'email']},
				})
				.execute();

			expect(updated).toEqual([{name: 'Returned', email: 'return-one@example.com'}]);
		});

		it('rejects a returnField that is not a column, before anything reaches the database', async () => {
			const injected = 'id"; DROP TABLE users; --' as any;

			expect(() =>
				usersDb.insert({allowedColumns: ['name'], options: {data: {name: 'Mallory'}, returnField: injected}})
			).toThrow(/Invalid returnField/);
			expect(() =>
				usersDb.update({
					allowedColumns: ['name'],
					options: {data: {name: 'Mallory'}, where: {id: 1}, returnField: injected},
				})
			).toThrow(/Invalid returnField/);

			const stored = await schema.admin.query(`SELECT count(*)::int AS count FROM users WHERE name = 'Mallory'`);
			expect(stored.rows).toEqual([{count: 0}]);
		});
	});
});
