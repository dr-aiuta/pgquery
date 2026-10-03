import {ColumnDefinition, TableDefinition} from '../types';
import {isSqlExpression} from '../sql/expression';
import {
	compareWithCatalog,
	enumTypeFor,
	enumValues,
	hasDefinedDefault,
	key,
	parseTableName,
	QualifiedName,
	queryFnFrom,
	readCatalog,
	resolveTables,
	ResolvedTable,
	SchemaCatalog,
	SchemaDriftIssue,
	SchemaDriftOptions,
	sqlDataType,
} from './schema-drift';

/**
 * Migration drafts.
 *
 * Turns the differences found by checkSchemaDrift into SQL that brings the database in line with the
 * table definitions. The result is a draft for a human to review and commit, never applied automatically.
 *
 * Safety rule:
 * - Active steps only add things, and fail loudly at migration time if existing data conflicts
 *   (create type/table, add column, add enum value, add unique constraint, add foreign key, set default).
 * - Everything that removes or changes something is emitted commented out with a review note
 *   (drops, DROP/SET NOT NULL, type changes, primary key and identity changes, replacing a foreign key).
 *   A definition that merely forgot a flag can therefore never silently remove a production constraint.
 *
 * A review step must stay inert whatever text it carries. Two layers guarantee that:
 * - Names with a line break are rejected, whether they come from a definition or from the catalog.
 * - Notes and SQL are commented out by one function that treats \n, \r, U+2028 and U+2029 as line ends.
 */

export type MigrationFormat = 'node-pg-migrate-ts' | 'node-pg-migrate-js' | 'sql';

export interface MigrationStep {
	/** SQL for this step. May contain several statements. */
	sql: string;
	/** true when the step is emitted commented out because it removes or changes something */
	review: boolean;
	note?: string;
}

export interface GeneratedMigration {
	/** true when the definitions and the database differ */
	hasChanges: boolean;
	/** true when at least one step is commented out and needs a human decision */
	needsReview: boolean;
	steps: MigrationStep[];
	/** The drift issues the steps were generated from */
	issues: SchemaDriftIssue[];
	/** File content in the requested format, ready to write into the migrations directory */
	content: string;
}

export interface GenerateMigrationOptions extends SchemaDriftOptions {
	/** Output format. Defaults to 'node-pg-migrate-ts'. */
	format?: MigrationFormat;
}

// ---------- SQL rendering ----------

const LINE_TERMINATOR = /[\r\n\u2028\u2029]/;
const LINE_TERMINATORS = /\r\n|[\n\r\u2028\u2029]/g;

