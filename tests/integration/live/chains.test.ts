import {DatabaseError} from 'pg';
import {createChainedInsert} from '../../../src/chained-insert';
import {DatabaseOperations} from '../../../src/database-operations';
import {TableBase} from '../../../src/table-base';
import {sqlExpression} from '../../../src/sql/expression';
import {TableDefinition} from '../../../src/types';
import UsersTable from '../../tables/entities/UsersTable';
import PostsTable from '../../tables/entities/PostsTable';
import AddressesTable from '../../tables/entities/AddressesTable';
import {UsersSchema, usersColumns} from '../../tables/definitions/users';
import {PostsSchema, postsColumns} from '../../tables/definitions/posts';
import {AddressesSchema, addressesColumns} from '../../tables/definitions/addresses';
import {describeLive, createLiveSchema, dropLiveSchema, fixtureTablesDdl, countIdleInTransaction, LiveSchema} from './live-setup';

const usersDefinition: TableDefinition<UsersSchema> = {tableName: 'users', schema: {columns: usersColumns}};
const postsDefinition: TableDefinition<PostsSchema> = {tableName: 'posts', schema: {columns: postsColumns}};
const addressesDefinition: TableDefinition<AddressesSchema> = {tableName: 'addresses', schema: {columns: addressesColumns}};

// A table class that registers its related tables and names them in a chain.
class UsersWithRelations extends TableBase<UsersSchema> {
	constructor() {
		super(usersDefinition);
		this.registerRelatedTable('posts', {tableDefinition: postsDefinition});
		this.registerRelatedTable('addresses', {tableDefinition: addressesDefinition});
	}

	public createUserWithProfile(
		user: {name: string; email: string},
		post: {title: string; content: string},
		address?: {street: string; neighborhood: string; city: string}
	) {
		return this.createChainedInsert()
			.insert('new_user', this, user, {allowedColumns: ['name', 'email'], returnField: '*'})
			.insertIntoTableWithReference(
				'new_post',
				'posts',
				post,
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['title', 'content'], returnField: 'id'}
			)
			.insertIntoTableWithReferenceIf(
				address !== undefined,
				'new_address',
				'addresses',
				address ?? {},
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['street', 'neighborhood', 'city'], returnField: 'id'}
			)
			.selectFrom('new_user', ['id', 'name'])
			.build();
	}
}

