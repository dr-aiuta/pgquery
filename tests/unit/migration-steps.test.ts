import {buildSteps} from '../../src/schema/migration-generator';
import {
	key,
	ResolvedTable,
	SchemaCatalog,
	SchemaDriftIssue,
	SchemaDriftKind,
} from '../../src/schema/schema-drift';
import {ColumnDefinition} from '../../src/types';

/**
 * Feeds hand-built drift issues to the step builder, so every ALTER and review branch
 * runs without a database. The live suite proves the SQL is valid. This suite pins what it says.
 */

const T = '"public"."posts"';

function groupBy(rows: any[], keyOf: (row: any) => string): Map<string, any[]> {
	const map = new Map<string, any[]>();
	for (const row of rows) {
		map.set(keyOf(row), [...(map.get(keyOf(row)) ?? []), row]);
	}
	return map;
}

function catalogOf(rows: {
	columns?: any[];
	keys?: any[];
	foreignKeys?: any[];
	enumLabels?: Record<string, string[]>;
}): SchemaCatalog {
	return {
		columnsByTable: groupBy(rows.columns ?? [], (r) => key(r.table_schema, r.table_name)),
		keysByColumn: groupBy(rows.keys ?? [], (r) => key(r.table_schema, r.table_name, r.column_name)),
		foreignKeysByColumn: groupBy(rows.foreignKeys ?? [], (r) => key(r.table_schema, r.table_name, r.column_name)),
		enumLabels: new Map(Object.entries(rows.enumLabels ?? {}).map(([name, labels]) => [key('public', name), labels])),
	};
}

const column = (column_name: string, overrides: Record<string, any> = {}) => ({
	table_schema: 'public',
	table_name: 'posts',
	column_name,
	data_type: 'text',
	udt_schema: 'pg_catalog',
	udt_name: 'text',
	is_nullable: 'YES',
	column_default: null,
	is_identity: 'NO',
	...overrides,
});

const uniqueKey = (column_name: string, overrides: Record<string, any> = {}) => ({
	table_schema: 'public',
	table_name: 'posts',
	column_name,
	is_primary: false,
	index_name: `posts_${column_name}_key`,
	constraint_name: `posts_${column_name}_key`,
	...overrides,
});

const foreignKey = (column_name: string, overrides: Record<string, any> = {}) => ({
	table_schema: 'public',
	table_name: 'posts',
	column_name,
	ref_schema: 'public',
	ref_table: 'users',
	ref_column: 'id',
	confdeltype: 'a',
	confupdtype: 'a',
	constraint_name: `posts_${column_name}_fkey`,
	...overrides,
});

const issue = (kind: SchemaDriftKind, columnName: string, expected = '', actual = ''): SchemaDriftIssue => ({
	table: 'public.posts',
	column: columnName,
	kind,
	expected,
	actual,
	message: '',
});

const posts = (columns: Record<string, ColumnDefinition>): ResolvedTable => ({
	name: {schema: 'public', table: 'posts'},
	columns,
});