function printable(value: string): string {
	return JSON.stringify(value)
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

/**
 * Rejects a name that contains a line break. A line break would end the comment that keeps a review
 * step inert, in SQL and in JavaScript. PostgreSQL accepts such names. This generator does not.
 */
export function assertSingleLine(kind: string, value: unknown): void {
	if (typeof value === 'string' && LINE_TERMINATOR.test(value)) {
		throw new Error(`${kind} ${printable(value)} contains a line break. A migration cannot be drafted for it.`);
	}
}

export function quoteIdent(name: string): string {
	assertSingleLine('Identifier', name);
	return `"${name.replace(/"/g, '""')}"`;
}

function quoteName(name: QualifiedName): string {
	return `${quoteIdent(name.schema)}.${quoteIdent(name.table)}`;
}

function quoteLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function enumLabel(value: string): string {
	assertSingleLine('Enum label', value);
	return quoteLiteral(value);
}

/**
 * String defaults that are still read as SQL expressions, for definitions written before sqlExpression existed.
 * A string must equal one of them exactly, in any case. Every other string is a literal.
 */
const EXPRESSION_DEFAULTS = ['now()', 'current_timestamp', 'current_date', 'gen_random_uuid()'];

/**
 * Renders a definition default. sqlExpression(...) is an expression. A string is a literal,
 * except for the short compatibility list above. Everything else, including plain objects
 * for JSON columns, is a literal.
 */
export function defaultToSql(value: unknown): string {
	if (isSqlExpression(value)) return value.sql;
	if (value === null) return 'NULL';
	if (typeof value === 'number' || typeof value === 'bigint') return String(value);
	if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
	if (value instanceof Date) return quoteLiteral(value.toISOString());
	if (typeof value === 'string') {
		return EXPRESSION_DEFAULTS.includes(value.toLowerCase()) ? value : quoteLiteral(value);
	}
	return quoteLiteral(JSON.stringify(value));
}

function columnType(table: QualifiedName, column: string, def: ColumnDefinition): string {
	if (def.type === 'ENUM') return quoteName(enumTypeFor(table, column, def));
	if (def.type === 'VARCHAR' && def.length !== undefined) return `varchar(${def.length})`;
	if (def.type === 'NUMERIC' && def.precision !== undefined) return `numeric(${def.precision}, ${def.scale ?? 0})`;
	return sqlDataType(def.type);
}

function referenceSql(def: ColumnDefinition, defaultSchema: string): string {
	const ref = def.references!;
	return [
		`REFERENCES ${quoteName(parseTableName(ref.table, defaultSchema))} (${quoteIdent(ref.column)})`,
		ref.onDelete && `ON DELETE ${ref.onDelete}`,
		ref.onUpdate && `ON UPDATE ${ref.onUpdate}`,
	]
		.filter(Boolean)
		.join(' ');
}

/** Column definition SQL. Foreign keys are added separately, after every table and column exists. */
function columnSql(table: QualifiedName, column: string, def: ColumnDefinition, inlinePrimaryKey: boolean): string {
	const parts = [quoteIdent(column), columnType(table, column, def)];
	if (def.autoIncrement) parts.push('GENERATED BY DEFAULT AS IDENTITY');
	if (def.notNull || def.primaryKey) parts.push('NOT NULL');
	if (hasDefinedDefault(def) && !def.autoIncrement) parts.push(`DEFAULT ${defaultToSql(def.default)}`);
	if (inlinePrimaryKey) parts.push('PRIMARY KEY');
	else if (def.unique && !def.primaryKey) parts.push('UNIQUE');
	return parts.join(' ');
}

// ---------- step generation ----------

const PENDING_NOTE = 'Depends on a table, column or enum type that is only created in a review step.';

interface PlannedForeignKey {
	table: QualifiedName;
	column: string;
	def: ColumnDefinition;
	note?: string;
	/** Statements that drop the current foreign key first. Replacing a foreign key always needs review. */
	drops?: string[];
}

class StepList {
	readonly types: MigrationStep[] = [];
	readonly tables: MigrationStep[] = [];
	readonly changes: MigrationStep[] = [];
	private plannedForeignKeys: PlannedForeignKey[] = [];
	/** Enum types created by this migration, and whether they are created actively */
	private plannedTypes = new Map<string, boolean>();
	/** Enum labels this migration already adds, keyed by key(schema, typeName, label) */
	private plannedLabels = new Set<string>();
	/** Tables and columns only created in review steps. Anything depending on them must be reviewed too. */
	private pending = new Set<string>();

	constructor(
		private catalog: SchemaCatalog,
		private defaultSchema: string
	) {}

	/**
	 * Returns the ADD VALUE statements for the labels that an existing enum type lacks.
	 * Each label is returned once per migration, even when several columns need it.
	 */
	missingLabelStatements(type: QualifiedName, defined: string[]): string[] {
		const inDb = this.catalog.enumLabels.get(key(type.schema, type.table)) ?? [];
		const statements: string[] = [];
		for (const value of defined) {
			const labelKey = key(type.schema, type.table, value);
			if (inDb.includes(value) || this.plannedLabels.has(labelKey)) continue;
			this.plannedLabels.add(labelKey);
			statements.push(`ALTER TYPE ${quoteName(type)} ADD VALUE IF NOT EXISTS ${enumLabel(value)}`);
		}
		return statements;
	}

	/**
	 * Plans the enum type of a column. A missing type is created. An existing type gets the labels it lacks,
	 * ahead of the table or column that needs them. Returns false when the type is only created in a review step.
	 */
	ensureEnumType(table: QualifiedName, column: string, def: ColumnDefinition): boolean {
		const type = enumTypeFor(table, column, def);
		const typeKey = key(type.schema, type.table);
		if (this.catalog.enumLabels.has(typeKey)) {
			for (const sql of this.missingLabelStatements(type, enumValues(def))) {
				this.types.push({sql, review: false});
			}
			return true;
		}
		const planned = this.plannedTypes.get(typeKey);
		if (planned !== undefined) return planned;

		const values = enumValues(def);
		const ready = values.length > 0;
		this.plannedTypes.set(typeKey, ready);
		this.types.push(
			ready
				? {sql: `CREATE TYPE ${quoteName(type)} AS ENUM (${values.map(enumLabel).join(', ')})`, review: false}
				: {
						sql: `CREATE TYPE ${quoteName(type)} AS ENUM (/* values */)`,
						review: true,
						note: `Enum type ${type.schema}.${type.table} does not exist and the definition lists no enum values.`,
					}
		);
		return ready;
	}

	/** Plans the enum types of all ENUM columns. Returns false when any of them is only created in a review step. */
	ensureEnumTypes(table: QualifiedName, columns: [string, ColumnDefinition][]): boolean {
		const ready = columns.map(([column, def]) => def.type !== 'ENUM' || this.ensureEnumType(table, column, def));
		return ready.every(Boolean);
	}

	markPending(table: QualifiedName, column?: string) {
		this.pending.add(column === undefined ? key(table.schema, table.table) : key(table.schema, table.table, column));
	}

	private isPending(table: QualifiedName, column: string): boolean {
		return this.pending.has(key(table.schema, table.table)) || this.pending.has(key(table.schema, table.table, column));
	}

	planForeignKey(foreignKey: PlannedForeignKey) {
		this.plannedForeignKeys.push(foreignKey);
	}

	/** Foreign keys go last, so circular references and references to columns added in this migration work */
	private foreignKeySteps(): MigrationStep[] {
		return this.plannedForeignKeys.map(({table, column, def, note, drops}) => {
			const ref = def.references!;
			const target = parseTableName(ref.table, this.defaultSchema);
			const sql = [
				...(drops ?? []),
				`ALTER TABLE ${quoteName(table)} ADD FOREIGN KEY (${quoteIdent(column)}) ${referenceSql(def, this.defaultSchema)}`,
			].join(';\n');
			const blocked = this.isPending(table, column) || this.isPending(target, ref.column);
			if (!drops && !blocked) return {sql, review: false, note};
			return {sql, review: true, note: [note, blocked && PENDING_NOTE].filter(Boolean).join(' ')};
		});
	}

	all(): MigrationStep[] {
		return [...this.types, ...this.tables, ...this.changes, ...this.foreignKeySteps()];
	}
}

function createTableStep(table: ResolvedTable, steps: StepList): MigrationStep {
	const entries = Object.entries(table.columns);
	const typesReady = steps.ensureEnumTypes(table.name, entries);
	const primaryKeys = entries.filter(([, def]) => def.primaryKey).map(([column]) => column);
	const lines = entries.map(([column, def]) =>
		columnSql(table.name, column, def, primaryKeys.length === 1 && def.primaryKey === true)
	);
	if (primaryKeys.length > 1) lines.push(`PRIMARY KEY (${primaryKeys.map(quoteIdent).join(', ')})`);
	for (const [column, def] of entries) {
		if (def.references) steps.planForeignKey({table: table.name, column, def});
	}

	const sql = `CREATE TABLE ${quoteName(table.name)} (\n\t${lines.join(',\n\t')}\n)`;
	if (typesReady) return {sql, review: false};
	steps.markPending(table.name);
	return {sql, review: true, note: PENDING_NOTE};
}

/** SQL that changes a column's type. A current default that cannot be cast is dropped first, then the defined one is restored. */
function retypeColumn(
	table: QualifiedName,
	column: string,
	dbColumn: any,
	def: ColumnDefinition,
	type: string,
	using: string
): string[] {
	const t = quoteName(table);
	const c = quoteIdent(column);
	const hasDefault =
		dbColumn?.column_default != null && dbColumn.is_identity !== 'YES' && !/^nextval\(/i.test(dbColumn.column_default);
	return [
		hasDefault && `ALTER TABLE ${t} ALTER COLUMN ${c} DROP DEFAULT`,
		`ALTER TABLE ${t} ALTER COLUMN ${c} TYPE ${type} USING ${using}`,
		hasDefault &&
			hasDefinedDefault(def) &&
			`ALTER TABLE ${t} ALTER COLUMN ${c} SET DEFAULT ${defaultToSql(def.default)}`,
	].filter(Boolean) as string[];
}

/**
 * Throws when a name the draft could carry contains a line break. It checks the definitions and
 * the catalog rows of the checked tables: schemas, tables, columns, types, enum labels,
 * constraints and indexes. Default values are not names and may span lines.
 */
function assertDraftable(targets: ResolvedTable[], catalog: SchemaCatalog, defaultSchema: string): void {
	for (const {name, columns} of targets) {
		assertSingleLine('Schema name', name.schema);
		assertSingleLine('Table name', name.table);
		for (const [column, def] of Object.entries(columns)) {
			assertSingleLine('Column name', column);
			assertSingleLine('Type name', def.type);
			if (def.type === 'ENUM') {
				const type = enumTypeFor(name, column, def);
				assertSingleLine('Type name', type.schema);
				assertSingleLine('Type name', type.table);
				enumValues(def).forEach((label) => assertSingleLine('Enum label', label));
			}
			if (def.references) {
				const target = parseTableName(def.references.table, defaultSchema);
				assertSingleLine('Schema name', target.schema);
				assertSingleLine('Table name', target.table);
				assertSingleLine('Column name', def.references.column);
			}
		}
	}
	for (const rows of catalog.columnsByTable.values()) {
		for (const row of rows) {
			assertSingleLine('Column name', row.column_name);
			assertSingleLine('Type name', row.data_type);
			assertSingleLine('Type name', row.udt_schema);
			assertSingleLine('Type name', row.udt_name);
		}
	}
	for (const rows of catalog.keysByColumn.values()) {
		for (const row of rows) {
			assertSingleLine('Constraint name', row.constraint_name);
			assertSingleLine('Index name', row.index_name);
		}
	}
	for (const rows of catalog.foreignKeysByColumn.values()) {
		for (const row of rows) {
			assertSingleLine('Constraint name', row.constraint_name);
			assertSingleLine('Schema name', row.ref_schema);
			assertSingleLine('Table name', row.ref_table);
			assertSingleLine('Column name', row.ref_column);
		}
	}
	for (const [typeKey, labels] of catalog.enumLabels) {
		typeKey.split('\u0000').forEach((part) => assertSingleLine('Type name', part));
		labels.forEach((label) => assertSingleLine('Enum label', label));
	}
}

/**
 * Turns drift issues into migration steps. Exported for tests, which feed it hand-built issues.
 * It is not part of the package's public API.
 */
export function buildSteps(
	targets: ResolvedTable[],
	catalog: SchemaCatalog,
	issues: SchemaDriftIssue[],
	defaultSchema: string
): MigrationStep[] {
	assertDraftable(targets, catalog, defaultSchema);
	const steps = new StepList(catalog, defaultSchema);
	const byLabel = new Map(targets.map((t) => [`${t.name.schema}.${t.name.table}`, t]));
	const primaryKeyHandled = new Set<string>();
	const enumTypesHandled = new Set<string>();
	const dbColumnsOf = (table: ResolvedTable) =>
		catalog.columnsByTable.get(key(table.name.schema, table.name.table)) ?? [];

	for (const issue of issues.filter((i) => i.kind === 'missing_table')) {
		steps.tables.push(createTableStep(byLabel.get(issue.table)!, steps));
	}

	for (const issue of issues) {
		if (issue.kind === 'missing_table' || !issue.column) continue;
		const table = byLabel.get(issue.table)!;
		const t = quoteName(table.name);
		const c = quoteIdent(issue.column);
		const def = table.columns[issue.column];
		const columnKey = key(table.name.schema, table.name.table, issue.column);
		const dbColumn = dbColumnsOf(table).find((col) => col.column_name === issue.column);
		const keys = catalog.keysByColumn.get(columnKey) ?? [];
		const foreignKeys = catalog.foreignKeysByColumn.get(columnKey) ?? [];
		const add = (sql: string, note?: string) => steps.changes.push({sql, review: false, note});
		const review = (sql: string, note: string) => steps.changes.push({sql, review: true, note});
		const dropForeignKeys = () =>
			foreignKeys.map((fk) => `ALTER TABLE ${t} DROP CONSTRAINT ${quoteIdent(fk.constraint_name)}`);

		switch (issue.kind) {
			case 'missing_column': {
				const typeReady = def.type !== 'ENUM' || steps.ensureEnumType(table.name, issue.column, def);
				const sql = `ALTER TABLE ${t} ADD COLUMN ${columnSql(table.name, issue.column, def, false)}`;
				if (def.references) steps.planForeignKey({table: table.name, column: issue.column, def});
				if (def.primaryKey) {
					steps.markPending(table.name, issue.column);
					review(sql, `${issue.column} is a primary key column. Add it to the primary key by hand.`);
				} else if (!typeReady) {
					steps.markPending(table.name, issue.column);
					review(sql, PENDING_NOTE);
				} else if (def.notNull && !hasDefinedDefault(def) && !def.autoIncrement) {
					add(sql, 'NOT NULL without a default fails if the table has rows. Add a default or backfill first.');
				} else {
					add(sql);
				}
				break;
			}
			case 'extra_column': {
				const candidates = issues
					.filter((i) => i.kind === 'missing_column' && i.table === issue.table)
					.map((i) => quoteIdent(i.column!));
				const rename =
					candidates.length === 1
						? ` If it was renamed, use: ALTER TABLE ${t} RENAME COLUMN ${c} TO ${candidates[0]}`
						: candidates.length > 1
							? ` If it was renamed, use: ALTER TABLE ${t} RENAME COLUMN ${c} TO <new name>. New columns in this table: ${candidates.join(', ')}.`
							: '';
				review(`ALTER TABLE ${t} DROP COLUMN ${c}`, `Dropping ${issue.column} deletes its data.${rename}`);
				break;
			}
			case 'type_mismatch': {
				if (def.type === 'ENUM') steps.ensureEnumType(table.name, issue.column, def);
				const type = columnType(table.name, issue.column, def);
				const using = def.type === 'ENUM' ? `${c}::text::${type}` : `${c}::${type}`;
				review(
					retypeColumn(table.name, issue.column, dbColumn, def, type, using).join(';\n'),
					`Type change from ${issue.actual} to ${issue.expected}. Check the cast: values may be converted, rounded or rejected.`
				);
				break;
			}
			case 'enum_mismatch': {
				// One step per enum type, even when several columns share it
				const typeKey = key(dbColumn.udt_schema, dbColumn.udt_name);
				if (enumTypesHandled.has(typeKey)) break;
				enumTypesHandled.add(typeKey);
				const typeName = {schema: dbColumn.udt_schema, table: dbColumn.udt_name};
				const type = quoteName(typeName);
				const inDb = catalog.enumLabels.get(typeKey) ?? [];
				const defined = enumValues(def);
				for (const sql of steps.missingLabelStatements(typeName, defined)) {
					add(sql);
				}
				const removed = inDb.filter((v) => !defined.includes(v));
				if (removed.length > 0) {
					const retypes = targets.flatMap((target) =>
						dbColumnsOf(target)
							.filter((col) => col.udt_schema === typeName.schema && col.udt_name === typeName.table)
							.filter((col) => target.columns[col.column_name] !== undefined)
							.flatMap((col) =>
								retypeColumn(
									target.name,
									col.column_name,
									col,
									target.columns[col.column_name],
									type,
									`${quoteIdent(col.column_name)}::text::${type}`
								)
							)
					);
					review(
						[
							`ALTER TYPE ${type} RENAME TO ${quoteIdent(`${typeName.table}_old`)}`,
							`CREATE TYPE ${type} AS ENUM (${defined.map(enumLabel).join(', ')})`,
							...retypes,
							`DROP TYPE ${quoteName({schema: typeName.schema, table: `${typeName.table}_old`})}`,
						].join(';\n'),
						`PostgreSQL cannot drop enum values (${removed.join(', ')}). Recreate the type after migrating rows that use them. Columns outside the checked tables that use the type must be converted too.`
					);
				}
				break;
			}
			case 'nullability_mismatch': {
				if (def.primaryKey || keys.some((k) => k.is_primary)) break; // handled with the primary key
				if (issue.expected === 'NOT NULL') {
					review(
						`ALTER TABLE ${t} ALTER COLUMN ${c} SET NOT NULL`,
						`Fails if rows contain NULL. Backfill first, e.g. UPDATE ${t} SET ${c} = ... WHERE ${c} IS NULL.`
					);
				} else {
					review(`ALTER TABLE ${t} ALTER COLUMN ${c} DROP NOT NULL`, 'Removes a NOT NULL constraint.');
				}
				break;
			}
			case 'primary_key_mismatch': {
				if (primaryKeyHandled.has(issue.table)) break;
				primaryKeyHandled.add(issue.table);
				const constraintNames = new Set<string>();
				const currentKeyColumns: string[] = [];
				for (const col of dbColumnsOf(table)) {
					const primary = (
						catalog.keysByColumn.get(key(table.name.schema, table.name.table, col.column_name)) ?? []
					).filter((k) => k.is_primary);
					if (primary.length === 0) continue;
					currentKeyColumns.push(col.column_name);
					primary.forEach((k) => k.constraint_name && constraintNames.add(k.constraint_name));
				}
				const statements = [...constraintNames].map((name) => `ALTER TABLE ${t} DROP CONSTRAINT ${quoteIdent(name)}`);
				// Dropping a primary key keeps NOT NULL, so release it where the definition wants the column nullable
				for (const column of currentKeyColumns) {
					const columnDef = table.columns[column];
					if (columnDef && !columnDef.primaryKey && !columnDef.notNull) {
						statements.push(`ALTER TABLE ${t} ALTER COLUMN ${quoteIdent(column)} DROP NOT NULL`);
					}
				}
				const wanted = Object.entries(table.columns)
					.filter(([, d]) => d.primaryKey)
					.map(([column]) => quoteIdent(column));
				if (wanted.length > 0) statements.push(`ALTER TABLE ${t} ADD PRIMARY KEY (${wanted.join(', ')})`);
				review(
					statements.join(';\n'),
					'Primary key change. Foreign keys that reference the old key must be dropped first and recreated.'
				);
				break;
			}
			case 'unique_mismatch': {
				if (issue.expected === 'unique') {
					add(`ALTER TABLE ${t} ADD UNIQUE (${c})`, 'Fails if the column has duplicate values.');
				} else {
					const drops = keys
						.filter((k) => !k.is_primary)
						.map((k) =>
							k.constraint_name
								? `ALTER TABLE ${t} DROP CONSTRAINT ${quoteIdent(k.constraint_name)}`
								: `DROP INDEX ${quoteName({schema: table.name.schema, table: k.index_name})}`
						);
					review(drops.join(';\n'), 'Removes a unique constraint.');
				}
				break;
			}
			case 'auto_increment_mismatch': {
				if (issue.expected === 'auto increment') {
					review(
						[
							`ALTER TABLE ${t} ALTER COLUMN ${c} DROP DEFAULT`,
							`ALTER TABLE ${t} ALTER COLUMN ${c} ADD GENERATED BY DEFAULT AS IDENTITY`,
							`SELECT setval(pg_get_serial_sequence('${t.replace(/'/g, "''")}', '${issue.column.replace(/'/g, "''")}'), COALESCE(MAX(${c}), 0) + 1, false) FROM ${t}`,
						].join(';\n'),
						'Makes the column an identity column and starts it after the current maximum value.'
					);
				} else {
					const sql =
						dbColumn.is_identity === 'YES'
							? `ALTER TABLE ${t} ALTER COLUMN ${c} DROP IDENTITY`
							: `ALTER TABLE ${t} ALTER COLUMN ${c} DROP DEFAULT`;
					review(sql, 'Removes auto increment. Inserts that omit this column will fail.');
				}
				break;
			}
			case 'default_mismatch': {
				if (hasDefinedDefault(def)) {
					add(`ALTER TABLE ${t} ALTER COLUMN ${c} SET DEFAULT ${defaultToSql(def.default)}`);
				} else {
					review(
						`ALTER TABLE ${t} ALTER COLUMN ${c} DROP DEFAULT`,
						'Removes a default. Inserts that omit this column may fail.'
					);
				}
				break;
			}
			case 'reference_mismatch': {
				if (!def.references) {
					review(dropForeignKeys().join(';\n'), 'Removes a foreign key.');
				} else if (foreignKeys.length === 0) {
					steps.planForeignKey({
						table: table.name,
						column: issue.column,
						def,
						note: 'Fails if rows reference missing parents.',
					});
				} else {
					steps.planForeignKey({
						table: table.name,
						column: issue.column,
						def,
						drops: dropForeignKeys(),
						note: `Replaces the foreign key ${issue.actual} with ${issue.expected}.`,
					});
				}
				break;
			}
		}
	}

	return steps.all();
}

// ---------- file rendering ----------

/**
 * Comments out the whole text by putting the prefix in front of every line.
 *
 * A line ends at \n, \r, U+2028 or U+2029. PostgreSQL ends a `--` comment at the first two.
 * JavaScript ends a `//` comment at all four. The line ends themselves are kept as they are.
 * Notes and SQL both go through this function, so no text can leave its comment.
 */
export function commentOut(text: string, prefix: string): string {
	return prefix + text.replace(LINE_TERMINATORS, (terminator) => terminator + prefix);
}

function renderSql(steps: MigrationStep[]): string {
	const prefix = '-- ';
	const body = steps.map((step) => {
		const sql = `${step.sql};`;
		if (step.review) {
			return `${commentOut(`REVIEW: ${step.note}`, prefix)}\n${commentOut(sql, prefix)}`;
		}
		return step.note ? `${commentOut(step.note, prefix)}\n${sql}` : sql;
	});
	return `-- Generated by pg-lightquery generateMigration. Review before applying.\n\n${body.join('\n\n')}\n`;
}

function renderNodePgMigrate(steps: MigrationStep[], language: 'ts' | 'js'): string {
	const indent = '\t';
	const prefix = `${indent}// `;
	const body = steps.map((step) => {
		// A raw \r inside a template literal is read back as \n, so it is written as an escape.
		const literal = step.sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\r/g, '\\r');
		const call = `pgm.sql(\`${literal}\`);`; // no re-indenting: the file runs exactly the reviewed SQL
		if (step.review) return `${commentOut(`REVIEW: ${step.note}`, prefix)}\n${commentOut(call, prefix)}`;
		return step.note ? `${commentOut(step.note, prefix)}\n${indent}${call}` : `${indent}${call}`;
	});
	const header = '// Generated by pg-lightquery generateMigration. Review before running.\n';
	const footer = `${indent}// No down migration is generated. Add one if you need rollbacks.`;
	if (language === 'ts') {
		return `${header}import type {MigrationBuilder} from 'node-pg-migrate';\n\nexport async function up(pgm: MigrationBuilder): Promise<void> {\n${body.join('\n\n')}\n\n${footer}\n}\n`;
	}
	return `${header}\n/** @param {import('node-pg-migrate').MigrationBuilder} pgm */\nexports.up = async (pgm) => {\n${body.join('\n\n')}\n\n${footer}\n};\n`;
}

export function renderMigration(steps: MigrationStep[], format: MigrationFormat = 'node-pg-migrate-ts'): string {
	if (format === 'sql') return renderSql(steps);
	return renderNodePgMigrate(steps, format === 'node-pg-migrate-js' ? 'js' : 'ts');
}

/**
 * Generates a draft migration that makes the database match the table definitions.
 * Reads the system catalog only. The draft is meant to be reviewed and committed, not run blindly.
 */
export async function generateMigration(
	tables: TableDefinition<any>[],
	options: GenerateMigrationOptions = {}
): Promise<GeneratedMigration> {
	const defaultSchema = options.defaultSchema ?? 'public';
	const targets = resolveTables(tables, defaultSchema);
	const catalog = await readCatalog(targets, queryFnFrom(options));
	const issues = compareWithCatalog(targets, catalog, defaultSchema, options.ignoreExtraColumns ?? false);
	const steps = buildSteps(targets, catalog, issues, defaultSchema);
	return {
		hasChanges: issues.length > 0,
		needsReview: steps.some((step) => step.review),
		steps,
		issues,
		content: renderMigration(steps, options.format),
	};
}
