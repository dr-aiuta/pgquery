import {execFileSync} from 'child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join, resolve} from 'path';
import * as ts from 'typescript';

/**
 * Smoke test of the published package.
 *
 * It compiles the sources into a staging folder, packs that folder with `npm pack`,
 * unpacks the tarball as node_modules/pg-lightquery, and loads the package by name.
 * Nothing in the repository is written.
 */
const repoRoot = resolve(__dirname, '../..');

describe('packed tarball', () => {
	let workDir: string;
	let packedFiles: string[];

	// Runs a script in a fresh node process that sees the unpacked package.
	// The package's own dependencies resolve through NODE_PATH.
	const runNode = (script: string): string =>
		execFileSync(process.execPath, ['-e', script], {
			cwd: workDir,
			env: {...process.env, NODE_PATH: join(repoRoot, 'node_modules')},
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();

	beforeAll(() => {
		workDir = mkdtempSync(join(tmpdir(), 'pg-lightquery-pack-'));
		const stage = join(workDir, 'stage');
		mkdirSync(stage);
		copyFileSync(join(repoRoot, 'package.json'), join(stage, 'package.json'));
		copyFileSync(join(repoRoot, 'README.md'), join(stage, 'README.md'));

		execFileSync(
			process.execPath,
			[require.resolve('typescript/bin/tsc'), '-p', join(repoRoot, 'tsconfig.json'), '--outDir', join(stage, 'dist')],
			{cwd: repoRoot, stdio: 'pipe'}
		);

		const packed = JSON.parse(
			execFileSync('npm', ['pack', '--json', '--pack-destination', workDir], {
				cwd: stage,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			})
		);
		packedFiles = packed[0].files.map((file: {path: string}) => file.path);

		const modules = join(workDir, 'node_modules');
		mkdirSync(modules);
		execFileSync('tar', ['-xzf', join(workDir, packed[0].filename), '-C', modules]);
		renameSync(join(modules, 'package'), join(modules, 'pg-lightquery'));
	}, 180000);

	afterAll(() => {
		if (workDir) {
			rmSync(workDir, {recursive: true, force: true});
		}
	});

	it('holds only the build, package.json and README.md', () => {
		expect(packedFiles).toContain('package.json');
		expect(packedFiles).toContain('README.md');
		expect(packedFiles).toContain('dist/index.js');
		expect(packedFiles).toContain('dist/schema/index.js');
		const other = packedFiles.filter(
			(path) => !path.startsWith('dist/') && path !== 'package.json' && path !== 'README.md'
		);
		expect(other).toEqual([]);
	});

	it('loads the root entry with require', () => {
		const exported = JSON.parse(runNode(`console.log(JSON.stringify(Object.keys(require('pg-lightquery')).sort()))`));

		expect(exported).toEqual(
			expect.arrayContaining(['TableBase', 'EnhancedTableBase', 'PostgresConnection', 'createChainedInsert', 'sqlExpression'])
		);
		// The schema tools are served from pg-lightquery/schema only.
		expect(exported).not.toContain('checkSchemaDrift');
		expect(exported).not.toContain('generateMigration');
	});

	it('loads pg-lightquery/schema with require', () => {
		const types = JSON.parse(
			runNode(
				`const schema = require('pg-lightquery/schema');` +
					`console.log(JSON.stringify({checkSchemaDrift: typeof schema.checkSchemaDrift, generateMigration: typeof schema.generateMigration, keys: Object.keys(schema).sort()}))`
			)
		);

		expect(types).toEqual({
			checkSchemaDrift: 'function',
			generateMigration: 'function',
			keys: ['checkSchemaDrift', 'generateMigration'],
		});
	});

	it('drafts a migration through the packed entry points', () => {
		const sql = runNode(
			`const {sqlExpression} = require('pg-lightquery');` +
				`const {generateMigration} = require('pg-lightquery/schema');` +
				`const table = {tableName: 'notes', schema: {columns: {createdAt: {type: 'TIMESTAMPTZ', default: sqlExpression('now()')}}}};` +
				`generateMigration([table], {query: async () => ({rows: []}), format: 'sql'}).then((draft) => console.log(draft.steps[0].sql));`
		);

		expect(sql).toBe('CREATE TABLE "public"."notes" (\n\t"createdAt" timestamp with time zone DEFAULT now()\n)');
	});

	it('exports package.json and blocks every other inner path', () => {
		const version = runNode(`console.log(require('pg-lightquery/package.json').version)`);
		expect(version).toBe(require(join(repoRoot, 'package.json')).version);

		const code = runNode(
			`try { require('pg-lightquery/dist/index.js'); console.log('loaded'); } catch (error) { console.log(error.code); }`
		);
		expect(code).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
	});

	it('resolves the types of both entry points under Node16 module resolution', () => {
		const options: ts.CompilerOptions = {
			module: ts.ModuleKind.Node16,
			moduleResolution: ts.ModuleResolutionKind.Node16,
		};
		const from = join(workDir, 'consumer.ts');
		const resolveTypes = (name: string) =>
			ts.resolveModuleName(name, from, options, ts.sys).resolvedModule?.resolvedFileName;

		const packageDir = join(workDir, 'node_modules', 'pg-lightquery');
		expect(existsSync(join(packageDir, 'dist', 'index.d.ts'))).toBe(true);
		expect(existsSync(join(packageDir, 'dist', 'schema', 'index.d.ts'))).toBe(true);
		expect(resolveTypes('pg-lightquery')?.endsWith(join('pg-lightquery', 'dist', 'index.d.ts'))).toBe(true);
		expect(resolveTypes('pg-lightquery/schema')?.endsWith(join('pg-lightquery', 'dist', 'schema', 'index.d.ts'))).toBe(
			true
		);
		expect(resolveTypes('pg-lightquery/dist/index.js')).toBeUndefined();
	});
});
