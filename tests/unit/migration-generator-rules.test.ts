import {defaultToSql, generateMigration} from '../../src/schema/migration-generator';
import {checkSchemaDrift} from '../../src/schema/schema-drift';
import {TableDefinition} from '../../src/types';
import {sqlExpression} from '../../src/utils/sql-expression';
import {emptyCatalog, catalogQuery, dbColumn, usersWith} from './migration-helpers';

describe('string defaults are literals', () => {
	it.each(['now()', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'gen_random_uuid()'])(
		'emits the compatibility entry %s raw, in upper and lower case',
		(entry) => {
			expect(defaultToSql(entry.toUpperCase())).toBe(entry.toUpperCase());
			expect(defaultToSql(entry.toLowerCase())).toBe(entry.toLowerCase());
		}
	);

	it('quotes every other string, even one that looks like a call or a keyword', () => {
		expect(defaultToSql('Smith (Jr)')).toBe("'Smith (Jr)'");
		expect(defaultToSql('current_user')).toBe("'current_user'");
		expect(defaultToSql('version()')).toBe("'version()'");
		expect(defaultToSql("now() + interval '1 day'")).toBe("'now() + interval ''1 day'''");
		expect(defaultToSql(' now() ')).toBe("' now() '");
		expect(defaultToSql('CURRENT_TIME')).toBe("'CURRENT_TIME'");
		expect(defaultToSql('uuid_generate_v4()')).toBe("'uuid_generate_v4()'");
	});

	it('takes any expression through sqlExpression', () => {
		expect(defaultToSql(sqlExpression('current_user'))).toBe('current_user');
		expect(defaultToSql(sqlExpression("now() + interval '1 day'"))).toBe("now() + interval '1 day'");
	});

	it('writes the rule into a created table', async () => {
		const table: TableDefinition<any> = {
			tableName: 'people',
			schema: {
				columns: {
					surname: {type: 'TEXT', default: 'Smith (Jr)'},
					owner: {type: 'TEXT', default: 'current_user'},
					createdAt: {type: 'TIMESTAMP WITH TIME ZONE', default: 'CURRENT_TIMESTAMP'},
					expiresAt: {type: 'TIMESTAMP WITH TIME ZONE', default: sqlExpression("now() + interval '1 day'")},
				},
			},
		};
		const draft = await generateMigration([table], {query: emptyCatalog});
		expect(draft.steps[0].sql).toBe(
			[
				'CREATE TABLE "public"."people" (',
				`\t"surname" text DEFAULT 'Smith (Jr)',`,
				`\t"owner" text DEFAULT 'current_user',`,
				'\t"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,',
				`\t"expiresAt" timestamp with time zone DEFAULT now() + interval '1 day'`,
				')',
			].join('\n')
		);
	});
});

