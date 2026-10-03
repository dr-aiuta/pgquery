import {generateMigration, renderMigration, MigrationStep} from '../../src/schema/migration-generator';
import {TableDefinition} from '../../src/types';
import {
	runUp,
	emptyCatalog,
	catalogQuery,
	dbColumn,
	usersWith,
	sqlLines,
	CatalogRows,
	TERMINATORS,
	FORMATS,
} from './migration-helpers';

/**
 * A review step must stay inert whatever text it carries.
 * Layer one: a name with a line break is rejected, from a definition or from the catalog.
 * Layer two: notes and SQL are commented out by one function that knows all four line ends.
 */

const CR = String.fromCharCode(0x0d);
const LF = String.fromCharCode(0x0a);

describe('names with a line break are rejected', () => {
	describe.each(TERMINATORS)('line end %s', (_label, terminator) => {
		const payload = `x${terminator}DROP TABLE users; --`;

		// The definition side. Definitions carry no constraint names.
		const fromDefinition: [string, TableDefinition<any>][] = [
			['column name', usersWith({[payload]: {type: 'TEXT'}})],
			['table name', {tableName: `"${payload}"`, schema: {columns: {name: {type: 'TEXT'}}}}],
			['column type', usersWith({bio: {type: `TEXT${terminator}`}})],
			['enum type name', usersWith({status: {type: 'ENUM', enum: ['a'], enumTypeName: `"${payload}"`}})],
			['enum label', usersWith({status: {type: 'ENUM', enum: ['draft', payload]}})],
			['referenced column', usersWith({orgId: {type: 'INTEGER', references: {table: 'orgs', column: payload}}})],
		];

		// The catalog side: what a database could return for the checked tables.
		const nameColumn = dbColumn({column_name: 'name'});
		const key = (overrides: Record<string, any>) => ({
			table_schema: 'public',
			table_name: 'users',
			column_name: 'name',
			is_primary: false,
			index_name: 'users_name_key',
			constraint_name: 'users_name_key',
			...overrides,
		});
		const fromCatalog: [string, CatalogRows, TableDefinition<any>][] = [
			['column name', {columns: [nameColumn, dbColumn({column_name: payload})]}, usersWith({})],
			[
				'type name',
				{
					columns: [
						dbColumn({column_name: 'name', data_type: 'USER-DEFINED', udt_schema: 'public', udt_name: payload}),
					],
				},
				usersWith({}),
			],
			[
				'enum label',
				{
					columns: [
						nameColumn,
						dbColumn({column_name: 'status', data_type: 'USER-DEFINED', udt_schema: 'public', udt_name: 'user_status'}),
					],
					enums: [{udt_schema: 'public', udt_name: 'user_status', enumlabel: payload}],
				},
				usersWith({status: {type: 'ENUM', enum: ['active'], enumTypeName: 'user_status'}}),
			],
			['unique constraint name', {columns: [nameColumn], keys: [key({constraint_name: payload})]}, usersWith({})],
			[
				'unique index name',
				{columns: [nameColumn], keys: [key({index_name: payload, constraint_name: null})]},
				usersWith({}),
			],
			[
				'foreign key constraint name',
				{
					columns: [nameColumn],
					foreignKeys: [
						{
							table_schema: 'public',
							table_name: 'users',
							column_name: 'name',
							ref_schema: 'public',
							ref_table: 'orgs',
							ref_column: 'id',
							confdeltype: 'a',
							confupdtype: 'a',
							constraint_name: payload,
						},
					],
				},
				usersWith({}),
			],
		];

		describe.each(FORMATS)('format %s', (format) => {
			it.each(fromDefinition)('rejects a %s from a definition', async (_what, table) => {
				await expect(generateMigration([table], {query: emptyCatalog, format})).rejects.toThrow(
					/contains a line break/
				);
			});

			it.each(fromCatalog)('rejects a %s from the catalog', async (_what, rows, table) => {
				await expect(generateMigration([table], {query: catalogQuery(rows), format})).rejects.toThrow(
					/contains a line break/
				);
			});
		});

		it('names the offending value in the error', async () => {
			const draft = generateMigration([usersWith({[payload]: {type: 'TEXT'}})], {query: emptyCatalog});
			await expect(draft).rejects.toThrow('DROP TABLE users; --');
			await expect(draft).rejects.toThrow(/^Column name "x/);
		});
	});

	it('still drafts a name with quotes, backticks and template characters', async () => {
		const table = usersWith({'we"ird `${name}`': {type: 'TEXT'}});
		const draft = await generateMigration([table], {query: emptyCatalog});
		expect(draft.needsReview).toBe(false);
		expect(await runUp(draft.content)).toEqual(draft.steps.map((step) => step.sql));
	});
});

describe('the comment function is a second layer', () => {
	// These steps cannot come out of generateMigration, which rejects such names.
	// They prove that rendering alone keeps a review step inert.
	describe.each(TERMINATORS)('line end %s', (_label, terminator) => {
		const before: MigrationStep = {sql: 'ALTER TABLE "public"."a" ADD COLUMN "b" text', review: false};
		const after: MigrationStep = {sql: 'ALTER TABLE "public"."a" ADD COLUMN "c" text', review: false, note: 'a note'};

		it.each(['node-pg-migrate-ts', 'node-pg-migrate-js'] as const)(
			'%s issues only the active steps',
			async (format) => {
				const escape = `x${terminator}pgm.sql('DROP TABLE users'); //`;
				const review: MigrationStep = {
					// A default may span lines. Inside a review step every line of it is commented.
					sql: `ALTER TABLE "public"."a" ALTER COLUMN "note" SET DEFAULT 'one${terminator}\`); pgm.sql(\`DROP TABLE users\`); //'`,
					review: true,
					note: `Dropping ${escape} deletes its data.`,
				};
				const activeWithNote: MigrationStep = {...after, note: `a note ${escape}`};

				const content = renderMigration([before, review, activeWithNote], format);

				expect(await runUp(content)).toEqual([before.sql, after.sql]);
			}
		);

		it('sql leaves no line of a review step outside a comment', () => {
			const escape = `x${terminator}DROP TABLE users; --`;
			const review: MigrationStep = {
				sql: `ALTER TABLE "public"."a" ALTER COLUMN "note" SET DEFAULT 'one${terminator}'; DROP TABLE users; --'`,
				review: true,
				note: `Dropping ${escape} deletes its data.`,
			};

			const content = renderMigration([review, {...review, note: `Second ${escape}`}], 'sql');

			const lines = sqlLines(content);
			expect(lines.length).toBeGreaterThanOrEqual(5);
			for (const line of lines) {
				expect(line.startsWith('-- ')).toBe(true);
			}
			// Every line end of the text is followed by the comment prefix.
			const pieces = content.trimEnd().split(terminator);
			expect(pieces.length).toBeGreaterThan(4);
			for (const piece of pieces.slice(1)) {
				expect(piece === '' || piece.startsWith('-- ')).toBe(true);
			}
		});

		it('sql comments out the note of an active step', () => {
			const escape = `x${terminator}DROP TABLE users; --`;
			const content = renderMigration([{...before, note: `a note ${escape}`}], 'sql');
			expect(sqlLines(content).filter((line) => !line.startsWith('-- '))).toEqual([`${before.sql};`]);
		});
	});
});

describe('defaults that span lines', () => {
	it.each(TERMINATORS)('a default with %s stays commented in a review step', async (_label, terminator) => {
		// The column exists as integer, so the type change and its default are a review step.
		const table = usersWith({note: {type: 'TEXT', default: `one${terminator}two`}});
		const query = catalogQuery({
			columns: [
				dbColumn({column_name: 'name'}),
				dbColumn({column_name: 'note', data_type: 'integer', column_default: '0'}),
			],
		});

		for (const format of ['node-pg-migrate-ts', 'node-pg-migrate-js'] as const) {
			const draft = await generateMigration([table], {query, format});
			expect(draft.steps.map((step) => step.review)).toEqual([true]);
			expect(draft.steps[0].sql).toContain(`SET DEFAULT 'one${terminator}two'`);
			expect(await runUp(draft.content)).toEqual([]);
		}

		const sqlDraft = await generateMigration([table], {query, format: 'sql'});
		for (const line of sqlLines(sqlDraft.content)) {
			expect(line.startsWith('-- ')).toBe(true);
		}
	});

	it.each(TERMINATORS)('a catalog default with %s is never written into the draft', async (_label, terminator) => {
		const payload = `'x'${terminator}; DROP TABLE users; --`;
		const query = catalogQuery({columns: [dbColumn({column_name: 'name', column_default: payload})]});

		for (const format of FORMATS) {
			const draft = await generateMigration([usersWith({})], {query, format});
			expect(draft.steps).toEqual([
				{
					sql: 'ALTER TABLE "public"."users" ALTER COLUMN "name" DROP DEFAULT',
					review: true,
					note: 'Removes a default. Inserts that omit this column may fail.',
				},
			]);
			expect(draft.content).not.toContain('DROP TABLE');
		}
	});

	it('keeps CR, CRLF and LF inside a default exactly as written in an active step', async () => {
		const active: MigrationStep[] = [
			{sql: `ALTER TABLE "public"."a" ALTER COLUMN "note" SET DEFAULT 'a${CR}b${CR}${LF}c${LF}d'`, review: false},
			{sql: `ALTER TABLE "public"."a" ALTER COLUMN "path" SET DEFAULT 'C:\\root\\new'`, review: false},
		];

		expect(await runUp(renderMigration(active, 'node-pg-migrate-ts'))).toEqual(active.map((step) => step.sql));
		expect(await runUp(renderMigration(active, 'node-pg-migrate-js'))).toEqual(active.map((step) => step.sql));
		expect(renderMigration(active, 'sql')).toContain(`${active[0].sql};`);
	});

	it('keeps a default with CR through generateMigration', async () => {
		const body = `first${CR}second${CR}${LF}third`;
		const table: TableDefinition<any> = {
			tableName: 'notes',
			schema: {columns: {body: {type: 'TEXT', default: body}}},
		};
		const draft = await generateMigration([table], {query: emptyCatalog});
		expect(draft.needsReview).toBe(false);
		expect(draft.steps[0].sql).toContain(`DEFAULT '${body}'`);
		expect(await runUp(draft.content)).toEqual([draft.steps[0].sql]);
	});
});
