import PostgresConnection from '../connection/postgres-connection';
import {BaseColumnType, ColumnDefinition, ForeignKeyAction, TableDefinition} from '../types';

/**
 * Schema drift checking.
 *
 * Compares TableDefinition objects against the live database catalog and reports
 * every place where they disagree. It never changes the database. Use it after
 * migrations run (in CI or at startup) to catch definitions that fell out of sync.
 */

export type SchemaDriftKind =
	| 'missing_table'
	| 'missing_column'
	| 'extra_column'
	| 'type_mismatch'
	| 'enum_mismatch'
	| 'nullability_mismatch'
	| 'primary_key_mismatch'
	| 'unique_mismatch'
	| 'auto_increment_mismatch'
	| 'default_mismatch'
	| 'reference_mismatch';

export interface SchemaDriftIssue {
	table: string;
	column?: string;
	kind: SchemaDriftKind;
	expected: string;
	actual: string;
	message: string;
}

export interface SchemaDriftReport {
	ok: boolean;
	issues: SchemaDriftIssue[];
}

export type SchemaDriftQueryFn = (text: string, values: any[]) => Promise<{rows: any[]}>;

export interface SchemaDriftOptions {
	/** Schema used for table names that are not schema-qualified. Defaults to 'public'. */
	defaultSchema?: string;
	/** Do not report database columns that are missing from the definition. Defaults to false. */
	ignoreExtraColumns?: boolean;
	/** Query function to run the catalog queries. Defaults to the initialized PostgresConnection. */
	query?: SchemaDriftQueryFn;
}

// information_schema.columns.data_type for each supported column type
export const SQL_DATA_TYPES: Record<BaseColumnType, string> = {
	VARCHAR: 'character varying',
	TEXT: 'text',
	UUID: 'uuid',
	SMALLINT: 'smallint',
	INTEGER: 'integer',
	BIGINT: 'bigint',
	NUMERIC: 'numeric',
	REAL: 'real',
	'DOUBLE PRECISION': 'double precision',
	BOOLEAN: 'boolean',
	JSON: 'json',
	JSONB: 'jsonb',
	DATE: 'date',
	ENUM: 'USER-DEFINED',
	'TIMESTAMP WITHOUT TIME ZONE': 'timestamp without time zone',
	'TIMESTAMP WITH TIME ZONE': 'timestamp with time zone',
};

// pg_constraint.confdeltype / confupdtype codes
export const FK_ACTIONS: Record<string, ForeignKeyAction> = {
	a: 'NO ACTION',
	r: 'RESTRICT',
	c: 'CASCADE',
	n: 'SET NULL',
	d: 'SET DEFAULT',
};

const TABLES_PARAM = 'unnest($1::text[], $2::text[]) AS target(schema_name, table_name)';

const COLUMNS_SQL = `SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_schema, c.udt_name,
	c.is_nullable, c.column_default, c.is_identity, c.character_maximum_length, c.numeric_precision, c.numeric_scale
FROM information_schema.columns c
JOIN ${TABLES_PARAM} ON c.table_schema = target.schema_name AND c.table_name = target.table_name
ORDER BY c.table_schema, c.table_name, c.ordinal_position`;

// Primary key columns, and columns that carry a single-column unique index of their own
const KEYS_SQL = `SELECT n.nspname AS table_schema, t.relname AS table_name, a.attname AS column_name, i.indisprimary AS is_primary,
	ic.relname AS index_name, con.conname AS constraint_name
FROM pg_index i
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_class ic ON ic.oid = i.indexrelid
LEFT JOIN pg_constraint con ON con.conindid = i.indexrelid AND con.conrelid = i.indrelid AND con.contype IN ('p', 'u')
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN ${TABLES_PARAM} ON n.nspname = target.schema_name AND t.relname = target.table_name
CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
WHERE k.ord <= i.indnkeyatts
	AND (i.indisprimary OR (i.indisunique AND i.indnkeyatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL))`;

// Single-column foreign keys
const FOREIGN_KEYS_SQL = `SELECT n.nspname AS table_schema, t.relname AS table_name, a.attname AS column_name,
	rn.nspname AS ref_schema, rt.relname AS ref_table, ra.attname AS ref_column, c.confdeltype, c.confupdtype,
	c.conname AS constraint_name
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN ${TABLES_PARAM} ON n.nspname = target.schema_name AND t.relname = target.table_name
JOIN pg_class rt ON rt.oid = c.confrelid
JOIN pg_namespace rn ON rn.oid = rt.relnamespace
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`;

