import {Mutable, SchemaToData} from '../../src/types';
import {usersColumns} from '../tables/definitions/users';

/**
 * Column types map to concrete TypeScript types.
 * The lines marked @ts-expect-error must fail to compile. ts-jest reports an unused marker as an error,
 * so this file fails if a column type becomes untyped again.
 */

// The users fixture, extended with one column of each type that 0.5.0 gave a TypeScript type.
const accountColumns = {
	...usersColumns,
	externalId: {type: 'UUID'},
	active: {type: 'BOOLEAN'},
	loginCount: {type: 'SMALLINT'},
	storageBytes: {type: 'BIGINT'},
	score: {type: 'REAL'},
	balance: {type: 'DOUBLE PRECISION'},
	settings: {type: 'JSONB'},
	rawProfile: {type: 'JSON'},
	lastSeenAt: {type: 'TIMESTAMP WITH TIME ZONE'},
	verifiedAt: {type: 'TIMESTAMPTZ'},
	opensAt: {type: 'TIME WITHOUT TIME ZONE'},
} as const;

type AccountData = Mutable<SchemaToData<typeof accountColumns>>;

describe('column types', () => {
	it('accepts a value of the mapped TypeScript type', () => {
		const data: Partial<AccountData> = {
			name: 'Ann',
			externalId: '7f1b0c0e-8f43-4a36-9a5e-0d7d6f0f1a11',
			active: true,
			loginCount: 3,
			storageBytes: '9007199254740993',
			score: 0.5,
			balance: 12.25,
			settings: {theme: 'dark'},
			rawProfile: ['anything'],
			lastSeenAt: new Date(0),
			verifiedAt: '2024-01-01T00:00:00Z',
			opensAt: '09:00:00',
		};

		// BIGINT is string | number: node-postgres returns it as a string.
		const asNumber: Partial<AccountData> = {storageBytes: 42};
		// JSON and JSONB are unknown. Reading one needs a cast.
		const theme = (data.settings as {theme: string}).theme;

		expect(Object.keys(data)).toHaveLength(12);
		expect(asNumber.storageBytes).toBe(42);
		expect(theme).toBe('dark');
	});

	it('rejects a value of another type at compile time', () => {
		// @ts-expect-error BOOLEAN is boolean
		const active: Partial<AccountData> = {active: 'yes'};
		// @ts-expect-error BOOLEAN does not take null
		const cleared: Partial<AccountData> = {active: null};
		// @ts-expect-error UUID is string
		const externalId: Partial<AccountData> = {externalId: 7};
		// @ts-expect-error SMALLINT is number
		const loginCount: Partial<AccountData> = {loginCount: '3'};
		// @ts-expect-error BIGINT is string | number
		const storageBytes: Partial<AccountData> = {storageBytes: true};
		// @ts-expect-error TIME WITHOUT TIME ZONE is string
		const opensAt: Partial<AccountData> = {opensAt: 900};
		// @ts-expect-error TIMESTAMPTZ is Date | string
		const verifiedAt: Partial<AccountData> = {verifiedAt: 0};

		expect([active, cleared, externalId, loginCount, storageBytes, opensAt, verifiedAt]).toHaveLength(7);
	});
});