describe('buildSteps with hand-built drift issues', () => {
	it('extra column: drops it in a review step', () => {
		const steps = buildSteps(
			[posts({id: {type: 'INTEGER'}})],
			catalogOf({columns: [column('id', {data_type: 'integer'}), column('legacy')]}),
			[issue('extra_column', 'legacy', 'nothing', 'column')],
			'public'
		);

		expect(steps).toEqual([
			{sql: `ALTER TABLE ${T} DROP COLUMN "legacy"`, review: true, note: 'Dropping legacy deletes its data.'},
		]);
	});

	it('type change: retypes in a review step and restores the defined default', () => {
		const steps = buildSteps(
			[posts({views: {type: 'BIGINT', default: 0}})],
			catalogOf({columns: [column('views', {data_type: 'integer', column_default: '0'})]}),
			[issue('type_mismatch', 'views', 'bigint', 'integer')],
			'public'
		);

		expect(steps).toEqual([
			{
				sql: [
					`ALTER TABLE ${T} ALTER COLUMN "views" DROP DEFAULT`,
					`ALTER TABLE ${T} ALTER COLUMN "views" TYPE bigint USING "views"::bigint`,
					`ALTER TABLE ${T} ALTER COLUMN "views" SET DEFAULT 0`,
				].join(';\n'),
				review: true,
				note: 'Type change from integer to bigint. Check the cast: values may be converted, rounded or rejected.',
			},
		]);
	});

	it('type change to an enum: creates the type actively and casts through text in a review step', () => {
		const steps = buildSteps(
			[posts({status: {type: 'ENUM', enum: ['draft', 'published']}})],
			catalogOf({columns: [column('status')]}),
			[issue('type_mismatch', 'status', 'USER-DEFINED', 'text')],
			'public'
		);

		expect(steps).toEqual([
			{sql: `CREATE TYPE "public"."posts_status" AS ENUM ('draft', 'published')`, review: false},
			{
				sql: `ALTER TABLE ${T} ALTER COLUMN "status" TYPE "public"."posts_status" USING "status"::text::"public"."posts_status"`,
				review: true,
				note: 'Type change from text to USER-DEFINED. Check the cast: values may be converted, rounded or rejected.',
			},
		]);
	});

	it('NOT NULL change: both directions are review steps', () => {
		const steps = buildSteps(
			[posts({title: {type: 'TEXT', notNull: true}, summary: {type: 'TEXT'}})],
			catalogOf({columns: [column('title'), column('summary', {is_nullable: 'NO'})]}),
			[
				issue('nullability_mismatch', 'title', 'NOT NULL', 'nullable'),
				issue('nullability_mismatch', 'summary', 'nullable', 'NOT NULL'),
			],
			'public'
		);

		expect(steps).toEqual([
			{
				sql: `ALTER TABLE ${T} ALTER COLUMN "title" SET NOT NULL`,
				review: true,
				note: `Fails if rows contain NULL. Backfill first, e.g. UPDATE ${T} SET "title" = ... WHERE "title" IS NULL.`,
			},
			{sql: `ALTER TABLE ${T} ALTER COLUMN "summary" DROP NOT NULL`, review: true, note: 'Removes a NOT NULL constraint.'},
		]);
	});

	it('primary key change: one review step drops the old key, releases NOT NULL and adds the new key', () => {
		const steps = buildSteps(
			[posts({slug: {type: 'TEXT'}, id: {type: 'INTEGER', primaryKey: true}})],
			catalogOf({
				columns: [column('slug', {is_nullable: 'NO'}), column('id', {data_type: 'integer', is_nullable: 'NO'})],
				keys: [uniqueKey('slug', {is_primary: true, index_name: 'posts_pkey', constraint_name: 'posts_pkey'})],
			}),
			[
				// The nullability issues of key columns are handled with the primary key.
				issue('nullability_mismatch', 'slug', 'nullable', 'NOT NULL'),
				issue('primary_key_mismatch', 'slug', 'not a primary key', 'primary key'),
				issue('primary_key_mismatch', 'id', 'primary key', 'not a primary key'),
			],
			'public'
		);

		expect(steps).toEqual([
			{
				sql: [
					`ALTER TABLE ${T} DROP CONSTRAINT "posts_pkey"`,
					`ALTER TABLE ${T} ALTER COLUMN "slug" DROP NOT NULL`,
					`ALTER TABLE ${T} ADD PRIMARY KEY ("id")`,
				].join(';\n'),
				review: true,
				note: 'Primary key change. Foreign keys that reference the old key must be dropped first and recreated.',
			},
		]);
	});

	it('removed enum value: recreates the type in a review step and converts the column', () => {
		const visibility = {
			type: 'ENUM',
			enum: ['public', 'private'],
			enumTypeName: 'post_visibility',
			default: 'public',
		} as ColumnDefinition;
		const steps = buildSteps(
			[posts({visibility})],
			catalogOf({
				columns: [
					column('visibility', {
						data_type: 'USER-DEFINED',
						udt_schema: 'public',
						udt_name: 'post_visibility',
						column_default: `'public'::post_visibility`,
					}),
				],
				enumLabels: {post_visibility: ['public', 'private', 'secret']},
			}),
			[issue('enum_mismatch', 'visibility', 'public, private', 'public, private, secret')],
			'public'
		);

		expect(steps).toEqual([
			{
				sql: [
					'ALTER TYPE "public"."post_visibility" RENAME TO "post_visibility_old"',
					`CREATE TYPE "public"."post_visibility" AS ENUM ('public', 'private')`,
					`ALTER TABLE ${T} ALTER COLUMN "visibility" DROP DEFAULT`,
					`ALTER TABLE ${T} ALTER COLUMN "visibility" TYPE "public"."post_visibility" USING "visibility"::text::"public"."post_visibility"`,
					`ALTER TABLE ${T} ALTER COLUMN "visibility" SET DEFAULT 'public'`,
					'DROP TYPE "public"."post_visibility_old"',
				].join(';\n'),
				review: true,
				note: 'PostgreSQL cannot drop enum values (secret). Recreate the type after migrating rows that use them. Columns outside the checked tables that use the type must be converted too.',
			},
		]);
	});

	it('added and removed enum values: adds actively, recreates in a review step', () => {
		const steps = buildSteps(
			[posts({status: {type: 'ENUM', enum: ['draft', 'archived'], enumTypeName: 'post_status'}})],
			catalogOf({
				columns: [column('status', {data_type: 'USER-DEFINED', udt_schema: 'public', udt_name: 'post_status'})],
				enumLabels: {post_status: ['draft', 'published']},
			}),
			[issue('enum_mismatch', 'status', 'draft, archived', 'draft, published')],
			'public'
		);

		expect(steps.map((step) => [step.review, step.sql.split(';\n')[0]])).toEqual([
			[false, `ALTER TYPE "public"."post_status" ADD VALUE IF NOT EXISTS 'archived'`],
			[true, 'ALTER TYPE "public"."post_status" RENAME TO "post_status_old"'],
		]);
	});

	it('replaced foreign key: drops the old one and adds the new one in one review step', () => {
		const userId = {
			type: 'INTEGER',
			references: {table: 'users', column: 'id', onDelete: 'SET NULL'},
		} as ColumnDefinition;
		const steps = buildSteps(
			[posts({userId})],
			catalogOf({
				columns: [column('userId', {data_type: 'integer'})],
				foreignKeys: [foreignKey('userId', {confdeltype: 'c'})],
			}),
			[
				issue(
					'reference_mismatch',
					'userId',
					'public.users(id) ON DELETE SET NULL',
					'public.users(id) ON DELETE CASCADE'
				),
			],
			'public'
		);

		expect(steps).toEqual([
			{
				sql: [
					`ALTER TABLE ${T} DROP CONSTRAINT "posts_userId_fkey"`,
					`ALTER TABLE ${T} ADD FOREIGN KEY ("userId") REFERENCES "public"."users" ("id") ON DELETE SET NULL`,
				].join(';\n'),
				review: true,
				note: 'Replaces the foreign key public.users(id) ON DELETE CASCADE with public.users(id) ON DELETE SET NULL.',
			},
		]);
	});

	it('removed and new foreign keys: the removal is a review step, the addition is active', () => {
		const editorId = {type: 'INTEGER', references: {table: 'users', column: 'id'}} as ColumnDefinition;
		const steps = buildSteps(
			[posts({reviewerId: {type: 'INTEGER'}, editorId})],
			catalogOf({
				columns: [column('reviewerId', {data_type: 'integer'}), column('editorId', {data_type: 'integer'})],
				foreignKeys: [foreignKey('reviewerId')],
			}),
			[
				issue('reference_mismatch', 'reviewerId', 'no foreign key', 'public.users(id)'),
				issue('reference_mismatch', 'editorId', 'public.users(id)', 'no foreign key'),
			],
			'public'
		);

		expect(steps).toEqual([
			{sql: `ALTER TABLE ${T} DROP CONSTRAINT "posts_reviewerId_fkey"`, review: true, note: 'Removes a foreign key.'},
			{
				sql: `ALTER TABLE ${T} ADD FOREIGN KEY ("editorId") REFERENCES "public"."users" ("id")`,
				review: false,
				note: 'Fails if rows reference missing parents.',
			},
		]);
	});

	it('removed unique constraint: drops the constraint or the bare index in a review step', () => {
		const steps = buildSteps(
			[posts({code: {type: 'TEXT'}, slug: {type: 'TEXT'}, email: {type: 'TEXT', unique: true}})],
			catalogOf({
				columns: [column('code'), column('slug'), column('email')],
				keys: [uniqueKey('code'), uniqueKey('slug', {index_name: 'posts_slug_idx', constraint_name: null})],
			}),
			[
				issue('unique_mismatch', 'code', 'not unique', 'unique'),
				issue('unique_mismatch', 'slug', 'not unique', 'unique'),
				issue('unique_mismatch', 'email', 'unique', 'not unique'),
			],
			'public'
		);

		expect(steps).toEqual([
			{sql: `ALTER TABLE ${T} DROP CONSTRAINT "posts_code_key"`, review: true, note: 'Removes a unique constraint.'},
			{sql: 'DROP INDEX "public"."posts_slug_idx"', review: true, note: 'Removes a unique constraint.'},
			{sql: `ALTER TABLE ${T} ADD UNIQUE ("email")`, review: false, note: 'Fails if the column has duplicate values.'},
		]);
	});

	it('auto increment change: both directions are review steps', () => {
		const steps = buildSteps(
			[posts({id: {type: 'INTEGER', autoIncrement: true}, seq: {type: 'INTEGER'}, old: {type: 'INTEGER'}})],
			catalogOf({
				columns: [
					column('id', {data_type: 'integer'}),
					column('seq', {data_type: 'integer', is_identity: 'YES'}),
					column('old', {data_type: 'integer', column_default: `nextval('posts_old_seq'::regclass)`}),
				],
			}),
			[
				issue('auto_increment_mismatch', 'id', 'auto increment', 'no auto increment'),
				issue('auto_increment_mismatch', 'seq', 'no auto increment', 'auto increment'),
				issue('auto_increment_mismatch', 'old', 'no auto increment', 'auto increment'),
			],
			'public'
		);

		expect(steps).toEqual([
			{
				sql: [
					`ALTER TABLE ${T} ALTER COLUMN "id" DROP DEFAULT`,
					`ALTER TABLE ${T} ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY`,
					`SELECT setval(pg_get_serial_sequence('${T}', 'id'), COALESCE(MAX("id"), 0) + 1, false) FROM ${T}`,
				].join(';\n'),
				review: true,
				note: 'Makes the column an identity column and starts it after the current maximum value.',
			},
			{
				sql: `ALTER TABLE ${T} ALTER COLUMN "seq" DROP IDENTITY`,
				review: true,
				note: 'Removes auto increment. Inserts that omit this column will fail.',
			},
			{
				sql: `ALTER TABLE ${T} ALTER COLUMN "old" DROP DEFAULT`,
				review: true,
				note: 'Removes auto increment. Inserts that omit this column will fail.',
			},
		]);
	});

	it('new primary key column: a review step, and its foreign key waits for it', () => {
		const tenantId = {
			type: 'INTEGER',
			primaryKey: true,
			references: {table: 'tenants', column: 'id'},
		} as ColumnDefinition;
		const steps = buildSteps(
			[posts({id: {type: 'INTEGER', primaryKey: true}, tenantId})],
			catalogOf({
				columns: [column('id', {data_type: 'integer', is_nullable: 'NO'})],
				keys: [uniqueKey('id', {is_primary: true, index_name: 'posts_pkey', constraint_name: 'posts_pkey'})],
			}),
			[issue('missing_column', 'tenantId', 'column', 'nothing')],
			'public'
		);

		expect(steps).toEqual([
			{
				sql: `ALTER TABLE ${T} ADD COLUMN "tenantId" integer NOT NULL`,
				review: true,
				note: 'tenantId is a primary key column. Add it to the primary key by hand.',
			},
			{
				sql: `ALTER TABLE ${T} ADD FOREIGN KEY ("tenantId") REFERENCES "public"."tenants" ("id")`,
				review: true,
				note: 'Depends on a table, column or enum type that is only created in a review step.',
			},
		]);
	});

	it('rejects a hand-built catalog that carries a line break', () => {
		const lineBreak = String.fromCharCode(0x0a);
		expect(() =>
			buildSteps(
				[posts({id: {type: 'INTEGER'}})],
				catalogOf({columns: [column('id', {data_type: 'integer'}), column(`x${lineBreak}DROP TABLE users; --`)]}),
				[issue('extra_column', `x${lineBreak}DROP TABLE users; --`, 'nothing', 'column')],
				'public'
			)
		).toThrow(/contains a line break/);
	});
});
