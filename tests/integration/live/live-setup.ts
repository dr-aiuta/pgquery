import {randomBytes} from 'crypto';
import {Client, PoolConfig} from 'pg';
import PostgresConnection, {ConnectionOptions} from '../../../src/connection/postgres-connection';
import {ColumnDefinition, TableDefinition} from '../../../src/types/core-types';

/**
 * Shared setup for the suites that reach a real PostgreSQL server.
 *
 * They run only when PGLIGHTQUERY_TEST_DATABASE_URL is set, for example
 * PGLIGHTQUERY_TEST_DATABASE_URL=postgres://localhost/postgres npm test
 *
 * Each suite creates its own schema with a random name, points the library's pool at it,
 * and drops it in afterAll. Nothing outside that schema is touched.
 */
export const liveDatabaseUrl = process.env.PGLIGHTQUERY_TEST_DATABASE_URL;

export const describeLive = liveDatabaseUrl ? describe : describe.skip;

export interface LiveSchema {
	/** The schema name. It is also the application_name of the library's pool. */
	name: string;
	/** A separate connection for setup, teardown and checks. Its search_path is the schema. */
	admin: Client;
}

// The tables of tests/tables/definitions, as DDL.
export const fixtureTablesDdl = [
	`CREATE TABLE users (
		id SERIAL PRIMARY KEY,
		name TEXT NOT NULL,
		email TEXT UNIQUE,
		"createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		"updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		"lastChangedBy" TEXT
	)`,
	`CREATE TABLE posts (
		id SERIAL PRIMARY KEY,
		"userId" INTEGER NOT NULL REFERENCES users (id),
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		"createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		"updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
	)`,
	`CREATE TABLE addresses (
		id SERIAL PRIMARY KEY,
		"userId" INTEGER NOT NULL REFERENCES users (id),
		street TEXT NOT NULL,
		neighborhood TEXT NOT NULL,
		city TEXT NOT NULL,
		"createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		"updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
	)`,
];

// A table with a two-column primary key.
export type PostTagsSchema = {[K in 'postId' | 'tag' | 'note']: ColumnDefinition};
export const postTagsTable: TableDefinition<PostTagsSchema> = {
	tableName: 'post_tags',
	schema: {
		columns: {
			postId: {type: 'INTEGER', primaryKey: true},
			tag: {type: 'TEXT', primaryKey: true},
			note: {type: 'TEXT'},
		},
	},
};
export const postTagsDdl = `CREATE TABLE post_tags (
	"postId" INTEGER NOT NULL,
	tag TEXT NOT NULL,
	note TEXT,
	PRIMARY KEY ("postId", tag)
)`;

// A table where every column has a default and there is no lastChangedBy column.
export type VisitsSchema = {[K in 'id' | 'createdAt']: ColumnDefinition};
export const visitsTable: TableDefinition<VisitsSchema> = {
	tableName: 'visits',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			createdAt: {type: 'TIMESTAMP WITHOUT TIME ZONE', notNull: true, default: 'NOW()'},
		},
	},
};
export const visitsDdl = `CREATE TABLE visits (
	id SERIAL PRIMARY KEY,
	"createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
)`;

// A table with a JSONB column, for filters on a JSON key.
export type UserSettingsSchema = {[K in 'id' | 'userId' | 'settings']: ColumnDefinition};
export const userSettingsTable: TableDefinition<UserSettingsSchema> = {
	tableName: 'user_settings',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			userId: {type: 'INTEGER', notNull: true},
			settings: {type: 'JSONB'},
		},
	},
};
export const userSettingsDdl = `CREATE TABLE user_settings (
	id SERIAL PRIMARY KEY,
	"userId" INTEGER NOT NULL,
	settings JSONB
)`;

// A table with an enum column, for filters on enum values.
export type TicketsSchema = {[K in 'id' | 'status' | 'title']: ColumnDefinition};
export const ticketsTable: TableDefinition<TicketsSchema> = {
	tableName: 'tickets',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			status: {type: 'ENUM', enum: ['open', 'closed', 'archived'], enumTypeName: 'ticket_status', notNull: true},
			title: {type: 'TEXT'},
		},
	},
};
export const ticketsDdl = [
	`CREATE TYPE ticket_status AS ENUM ('open', 'closed', 'archived')`,
	`CREATE TABLE tickets (
		id SERIAL PRIMARY KEY,
		status ticket_status NOT NULL,
		title TEXT
	)`,
];

/**
 * Creates a schema with a random name, runs the DDL inside it and initializes the
 * library's pool with that schema as its search_path.
 */
export async function createLiveSchema(ddl: string[], options?: ConnectionOptions): Promise<LiveSchema> {
	const name = `plq_live_${randomBytes(6).toString('hex')}`;
	const admin = new Client({connectionString: liveDatabaseUrl});
	await admin.connect();
	await admin.query(`CREATE SCHEMA "${name}"`);
	await admin.query(`SET search_path TO "${name}"`);
	for (const statement of ddl) {
		await admin.query(statement);
	}

	PostgresConnection.initialize(livePoolConfig(name), options);

	return {name, admin};
}

/** The pool configuration of a live suite: its schema is the search_path of every connection. */
export function livePoolConfig(schemaName: string): PoolConfig {
	return {
		connectionString: liveDatabaseUrl,
		options: `-c search_path=${schemaName}`,
		application_name: schemaName,
		max: 5,
	};
}

/** Closes the library's pool, drops the schema and closes the setup connection. */
export async function dropLiveSchema(schema: LiveSchema | undefined): Promise<void> {
	await PostgresConnection.end();
	if (!schema) {
		return;
	}
	try {
		await schema.admin.query(`DROP SCHEMA IF EXISTS "${schema.name}" CASCADE`);
	} finally {
		await schema.admin.end();
	}
}

/** Counts the pool's sessions that still hold an open transaction. */
export async function countIdleInTransaction(schema: LiveSchema): Promise<number> {
	const result = await schema.admin.query(
		`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1 AND state LIKE 'idle in transaction%'`,
		[schema.name]
	);
	return result.rows[0].count;
}