const ENUM_LABELS_SQL = `SELECT n.nspname AS udt_schema, t.typname AS udt_name, e.enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN unnest($1::text[], $2::text[]) AS target(schema_name, type_name)
	ON n.nspname = target.schema_name AND t.typname = target.type_name
ORDER BY n.nspname, t.typname, e.enumsortorder`;

export interface QualifiedName {
	schema: string;
	table: string;
}

/**
 * Resolves a table name the way PostgreSQL does for the unquoted names this library emits:
 * unquoted parts fold to lower case, double-quoted parts keep their case.
 */
export function parseTableName(name: string, defaultSchema = 'public'): QualifiedName {
	const part = '("(?:[^"]|"")+"|[^."]+)';
	const match = name.trim().match(new RegExp(`^(?:${part}\\.)?${part}$`));
	const normalize = (value: string) =>
		value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value.toLowerCase();
	if (!match) {
		return {schema: defaultSchema, table: name};
	}
	return {
		schema: match[1] ? normalize(match[1]) : defaultSchema,
		table: normalize(match[2]),
	};
}

export const key = (...parts: string[]) => parts.join('\u0000');

function groupBy<R>(rows: R[], keyOf: (row: R) => string): Map<string, R[]> {
	const map = new Map<string, R[]>();
	for (const row of rows) {
		const k = keyOf(row);
		const list = map.get(k);
		if (list) list.push(row);
		else map.set(k, [row]);
	}
	return map;
}

function formatType(
	def: ColumnDefinition,
	dataType: string,
	length: number | null,
	precision: number | null,
	scale: number | null
) {
	if (def.type === 'VARCHAR' && def.length !== undefined && dataType === 'character varying') {
		return length === null ? dataType : `${dataType}(${length})`;
	}
	if (def.type === 'NUMERIC' && def.precision !== undefined && dataType === 'numeric') {
		return precision === null ? dataType : `${dataType}(${precision},${scale ?? 0})`;
	}
	return dataType;
}

// Target plus the referential actions the definition cares about, e.g. "public.users(id) ON DELETE CASCADE"
function describeForeignKey(target: string, onDelete?: string, onUpdate?: string): string {
	return [target, onDelete && `ON DELETE ${onDelete}`, onUpdate && `ON UPDATE ${onUpdate}`].filter(Boolean).join(' ');
}

function expectedType(def: ColumnDefinition): string {
	const dataType = SQL_DATA_TYPES[def.type as BaseColumnType] ?? String(def.type);
	if (def.type === 'VARCHAR' && def.length !== undefined) return `${dataType}(${def.length})`;
	if (def.type === 'NUMERIC' && def.precision !== undefined) return `${dataType}(${def.precision},${def.scale ?? 0})`;
	return dataType;
}

export interface ResolvedTable {
	name: QualifiedName;
	columns: Record<string, ColumnDefinition>;
}

/** Catalog rows for the checked tables, grouped for lookup. Internal to the schema tools. */
export interface SchemaCatalog {
	columnsByTable: Map<string, any[]>;
	keysByColumn: Map<string, any[]>;
	foreignKeysByColumn: Map<string, any[]>;
	/** Enum labels in sort order, keyed by key(schema, typeName) */
	enumLabels: Map<string, string[]>;
}

export function resolveTables(tables: TableDefinition<any>[], defaultSchema: string): ResolvedTable[] {
	return tables.map((table) => ({
		name: parseTableName(table.tableName, defaultSchema),
		columns: table.schema.columns as Record<string, ColumnDefinition>,
	}));
}

export function enumValues(def: ColumnDefinition): string[] {
	if (def.enum === undefined) return [];
	return (Array.isArray(def.enum) ? def.enum : [def.enum]).map(String);
}

/** Enum type used for an ENUM column: `enumTypeName` when set, otherwise `<table>_<column>` in the table's schema. */
export function enumTypeFor(table: QualifiedName, column: string, def: ColumnDefinition): QualifiedName {
	return def.enumTypeName
		? parseTableName(def.enumTypeName, table.schema)
		: {schema: table.schema, table: `${table.table}_${column}`.toLowerCase()};
}

export function queryFnFrom(options: SchemaDriftOptions): SchemaDriftQueryFn {
	return options.query ?? ((text, values) => PostgresConnection.getInstance().query(text, values));
}