describe('default: null means no default', () => {
	it('creates a column without a DEFAULT clause', async () => {
		const table: TableDefinition<any> = {
			tableName: 'notes',
			schema: {columns: {body: {type: 'TEXT', default: null}, title: {type: 'TEXT', notNull: true, default: null}}},
		};
		const draft = await generateMigration([table], {query: emptyCatalog});
		expect(draft.steps[0].sql).toBe('CREATE TABLE "public"."notes" (\n\t"body" text,\n\t"title" text NOT NULL\n)');
	});

	it('reports no drift against a column with no default', async () => {
		const table = usersWith({bio: {type: 'TEXT', default: null}});
		const query = catalogQuery({columns: [dbColumn({column_name: 'name'}), dbColumn({column_name: 'bio'})]});

		expect(await checkSchemaDrift([table], {query})).toEqual({ok: true, issues: []});
		expect(await generateMigration([table], {query})).toMatchObject({
			hasChanges: false,
			needsReview: false,
			steps: [],
			issues: [],
		});
	});

	it('reports a default the database has, and drafts DROP DEFAULT for review, never SET DEFAULT NULL', async () => {
		const table = usersWith({bio: {type: 'TEXT', default: null}});
		const query = catalogQuery({
			columns: [dbColumn({column_name: 'name'}), dbColumn({column_name: 'bio', column_default: "'n/a'::text"})],
		});

		const report = await checkSchemaDrift([table], {query});
		expect(report.issues).toMatchObject([
			{kind: 'default_mismatch', column: 'bio', expected: 'no default', actual: "default 'n/a'::text"},
		]);

		const draft = await generateMigration([table], {query});
		expect(draft.steps).toEqual([
			{
				sql: 'ALTER TABLE "public"."users" ALTER COLUMN "bio" DROP DEFAULT',
				review: true,
				note: 'Removes a default. Inserts that omit this column may fail.',
			},
		]);
	});

	it('still warns about a new NOT NULL column whose default is null', async () => {
		const table = usersWith({bio: {type: 'TEXT', notNull: true, default: null}});
		const query = catalogQuery({columns: [dbColumn({column_name: 'name'})]});
		const draft = await generateMigration([table], {query});
		expect(draft.steps).toEqual([
			{
				sql: 'ALTER TABLE "public"."users" ADD COLUMN "bio" text NOT NULL',
				review: false,
				note: 'NOT NULL without a default fails if the table has rows. Add a default or backfill first.',
			},
		]);
	});
});

describe('a new column on an existing enum type', () => {
	const statusType = [
		{udt_schema: 'public', udt_name: 'user_status', enumlabel: 'active'},
		{udt_schema: 'public', udt_name: 'user_status', enumlabel: 'blocked'},
	];
	const statusColumn = dbColumn({
		column_name: 'status',
		data_type: 'USER-DEFINED',
		udt_schema: 'public',
		udt_name: 'user_status',
	});
	const enumColumn = (values: string[]) => ({type: 'ENUM', enum: values, enumTypeName: 'user_status'});
	const query = catalogQuery({columns: [dbColumn({column_name: 'name'}), statusColumn], enums: statusType});

	it('adds the missing label before it adds the column', async () => {
		const table = usersWith({
			status: enumColumn(['active', 'blocked']),
			previousStatus: enumColumn(['active', 'blocked', 'archived']),
		});

		const draft = await generateMigration([table], {query});

		expect(draft.steps).toEqual([
			{sql: `ALTER TYPE "public"."user_status" ADD VALUE IF NOT EXISTS 'archived'`, review: false},
			{sql: 'ALTER TABLE "public"."users" ADD COLUMN "previousStatus" "public"."user_status"', review: false},
		]);
	});

	it('adds nothing when the type already has every label', async () => {
		const table = usersWith({
			status: enumColumn(['active', 'blocked']),
			previousStatus: enumColumn(['blocked', 'active']),
		});

		const draft = await generateMigration([table], {query});

		expect(draft.steps).toEqual([
			{sql: 'ALTER TABLE "public"."users" ADD COLUMN "previousStatus" "public"."user_status"', review: false},
		]);
	});

	it('adds each label once when an existing column and a new column both need it', async () => {
		const table = usersWith({
			status: enumColumn(['active', 'blocked', 'archived']),
			previousStatus: enumColumn(['active', 'blocked', 'archived', 'deleted']),
		});

		const draft = await generateMigration([table], {query});

		expect(draft.needsReview).toBe(false);
		const sql = draft.steps.map((step) => step.sql);
		expect(sql.filter((statement) => statement.includes(`ADD VALUE IF NOT EXISTS 'archived'`))).toHaveLength(1);
		expect(sql.filter((statement) => statement.includes(`ADD VALUE IF NOT EXISTS 'deleted'`))).toHaveLength(1);
		const addColumn = sql.findIndex((statement) => statement.includes('ADD COLUMN "previousStatus"'));
		const addDeleted = sql.findIndex((statement) => statement.includes(`'deleted'`));
		const addArchived = sql.findIndex((statement) => statement.includes(`'archived'`));
		expect(addDeleted).toBeLessThan(addColumn);
		expect(addArchived).toBeLessThan(addColumn);
		expect(sql).toHaveLength(3);
	});

	it('adds the missing label before a new table that uses the type', async () => {
		const audits: TableDefinition<any> = {
			tableName: 'audits',
			schema: {columns: {status: enumColumn(['active', 'blocked', 'archived'])}},
		};
		const users = usersWith({status: enumColumn(['active', 'blocked'])});

		const draft = await generateMigration([users, audits], {query});

		expect(draft.steps.map((step) => step.sql)).toEqual([
			`ALTER TYPE "public"."user_status" ADD VALUE IF NOT EXISTS 'archived'`,
			'CREATE TABLE "public"."audits" (\n\t"status" "public"."user_status"\n)',
		]);
	});
});

