import {Client} from 'pg';
import {checkSchemaDrift} from '../../../src/schema/schema-drift';
import {TableDefinition} from '../../../src/types';

/**
 * Runs the drift checker against a real PostgreSQL server.
 * Skipped unless PGLIGHTQUERY_TEST_DATABASE_URL is set, for example:
 *   PGLIGHTQUERY_TEST_DATABASE_URL=postgres://localhost/postgres npx jest schema-drift
 * Everything is created inside one transaction that is rolled back, so the database is left unchanged.
 */
const databaseUrl = process.env.PGLIGHTQUERY_TEST_DATABASE_URL;
const describeLive = databaseUrl ? describe : describe.skip;

const SETUP_SQL = `
CREATE SCHEMA drift_test;
CREATE TYPE drift_test.post_status AS ENUM ('draft', 'published');
CREATE TABLE drift_test.users (
	id SERIAL PRIMARY KEY,
	email VARCHAR(255) NOT NULL UNIQUE,
	name TEXT,
	active BOOLEAN NOT NULL DEFAULT true,
	balance NUMERIC(10, 2),
	"externalId" UUID,
	meta JSONB,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_name_include_balance ON drift_test.users (name) INCLUDE (balance);
CREATE TABLE drift_test.posts (
	id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	"userId" INTEGER NOT NULL REFERENCES drift_test.users (id) ON DELETE CASCADE,
	status drift_test.post_status NOT NULL DEFAULT 'draft',
	legacy TEXT
);
CREATE UNIQUE INDEX posts_legacy_partial ON drift_test.posts (legacy) WHERE legacy IS NOT NULL;
`;

const usersTable: TableDefinition<any> = {
	tableName: 'drift_test.users',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			email: {type: 'VARCHAR', length: 255, notNull: true, unique: true},
			name: {type: 'TEXT', unique: true},
			active: {type: 'BOOLEAN', notNull: true, default: true},
			balance: {type: 'NUMERIC', precision: 10, scale: 2},
			externalId: {type: 'UUID'},
			meta: {type: 'JSONB'},
			createdAt: {type: 'TIMESTAMP WITH TIME ZONE', notNull: true, default: 'NOW()'},
		},
	},
};

const postsTable: TableDefinition<any> = {
	tableName: 'drift_test.posts',
	schema: {
		columns: {
			id: {type: 'BIGINT', primaryKey: true, autoIncrement: true},
			userId: {
				type: 'INTEGER',
				notNull: true,
				references: {table: 'drift_test.users', column: 'id', onDelete: 'CASCADE'},
			},
			status: {type: 'ENUM', enum: ['draft', 'published'], notNull: true, default: 'draft'},
			legacy: {type: 'TEXT'},
		},
	},
};

describeLive('checkSchemaDrift against a live database', () => {
	let client: Client;
	const query = (text: string, values: any[]) => client.query(text, values);

	beforeAll(async () => {
		client = new Client({connectionString: databaseUrl});
		await client.connect();
		await client.query('BEGIN');
		await client.query(SETUP_SQL);
	});

	afterAll(async () => {
		if (client) {
			await client.query('ROLLBACK');
			await client.end();
		}
	});

	it('reports no drift when definitions match the database', async () => {
		const report = await checkSchemaDrift([usersTable, postsTable], {query});
		expect(report.issues).toEqual([]);
		expect(report.ok).toBe(true);
	});

	it('reports each kind of drift', async () => {
		const users = usersTable.schema.columns;
		const posts = postsTable.schema.columns;
		const {legacy, ...postsWithoutLegacy} = posts;

		const driftedUsers: TableDefinition<any> = {
			tableName: 'drift_test.users',
			schema: {
				columns: {
					...users,
					id: {type: 'INTEGER', primaryKey: true},
					email: {...users.email, length: 100},
					name: {...users.name, notNull: true},
					active: {type: 'BOOLEAN', notNull: true},
					balance: {...users.balance, unique: true},
					externalId: {type: 'UUID', primaryKey: true},
					nickname: {type: 'TEXT'},
				},
			},
		};
		const driftedPosts: TableDefinition<any> = {
			tableName: 'drift_test.posts',
			schema: {
				columns: {
					...postsWithoutLegacy,
					userId: {...posts.userId, references: {table: 'drift_test.users', column: 'id', onDelete: 'SET NULL'}},
					status: {...posts.status, enum: ['draft']},
				},
			},
		};
		const missingTable: TableDefinition<any> = {tableName: 'drift_test.nope', schema: {columns: {}}};

		const report = await checkSchemaDrift([driftedUsers, driftedPosts, missingTable], {query});
		const found = report.issues.map((issue) => `${issue.kind} ${issue.table}${issue.column ? `.${issue.column}` : ''}`);

		expect(report.ok).toBe(false);
		expect(found.sort()).toEqual(
			[
				'auto_increment_mismatch drift_test.users.id',
				'type_mismatch drift_test.users.email',
				'nullability_mismatch drift_test.users.name',
				'default_mismatch drift_test.users.active',
				'unique_mismatch drift_test.users.balance',
				'primary_key_mismatch drift_test.users.externalId',
				'nullability_mismatch drift_test.users.externalId',
				'missing_column drift_test.users.nickname',
				'reference_mismatch drift_test.posts.userId',
				'enum_mismatch drift_test.posts.status',
				'extra_column drift_test.posts.legacy',
				'missing_table drift_test.nope',
			].sort()
		);

		const typeIssue = report.issues.find((issue) => issue.kind === 'type_mismatch');
		expect(typeIssue).toMatchObject({expected: 'character varying(100)', actual: 'character varying(255)'});
		const referenceIssue = report.issues.find((issue) => issue.kind === 'reference_mismatch');
		expect(referenceIssue).toMatchObject({
			expected: 'drift_test.users(id) ON DELETE SET NULL',
			actual: 'drift_test.users(id) ON DELETE CASCADE',
		});
	});

	it('can ignore extra database columns', async () => {
		const {legacy, ...columns} = postsTable.schema.columns;
		const report = await checkSchemaDrift([{tableName: 'drift_test.posts', schema: {columns}}], {
			query,
			ignoreExtraColumns: true,
		});
		expect(report.ok).toBe(true);
	});
});