export async function readCatalog(targets: ResolvedTable[], query: SchemaDriftQueryFn): Promise<SchemaCatalog> {
	const params = [targets.map((t) => t.name.schema), targets.map((t) => t.name.table)];

	const [columnsResult, keysResult, foreignKeysResult] = await Promise.all([
		query(COLUMNS_SQL, params),
		query(KEYS_SQL, params),
		query(FOREIGN_KEYS_SQL, params),
	]);

	// Enum types used by existing columns, plus the ones the definitions expect (so new ones can be detected)
	const enumTypes = new Map<string, QualifiedName>();
	for (const r of columnsResult.rows.filter((r) => r.data_type === 'USER-DEFINED')) {
		enumTypes.set(key(r.udt_schema, r.udt_name), {schema: r.udt_schema, table: r.udt_name});
	}
	for (const {name, columns} of targets) {
		for (const [column, def] of Object.entries(columns)) {
			if (def.type !== 'ENUM') continue;
			const type = enumTypeFor(name, column, def);
			enumTypes.set(key(type.schema, type.table), type);
		}
	}
	const typeList = [...enumTypes.values()];
	const enumRows =
		typeList.length > 0
			? (await query(ENUM_LABELS_SQL, [typeList.map((t) => t.schema), typeList.map((t) => t.table)])).rows
			: [];

	const enumLabels = new Map<string, string[]>();
	for (const row of enumRows) {
		const k = key(row.udt_schema, row.udt_name);
		enumLabels.set(k, [...(enumLabels.get(k) ?? []), row.enumlabel]);
	}

	return {
		columnsByTable: groupBy(columnsResult.rows, (r) => key(r.table_schema, r.table_name)),
		keysByColumn: groupBy(keysResult.rows, (r) => key(r.table_schema, r.table_name, r.column_name)),
		foreignKeysByColumn: groupBy(foreignKeysResult.rows, (r) => key(r.table_schema, r.table_name, r.column_name)),
		enumLabels,
	};
}