describe('column types', () => {
	it('creates TIMESTAMPTZ and TIME WITHOUT TIME ZONE columns', async () => {
		const table: TableDefinition<any> = {
			tableName: 'shifts',
			schema: {columns: {startsAt: {type: 'TIMESTAMPTZ'}, opensAt: {type: 'TIME WITHOUT TIME ZONE'}}},
		};
		const draft = await generateMigration([table], {query: emptyCatalog});
		expect(draft.steps[0].sql).toBe(
			'CREATE TABLE "public"."shifts" (\n\t"startsAt" timestamp with time zone,\n\t"opensAt" time without time zone\n)'
		);
	});

	it('reports no drift for TIMESTAMPTZ and TIME WITHOUT TIME ZONE columns that match', async () => {
		const table = usersWith({
			seenAt: {type: 'TIMESTAMPTZ'},
			joinedAt: {type: 'TIMESTAMP WITH TIME ZONE'},
			opensAt: {type: 'TIME WITHOUT TIME ZONE'},
		});
		const query = catalogQuery({
			columns: [
				dbColumn({column_name: 'name'}),
				dbColumn({column_name: 'seenAt', data_type: 'timestamp with time zone'}),
				dbColumn({column_name: 'joinedAt', data_type: 'timestamp with time zone'}),
				dbColumn({column_name: 'opensAt', data_type: 'time without time zone'}),
			],
		});

		expect(await checkSchemaDrift([table], {query})).toEqual({ok: true, issues: []});
	});

	it('reports a TIMESTAMPTZ definition against a timestamp without time zone column', async () => {
		const table = usersWith({seenAt: {type: 'TIMESTAMPTZ'}});
		const query = catalogQuery({
			columns: [
				dbColumn({column_name: 'name'}),
				dbColumn({column_name: 'seenAt', data_type: 'timestamp without time zone'}),
			],
		});

		const report = await checkSchemaDrift([table], {query});
		expect(report.issues).toMatchObject([
			{
				kind: 'type_mismatch',
				column: 'seenAt',
				expected: 'timestamp with time zone',
				actual: 'timestamp without time zone',
			},
		]);
	});

	it('throws for a type that is not supported, in the drift check and in the generator', async () => {
		const existing = usersWith({span: {type: 'INTERVAL'}});
		const query = catalogQuery({
			columns: [dbColumn({column_name: 'name'}), dbColumn({column_name: 'span', data_type: 'interval'})],
		});
		await expect(checkSchemaDrift([existing], {query})).rejects.toThrow('Unknown column type: "INTERVAL"');
		await expect(generateMigration([existing], {query})).rejects.toThrow('Unknown column type: "INTERVAL"');

		const missing: TableDefinition<any> = {tableName: 'shifts', schema: {columns: {span: {type: 'INTERVAL'}}}};
		await expect(generateMigration([missing], {query: emptyCatalog})).rejects.toThrow(
			'Unknown column type: "INTERVAL"'
		);
	});

	it('does not read an inherited object property as a type', async () => {
		const table = usersWith({odd: {type: 'toString'}});
		const query = catalogQuery({columns: [dbColumn({column_name: 'name'}), dbColumn({column_name: 'odd'})]});
		await expect(checkSchemaDrift([table], {query})).rejects.toThrow('Unknown column type: "toString"');
	});
});
