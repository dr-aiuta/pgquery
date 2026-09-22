import {checkSchemaDrift, parseTableName, SchemaDriftQueryFn} from '../../src/schema/schema-drift';
import {TableDefinition} from '../../src/types';

type Rows = {columns?: any[]; keys?: any[]; foreignKeys?: any[]; enums?: any[]};

// Routes each catalog query to canned rows so the comparison logic can be tested without a database
function fakeQuery(rows: Rows) {
	const calls: {text: string; values: any[]}[] = [];
	const query: SchemaDriftQueryFn = async (text, values) => {
		calls.push({text, values});
		if (text.includes('information_schema.columns')) return {rows: rows.columns ?? []};
		if (text.includes('pg_index')) return {rows: rows.keys ?? []};
		if (text.includes('pg_constraint')) return {rows: rows.foreignKeys ?? []};
		if (text.includes('pg_enum')) return {rows: rows.enums ?? []};
		throw new Error(`Unexpected query: ${text}`);
	};
	return {query, calls};
}

const column = (overrides: Record<string, any>) => ({
	table_schema: 'public',
	table_name: 'users',
	data_type: 'text',
	udt_schema: 'pg_catalog',
	udt_name: 'text',
	is_nullable: 'YES',
	column_default: null,
	is_identity: 'NO',
	character_maximum_length: null,
	numeric_precision: null,
	numeric_scale: null,
	...overrides,
});

const usersTable: TableDefinition<any> = {
	tableName: 'users',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			email: {type: 'VARCHAR', length: 255, notNull: true, unique: true},
		},
	},
};

const matchingRows: Rows = {
	columns: [
		column({
			column_name: 'id',
			data_type: 'integer',
			is_nullable: 'NO',
			column_default: "nextval('users_id_seq'::regclass)",
		}),
		column({column_name: 'email', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 255}),
	],
	keys: [
		{table_schema: 'public', table_name: 'users', column_name: 'id', is_primary: true},
		{table_schema: 'public', table_name: 'users', column_name: 'email', is_primary: false},
	],
};

describe('parseTableName', () => {
	it('uses the default schema and folds unquoted names to lower case', () => {
		expect(parseTableName('Users')).toEqual({schema: 'public', table: 'users'});
		expect(parseTableName('Users', 'app')).toEqual({schema: 'app', table: 'users'});
	});

	it('splits schema-qualified names and keeps quoted case', () => {
		expect(parseTableName('Auth.Users')).toEqual({schema: 'auth', table: 'users'});
		expect(parseTableName('"Auth"."UserAccounts"')).toEqual({schema: 'Auth', table: 'UserAccounts'});
		expect(parseTableName('"my.schema".users')).toEqual({schema: 'my.schema', table: 'users'});
	});
});

describe('checkSchemaDrift', () => {
	it('passes table names as bound parameters, never as SQL text', async () => {
		const {query, calls} = fakeQuery(matchingRows);
		await checkSchemaDrift([{...usersTable, tableName: "users'; DROP TABLE users; --"}], {query});
		for (const call of calls) {
			expect(call.text).not.toContain('DROP TABLE');
		}
		expect(calls[0].values).toEqual([['public'], ["users'; drop table users; --"]]);
	});

	it('reports no issues when the catalog matches', async () => {
		const {query} = fakeQuery(matchingRows);
		const report = await checkSchemaDrift([usersTable], {query});
		expect(report).toEqual({ok: true, issues: []});
	});

	it('reports a missing table', async () => {
		const {query} = fakeQuery({});
		const report = await checkSchemaDrift([usersTable], {query});
		expect(report.ok).toBe(false);
		expect(report.issues).toEqual([
			{
				table: 'public.users',
				column: undefined,
				kind: 'missing_table',
				expected: 'table',
				actual: 'nothing',
				message: 'public.users: table does not exist (expected table, found nothing)',
			},
		]);
	});

	it('treats identity columns as auto increment and ignores their default', async () => {
		const {query} = fakeQuery({
			...matchingRows,
			columns: [
				column({column_name: 'id', data_type: 'integer', is_nullable: 'NO', is_identity: 'YES'}),
				matchingRows.columns![1],
			],
		});
		const report = await checkSchemaDrift([usersTable], {query});
		expect(report.issues).toEqual([]);
	});

	it('compares enum values regardless of order and only queries labels for user-defined types', async () => {
		const table: TableDefinition<any> = {
			tableName: 'posts',
			schema: {columns: {status: {type: 'ENUM', enum: ['published', 'draft']}}},
		};
		const {query, calls} = fakeQuery({
			columns: [
				column({
					table_name: 'posts',
					column_name: 'status',
					data_type: 'USER-DEFINED',
					udt_schema: 'public',
					udt_name: 'post_status',
				}),
			],
			enums: [
				{udt_schema: 'public', udt_name: 'post_status', enumlabel: 'draft'},
				{udt_schema: 'public', udt_name: 'post_status', enumlabel: 'published'},
			],
		});
		const report = await checkSchemaDrift([table], {query});
		expect(report.issues).toEqual([]);
		expect(calls.find((call) => call.text.includes('pg_enum'))?.values).toEqual([['post_status']]);
	});

	it('reports an unexpected foreign key when the definition has no references', async () => {
		const table: TableDefinition<any> = {tableName: 'posts', schema: {columns: {userId: {type: 'INTEGER'}}}};
		const {query} = fakeQuery({
			columns: [column({table_name: 'posts', column_name: 'userId', data_type: 'integer'})],
			foreignKeys: [
				{
					table_schema: 'public',
					table_name: 'posts',
					column_name: 'userId',
					ref_schema: 'public',
					ref_table: 'users',
					ref_column: 'id',
					confdeltype: 'a',
					confupdtype: 'a',
				},
			],
		});
		const report = await checkSchemaDrift([table], {query});
		expect(report.issues).toMatchObject([
			{kind: 'reference_mismatch', column: 'userId', expected: 'no foreign key', actual: 'public.users(id)'},
		]);
	});
});