export function compareWithCatalog(
	targets: ResolvedTable[],
	catalog: SchemaCatalog,
	defaultSchema: string,
	ignoreExtraColumns: boolean
): SchemaDriftIssue[] {
	const issues: SchemaDriftIssue[] = [];

	for (const {name, columns: definedColumns} of targets) {
		const tableLabel = `${name.schema}.${name.table}`;
		const report = (
			kind: SchemaDriftKind,
			column: string | undefined,
			expected: string,
			actual: string,
			detail: string
		) =>
			issues.push({
				table: tableLabel,
				column,
				kind,
				expected,
				actual,
				message: `${column ? `${tableLabel}.${column}` : tableLabel}: ${detail} (expected ${expected}, found ${actual})`,
			});

		const dbColumns = catalog.columnsByTable.get(key(name.schema, name.table));
		if (!dbColumns) {
			report('missing_table', undefined, 'table', 'nothing', 'table does not exist');
			continue;
		}

		const dbColumnsByName = new Map(dbColumns.map((c) => [c.column_name as string, c]));

		for (const [columnName, def] of Object.entries(definedColumns)) {
			const col = dbColumnsByName.get(columnName);
			if (!col) {
				report('missing_column', columnName, 'column', 'nothing', 'column does not exist');
				continue;
			}

			const columnKey = key(name.schema, name.table, columnName);
			const keys = catalog.keysByColumn.get(columnKey) ?? [];
			const isPrimary = keys.some((k) => k.is_primary);
			const hasUniqueIndex = keys.some((k) => !k.is_primary);
			const isAutoIncrement = col.is_identity === 'YES' || /^nextval\(/i.test(col.column_default ?? '');

			// Type
			const expected = expectedType(def);
			const actual = formatType(
				def,
				col.data_type,
				col.character_maximum_length,
				col.numeric_precision,
				col.numeric_scale
			);
			if (def.type === 'ENUM' && col.data_type === 'USER-DEFINED') {
				const inDb = catalog.enumLabels.get(key(col.udt_schema, col.udt_name));
				const namedType = def.enumTypeName ? parseTableName(def.enumTypeName, name.schema) : undefined;
				if (!inDb) {
					report('type_mismatch', columnName, 'enum type', col.udt_name, 'type differs');
				} else if (namedType && (namedType.schema !== col.udt_schema || namedType.table !== col.udt_name)) {
					report(
						'type_mismatch',
						columnName,
						`${namedType.schema}.${namedType.table}`,
						`${col.udt_schema}.${col.udt_name}`,
						'enum type differs'
					);
				} else if (def.enum !== undefined) {
					const defined = enumValues(def);
					const sameSet = defined.length === inDb.length && defined.every((value) => inDb.includes(value));
					if (!sameSet) {
						report('enum_mismatch', columnName, defined.join(', '), inDb.join(', '), 'enum values differ');
					}
				}
			} else if (expected !== actual) {
				report('type_mismatch', columnName, expected, actual, 'type differs');
			}

			// Nullability. A primary key column is always NOT NULL.
			const expectNotNull = def.notNull === true || def.primaryKey === true;
			const isNotNull = col.is_nullable === 'NO';
			if (expectNotNull !== isNotNull) {
				report(
					'nullability_mismatch',
					columnName,
					expectNotNull ? 'NOT NULL' : 'nullable',
					isNotNull ? 'NOT NULL' : 'nullable',
					'nullability differs'
				);
			}

			// Primary key
			if ((def.primaryKey === true) !== isPrimary) {
				report(
					'primary_key_mismatch',
					columnName,
					def.primaryKey ? 'primary key' : 'not a primary key',
					isPrimary ? 'primary key' : 'not a primary key',
					'primary key membership differs'
				);
			}

			// Unique. A primary key is already unique, so the flag is not checked on primary key columns.
			if (!def.primaryKey && (def.unique === true) !== hasUniqueIndex) {
				report(
					'unique_mismatch',
					columnName,
					def.unique ? 'unique' : 'not unique',
					hasUniqueIndex ? 'unique' : 'not unique',
					'unique constraint differs'
				);
			}

			// Auto increment: serial/bigserial default or identity column
			if ((def.autoIncrement === true) !== isAutoIncrement) {
				report(
					'auto_increment_mismatch',
					columnName,
					def.autoIncrement ? 'auto increment' : 'no auto increment',
					isAutoIncrement ? 'auto increment' : 'no auto increment',
					'auto increment differs'
				);
			}

			// Default: presence only. Expressions are not compared because PostgreSQL rewrites them.
			const expectDefault = def.default !== undefined;
			const hasDefault = col.column_default !== null && col.column_default !== undefined && !isAutoIncrement;
			if (expectDefault !== hasDefault) {
				report(
					'default_mismatch',
					columnName,
					expectDefault ? `default ${String(def.default)}` : 'no default',
					hasDefault ? `default ${col.column_default}` : 'no default',
					'default differs'
				);
			}

			// Foreign key
			const foreignKeys = catalog.foreignKeysByColumn.get(columnKey) ?? [];
			const ref = def.references;
			if (ref) {
				const target = parseTableName(ref.table, defaultSchema);
				const matches = (fk: any) =>
					fk.ref_schema === target.schema &&
					fk.ref_table === target.table &&
					fk.ref_column === ref.column &&
					(ref.onDelete === undefined || FK_ACTIONS[fk.confdeltype] === ref.onDelete) &&
					(ref.onUpdate === undefined || FK_ACTIONS[fk.confupdtype] === ref.onUpdate);
				if (!foreignKeys.some(matches)) {
					const found = foreignKeys.map((fk) =>
						describeForeignKey(
							`${fk.ref_schema}.${fk.ref_table}(${fk.ref_column})`,
							ref.onDelete && FK_ACTIONS[fk.confdeltype],
							ref.onUpdate && FK_ACTIONS[fk.confupdtype]
						)
					);
					report(
						'reference_mismatch',
						columnName,
						describeForeignKey(`${target.schema}.${target.table}(${ref.column})`, ref.onDelete, ref.onUpdate),
						found.length > 0 ? found.join(', ') : 'no foreign key',
						'foreign key differs'
					);
				}
			} else if (foreignKeys.length > 0) {
				report(
					'reference_mismatch',
					columnName,
					'no foreign key',
					foreignKeys.map((fk) => describeForeignKey(`${fk.ref_schema}.${fk.ref_table}(${fk.ref_column})`)).join(', '),
					'foreign key differs'
				);
			}
		}

		if (!ignoreExtraColumns) {
			for (const col of dbColumns) {
				if (!Object.prototype.hasOwnProperty.call(definedColumns, col.column_name)) {
					report('extra_column', col.column_name, 'nothing', 'column', 'column is not in the definition');
				}
			}
		}
	}

	return issues;
}

/**
 * Compares table definitions with the database and returns every difference found.
 * Only reads the system catalog. Composite unique constraints and composite foreign keys are not compared.
 */
export async function checkSchemaDrift(
	tables: TableDefinition<any>[],
	options: SchemaDriftOptions = {}
): Promise<SchemaDriftReport> {
	const defaultSchema = options.defaultSchema ?? 'public';
	const targets = resolveTables(tables, defaultSchema);
	const catalog = await readCatalog(targets, queryFnFrom(options));
	const issues = compareWithCatalog(targets, catalog, defaultSchema, options.ignoreExtraColumns ?? false);
	return {ok: issues.length === 0, issues};
}
