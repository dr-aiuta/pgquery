import {DatabaseOperations} from '../../../src/core/database-operations';
import UsersTable from '../../tables/entities/UsersTable';
import {
	describeLive,
	createLiveSchema,
	dropLiveSchema,
	fixtureTablesDdl,
	userSettingsTable,
	userSettingsDdl,
	LiveSchema,
} from './live-setup';

describeLive('live: filters, sorting and paging', () => {
	let schema: LiveSchema;
	const usersTable = new UsersTable();
	const userSettingsDb = new DatabaseOperations(userSettingsTable);

	// name, email, createdAt. The ids are 1 to 5 in this order.
	const seed: [string, string | null, string][] = [
		['Ann', 'ann@example.com', '2024-03-15 12:00:00'],
		['Bob', 'bob@example.com', '2024-06-15 12:00:00'],
		['Ann', 'ann.two@example.com', '2025-02-01 12:00:00'],
		['Carol', null, '2023-07-01 12:00:00'],
		['Dave', 'dave@sample.org', '2024-09-30 12:00:00'],
	];

	const names = (rows: {name?: string}[]) => rows.map((row) => row.name);
	const ids = (rows: {id?: number}[]) => rows.map((row) => row.id);

	beforeAll(async () => {
		schema = await createLiveSchema([...fixtureTablesDdl, userSettingsDdl]);
		for (const [name, email, createdAt] of seed) {
			await schema.admin.query('INSERT INTO users (name, email, "createdAt") VALUES ($1, $2, $3)', [
				name,
				email,
				createdAt,
			]);
		}
		await schema.admin.query(
			`INSERT INTO user_settings ("userId", settings) VALUES (1, '{"theme": "dark", "lang": "en"}'), (2, '{"theme": "light"}'), (3, NULL)`
		);
	});

	afterAll(async () => {
		await dropLiveSchema(schema);
	});

	describe('sorting and paging', () => {
		it('sorts by two columns, in the order of the object keys', async () => {
			const byNameThenNewest = await usersTable
				.selectUsers(['id', 'name'], {where: {'name.orderBy': 'ASC', 'id.orderBy': 'DESC'}})
				.execute();
			expect(byNameThenNewest.map((row) => [row.name, row.id])).toEqual([
				['Ann', 3],
				['Ann', 1],
				['Bob', 2],
				['Carol', 4],
				['Dave', 5],
			]);

			const byNewestThenName = await usersTable
				.selectUsers(['id', 'name'], {where: {'id.orderBy': 'DESC', 'name.orderBy': 'ASC'}})
				.execute();
			expect(ids(byNewestThenName)).toEqual([5, 4, 3, 2, 1]);
		});

		it('pages with limit and offset', async () => {
			const page = (offset: number) =>
				usersTable.selectUsers(['id', 'name'], {where: {'id.orderBy': 'ASC', limit: 2, offset} as any}).execute();

			expect(ids(await page(0))).toEqual([1, 2]);
			expect(ids(await page(2))).toEqual([3, 4]);
			expect(ids(await page(4))).toEqual([5]);
		});

		it('pages a filtered select, with the values given as strings', async () => {
			const rows = await usersTable
				.selectUsers(['id', 'name'], {where: {name: 'Ann', 'id.orderBy': 'ASC', limit: '1', offset: '1'} as any})
				.execute();

			expect(rows).toEqual([{id: 3, name: 'Ann'}]);
		});

		it('pages selectWithCustomSchema with an explicit column list', async () => {
			const rows = await usersTable
				.selectUserDetails(['id', 'name'], {where: {'id.orderBy': 'ASC', limit: 2, offset: 1} as any})
				.execute();

			expect(ids(rows)).toEqual([2, 3]);
		});
	});

	describe('where operators', () => {
		const select = (where: Record<string, unknown>) =>
			usersTable.selectUsers(['id', 'name', 'email', 'createdAt'], {where: {...where, 'id.orderBy': 'ASC'} as any}).execute();

		it('.not', async () => {
			expect(names(await select({'name.not': 'Ann'}))).toEqual(['Bob', 'Carol', 'Dave']);
		});

		it('.like', async () => {
			expect(ids(await select({'email.like': '%@example.com'}))).toEqual([1, 2, 3]);
		});

		it('.in with an array and with a comma-separated string', async () => {
			expect(ids(await select({'id.in': [1, 3, 5]}))).toEqual([1, 3, 5]);
			expect(ids(await select({'id.in': '2,4'}))).toEqual([2, 4]);
			expect(names(await select({'name.in': ['Bob', 'Dave']}))).toEqual(['Bob', 'Dave']);
		});

		it('.null', async () => {
			expect(names(await select({'email.null': 'true'}))).toEqual(['Carol']);
			expect(ids(await select({'email.null': 'false'}))).toEqual([1, 2, 3, 5]);
		});

		it('a null value', async () => {
			expect(names(await select({email: null}))).toEqual(['Carol']);
		});

		it('.startDate and .endDate', async () => {
			const in2024 = await select({'createdAt.startDate': '2024-01-01', 'createdAt.endDate': '2024-12-31'});
			expect(ids(in2024)).toEqual([1, 2, 5]);

			expect(ids(await select({'createdAt.startDate': '2024-08-01'}))).toEqual([3, 5]);
			expect(ids(await select({'createdAt.endDate': '2024-01-01'}))).toEqual([4]);
		});

		it('a JSON key', async () => {
			const dark = await userSettingsDb
				.select({allowedColumns: '*', options: {where: {settings: {theme: 'dark'}} as any, columnsToReturn: ['userId']}})
				.execute();
			expect(dark).toEqual([{userId: 1}]);

			const darkEnglish = await userSettingsDb
				.select({
					allowedColumns: '*',
					options: {where: {settings: {theme: 'dark', lang: 'en'}} as any, columnsToReturn: ['userId']},
				})
				.execute();
			expect(darkEnglish).toEqual([{userId: 1}]);

			const lightEnglish = await userSettingsDb
				.select({
					allowedColumns: '*',
					options: {where: {settings: {theme: 'light', lang: 'en'}} as any, columnsToReturn: ['userId']},
				})
				.execute();
			expect(lightEnglish).toEqual([]);
		});
	});
});
