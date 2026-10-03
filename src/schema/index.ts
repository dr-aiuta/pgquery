// Entry point of pg-lightquery/schema.
// The schema tools compare table definitions with a live database and draft migrations.
// They are served apart from the query layer, so a project that never calls them does not load them.

export {checkSchemaDrift} from './schema-drift';
export type {
	SchemaDriftReport,
	SchemaDriftIssue,
	SchemaDriftKind,
	SchemaDriftOptions,
	SchemaDriftQueryFn,
} from './schema-drift';

export {generateMigration} from './migration-generator';
export type {GeneratedMigration, GenerateMigrationOptions, MigrationFormat, MigrationStep} from './migration-generator';
