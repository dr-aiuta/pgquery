import * as ts from 'typescript';
import {SchemaDriftQueryFn} from '../../src/schema/schema-drift';
import {TableDefinition} from '../../src/types';

/** Runs a generated node-pg-migrate file with a fake MigrationBuilder and returns the SQL it issued */
export async function runUp(content: string): Promise<string[]> {
	const js = ts.transpileModule(content, {
		compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018},
	}).outputText;
	const module = {exports: {} as any};
	new Function('module', 'exports', 'require', js)(module, module.exports, require);
	const issued: string[] = [];
	await module.exports.up({sql: (sql: string) => issued.push(sql)});
	return issued;
}

// Empty catalog: every table is missing
export const emptyCatalog: SchemaDriftQueryFn = async () => ({rows: []});

export type CatalogRows = {columns?: any[]; keys?: any[]; foreignKeys?: any[]; enums?: any[]};

/** Routes each catalog query to canned rows, so the generator can be tested without a database */
export function catalogQuery(rows: CatalogRows): SchemaDriftQueryFn {
	return async (text) => {
		if (text.includes('information_schema.columns')) return {rows: rows.columns ?? []};
		if (text.includes('pg_index')) return {rows: rows.keys ?? []};
		if (text.includes('pg_constraint')) return {rows: rows.foreignKeys ?? []};
		if (text.includes('pg_enum')) return {rows: rows.enums ?? []};
		throw new Error(`Unexpected query: ${text}`);
	};
}

/** A row of information_schema.columns for public.users */
export const dbColumn = (overrides: Record<string, any>) => ({
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

/** A users definition with a "name" column plus the given columns */
export const usersWith = (columns: Record<string, any>): TableDefinition<any> => ({
	tableName: 'users',
	schema: {columns: {name: {type: 'TEXT'}, ...columns}},
});

// The four characters that end a line. PostgreSQL ends a `--` comment at the first two.
// JavaScript ends a `//` comment at all four.
export const TERMINATORS: [string, string][] = [
	['LF', String.fromCharCode(0x0a)],
	['CR', String.fromCharCode(0x0d)],
	['U+2028', String.fromCharCode(0x2028)],
	['U+2029', String.fromCharCode(0x2029)],
];

export const FORMATS = ['sql', 'node-pg-migrate-ts', 'node-pg-migrate-js'] as const;

/** Splits text the way PostgreSQL ends a `--` comment: at LF and at CR */
export function sqlLines(content: string): string[] {
	const lf = String.fromCharCode(0x0a);
	const cr = String.fromCharCode(0x0d);
	return content
		.split(cr + lf)
		.join(lf)
		.split(cr)
		.join(lf)
		.split(lf)
		.filter((line) => line !== '');
}