describeLive('live: chained inserts and updates (0.5.1)', () => {
	let schema: LiveSchema;
	const usersTable = new UsersTable();
	const postsTable = new PostsTable();
	const addressesTable = new AddressesTable();

	const count = async (table: string, where = 'true') => {
		const result = await schema.admin.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${where}`);
		return result.rows[0].count as number;
	};

	beforeAll(async () => {
		schema = await createLiveSchema(fixtureTablesDdl);
	});

	afterAll(async () => {
		await dropLiveSchema(schema);
	});

	it('inserts a user, a post and an address in one statement, with table classes', async () => {
		const chain = createChainedInsert()
			.insert('new_user', usersTable, {name: 'Ann', email: 'ann@example.com'}, {allowedColumns: ['name', 'email'], returnField: '*'})
			.insertWithReference(
				'new_post',
				postsTable,
				{title: 'Hello', content: 'First post'},
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['title', 'content'], returnField: 'id'}
			)
			.insertWithReference(
				'new_address',
				addressesTable,
				{street: 'Main St', neighborhood: 'Centro', city: 'Rio'},
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['street', 'neighborhood', 'city'], returnField: 'id'}
			)
			.selectFrom('new_user')
			.build();

		expect(chain.queries).toHaveLength(1);
		const results = await chain.execute();

		// execute() resolves to an array of pg results. The first one holds the rows of the final SELECT.
		const user = results[0].rows[0];
		expect(user).toMatchObject({name: 'Ann', email: 'ann@example.com', lastChangedBy: 'SERVER'});
		expect(await count('posts', `"userId" = ${user.id} AND title = 'Hello'`)).toBe(1);
		expect(await count('addresses', `"userId" = ${user.id} AND city = 'Rio'`)).toBe(1);
	});

	it('runs name-based steps through a table class, and returns the selected columns', async () => {
		const users = new UsersWithRelations();

		const withAddress = await users
			.createUserWithProfile(
				{name: 'Bob', email: 'bob@example.com'},
				{title: 'Welcome', content: 'Hi'},
				{street: 'Rua A', neighborhood: 'Copacabana', city: 'Rio'}
			)
			.execute();
		const bob = withAddress[0].rows[0];
		expect(bob).toEqual({id: expect.any(Number), name: 'Bob'});
		expect(await count('addresses', `"userId" = ${bob.id}`)).toBe(1);

		const withoutAddress = await users
			.createUserWithProfile({name: 'Carol', email: 'carol@example.com'}, {title: 'Welcome', content: 'Hi'})
			.execute();
		const carol = withoutAddress[0].rows[0];
		expect(await count('posts', `"userId" = ${carol.id}`)).toBe(1);
		expect(await count('addresses', `"userId" = ${carol.id}`)).toBe(0);
	});

	it('runs an insert that references an earlier update', async () => {
		const [dave] = await usersTable
			.insertUser(['name', 'email'], {data: {name: 'Dave', email: 'dave@example.com'}, returnField: 'id'})
			.execute();

		// The update is called first, so it is written first and the insert can read its result.
		const chain = createChainedInsert()
			.update('renamed', usersTable, {name: 'Dave Renamed'}, {id: dave.id}, {allowedColumns: ['name'], returnField: 'id'})
			.insertWithReference(
				'new_post',
				postsTable,
				{title: 'After the rename', content: 'x'},
				{from: 'renamed', field: 'id', to: 'userId'},
				{allowedColumns: ['title', 'content'], returnField: '*'}
			)
			.selectFrom('new_post', ['id', 'userId', 'title'])
			.build();
		const results = await chain.execute();

		expect(results[0].rows).toEqual([{id: expect.any(Number), userId: dave.id, title: 'After the rename'}]);
		const stored = await schema.admin.query('SELECT name FROM users WHERE id = $1', [dave.id]);
		expect(stored.rows).toEqual([{name: 'Dave Renamed'}]);
	});

	it('runs an update that references an earlier insert', async () => {
		const [eve] = await usersTable
			.insertUser(['name', 'email'], {data: {name: 'Eve', email: 'eve@example.com'}, returnField: 'id'})
			.execute();
		const [post] = await postsTable
			.insertPost(['userId', 'title', 'content'], {data: {userId: eve.id, title: 'Mine', content: 'x'}, returnField: 'id'})
			.execute();

		const chain = createChainedInsert()
			.insert('new_owner', usersTable, {name: 'Fay', email: 'fay@example.com'}, {allowedColumns: ['name', 'email'], returnField: 'id'})
			.updateWithReference(
				'moved_post',
				postsTable,
				{title: 'Now hers'},
				{id: post.id},
				{from: 'new_owner', field: 'id', to: 'userId'},
				{allowedColumns: ['title'], returnField: '*'}
			)
			.selectFrom('moved_post', ['title', 'userId'])
			.build();
		const results = await chain.execute();

		const fay = await schema.admin.query(`SELECT id FROM users WHERE email = 'fay@example.com'`);
		expect(results[0].rows).toEqual([{title: 'Now hers', userId: fay.rows[0].id}]);
	});

	it('keeps ON CONFLICT on a referenced insert, so the step upserts', async () => {
		const [gus] = await usersTable
			.insertUser(['name', 'email'], {data: {name: 'Gus', email: 'gus@example.com'}, returnField: 'id'})
			.execute();
		const [existing] = await postsTable
			.insertPost(['userId', 'title', 'content'], {data: {userId: gus.id, title: 'Old title', content: 'old'}, returnField: 'id'})
			.execute();

		const chain = createChainedInsert()
			.insert('new_owner', usersTable, {name: 'Hal', email: 'hal@example.com'}, {allowedColumns: ['name', 'email'], returnField: 'id'})
			.insertWithReference(
				'upserted_post',
				postsTable,
				{id: existing.id, title: 'New title', content: 'new'},
				{from: 'new_owner', field: 'id', to: 'userId'},
				{allowedColumns: ['id', 'title', 'content'], onConflict: true, returnField: '*'}
			)
			.selectFrom('upserted_post', ['id', 'title'])
			.build();

		expect(chain.queries[0].sqlText).toContain('ON CONFLICT ("id") DO UPDATE SET');
		const results = await chain.execute();

		expect(results[0].rows).toEqual([{id: existing.id, title: 'New title'}]);
		expect(await count('posts', `id = ${existing.id}`)).toBe(1);
		const owner = await schema.admin.query(
			'SELECT u.email FROM posts p JOIN users u ON u.id = p."userId" WHERE p.id = $1',
			[existing.id]
		);
		expect(owner.rows).toEqual([{email: 'hal@example.com'}]);
	});

	it('rolls the whole chain back when one step fails', async () => {
		const failed = createChainedInsert()
			.insert('new_user', usersTable, {name: 'Ivy', email: 'ivy@example.com'}, {allowedColumns: ['name', 'email'], returnField: 'id'})
			.insertWithReference(
				'new_post',
				postsTable,
				// title is NOT NULL, so this step fails.
				{title: null as any, content: 'x'},
				{from: 'new_user', field: 'id', to: 'userId'},
				{allowedColumns: ['title', 'content']}
			)
			.build()
			.execute();

		await expect(failed).rejects.toBeInstanceOf(DatabaseError);
		await expect(failed).rejects.toHaveProperty('code', '23502');
		expect(await count('users', `email = 'ivy@example.com'`)).toBe(0);
		expect(await countIdleInTransaction(schema)).toBe(0);
	});

	it('writes sqlExpression values into an insert and an update', async () => {
		const usersDb = new DatabaseOperations(usersDefinition);
		const [inserted] = await usersDb
			.insert({
				allowedColumns: ['name', 'email', 'createdAt'],
				options: {
					data: {name: 'Jon', email: 'jon@example.com', createdAt: sqlExpression(`timestamp '2020-01-02 03:04:05'`)},
					returnField: 'id',
				},
			})
			.execute();

		await usersDb
			.update({
				allowedColumns: ['name', 'updatedAt'],
				options: {
					data: {name: sqlExpression(`upper('jon')`), updatedAt: sqlExpression(`"createdAt" + interval '1 day'`)},
					where: {id: inserted.id},
				},
			})
			.execute();

		const stored = await schema.admin.query(
			`SELECT name, to_char("createdAt", 'YYYY-MM-DD HH24:MI:SS') AS created, to_char("updatedAt", 'YYYY-MM-DD') AS updated
			 FROM users WHERE id = $1`,
			[inserted.id]
		);
		expect(stored.rows).toEqual([{name: 'JON', created: '2020-01-02 03:04:05', updated: '2020-01-03'}]);
	});
});
