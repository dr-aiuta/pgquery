import {DatabaseOperations} from '../../../src/database-operations';
import {EnhancedTableBase} from '../../../src/table-base';
import {createChainedInsert} from '../../../src/chained-insert';
import {ColumnDefinition, TableDefinition} from '../../../src/types';

/**
 * Four chains, shaped like the ones that applications built on this library run today.
 * Their SQL is pinned in consumer-chains.test.ts, so a change to the builder shows up as a diff.
 *
 * Chain A and B use the name-based methods of a table class with registered tables.
 * Chain C and D use createChainedInsert() with table objects.
 */

type Columns<N extends string> = Record<N, ColumnDefinition>;
const define = <N extends string>(tableName: string, columns: Columns<N>): TableDefinition<Columns<N>> => ({
	tableName,
	schema: {columns},
});

// ---------- Chain A and B: charges and transactions ----------

const financialEntities = define('financial_entities', {
	idFinInternal: {type: 'TEXT', primaryKey: true},
	entityType: {type: 'TEXT', notNull: true},
	finExternalId: {type: 'TEXT'},
});
const charges = define('charges', {
	idCharge: {type: 'TEXT', primaryKey: true},
	amount: {type: 'NUMERIC', notNull: true},
	fineValue: {type: 'NUMERIC'},
	status: {type: 'TEXT'},
});
const chargeTypes = define('charge_types', {
	idChargeType: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	idCharge: {type: 'TEXT', notNull: true},
	type: {type: 'TEXT', notNull: true},
});
const deals = define('deals', {
	idDeal: {type: 'INTEGER', primaryKey: true},
	status: {type: 'TEXT'},
});
const otherExpenses = define('other_expenses', {
	idExpense: {type: 'TEXT', primaryKey: true},
	status: {type: 'TEXT'},
	amount: {type: 'NUMERIC'},
});
const chargesRef = define('charges_ref', {
	idChargeRef: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	idCharge: {type: 'TEXT', notNull: true},
	idBillableItem: {type: 'TEXT', notNull: true},
	amount: {type: 'NUMERIC', notNull: true},
});
const transactions = define('transactions', {
	idTransaction: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	entityId: {type: 'TEXT'},
	entityType: {type: 'TEXT'},
	amount: {type: 'NUMERIC', notNull: true},
	status: {type: 'TEXT'},
});
const transactionsRef = define('transactions_ref', {
	idTransactionRef: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	idTransaction: {type: 'INTEGER', notNull: true},
	idBillableItem: {type: 'TEXT', notNull: true},
	amountRef: {type: 'NUMERIC', notNull: true},
});
const fees = define('fees', {
	idFee: {type: 'TEXT', primaryKey: true},
	amount: {type: 'NUMERIC', notNull: true},
	status: {type: 'TEXT'},
});
const financialFeesRef = define('financial_fees_ref', {
	idFeeRef: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	idFee: {type: 'TEXT', notNull: true},
	idFinInternal: {type: 'INTEGER', notNull: true},
	amountRef: {type: 'NUMERIC', notNull: true},
});

type ChargesSchema = (typeof charges)['schema']['columns'];
type TransactionsSchema = (typeof transactions)['schema']['columns'];

export interface ChargeChainInput {
	chargeData: {idCharge: string; amount: number; status?: string; fineValue?: number};
	financialEntity?: {entityType?: string; finExternalId: string};
	chargeType?: string;
	idDealList?: number[];
	idOtherExpenseList?: string[];
	chargesRef: {idBillableItem: string; amount: number}[];
	transaction?: {entityId: string; entityType: string; amount: number; status: string};
	transactionRef: {idBillableItem: string; amountRef: number}[];
	idUser?: string;
}

/** Chain A: a main insert between name-based inserts, updates in the middle, inserts after them. */
export class ChargesTable extends EnhancedTableBase<ChargesSchema> {
	constructor() {
		super(charges);
		this.registerRelatedTable('financialEntitiesTable', {tableDefinition: financialEntities});
		this.registerRelatedTable('chargeTypesTable', {tableDefinition: chargeTypes});
		this.registerRelatedTable('dealsTable', {tableDefinition: deals});
		this.registerRelatedTable('otherExpensesTable', {tableDefinition: otherExpenses});
		this.registerRelatedTable('chargesRefTable', {tableDefinition: chargesRef});
		this.registerRelatedTable('transactionsTable', {tableDefinition: transactions});
		this.registerRelatedTable('transactionsRefTable', {tableDefinition: transactionsRef});
	}

	public insertChargeWithChainedInsert(input: ChargeChainInput) {
		const chargeDataWithId = {...input.chargeData, fineValue: input.chargeData.fineValue || 0};
		const idCharge = input.chargeData.idCharge;

		let chain = this.createChainedInsert();

		if (input.financialEntity) {
			chain = chain.insertIntoTable(
				'financial_entity_cte',
				'financialEntitiesTable',
				{
					idFinInternal: idCharge,
					entityType: input.financialEntity.entityType || 'CHARGE',
					finExternalId: input.financialEntity.finExternalId,
				},
				{allowedColumns: '*', returnField: '*'}
			);
		}

		chain = chain.insert('charge_cte', this.db, chargeDataWithId, {
			allowedColumns: '*',
			returnField: '*',
			idUser: input.idUser || 'SERVER',
		});

		if (input.chargeType) {
			chain = chain.insertIntoTableWithReference(
				'charge_type_cte',
				'chargeTypesTable',
				{type: input.chargeType},
				{from: 'charge_cte', field: 'idCharge', to: 'idCharge'},
				{allowedColumns: '*', returnField: '*'}
			);
		}

		if (input.idDealList && input.idDealList.length > 0) {
			// The list is spread into the data on purpose. Its keys "0", "1" are not columns and are dropped.
			const dealData = {...input.idDealList, status: input.chargeData.status || 'PENDING'};
			chain = chain.updateTable('deal_cte', 'dealsTable', dealData as any, {'idDeal.in': input.idDealList} as any, {
				allowedColumns: '*',
				returnField: '*',
			});
		}

		if (input.idOtherExpenseList && input.idOtherExpenseList.length > 0) {
			const otherExpenseData = {...input.idOtherExpenseList, status: input.chargeData.status || 'PENDING'};
			chain = chain.updateTable(
				'other_expense_cte',
				'otherExpensesTable',
				otherExpenseData as any,
				{'idExpense.in': input.idOtherExpenseList} as any,
				{allowedColumns: '*', returnField: '*'}
			);
		}

		input.chargesRef.forEach((chargeRef, index) => {
			chain = chain.insertIntoTableWithReference(
				`charge_ref_deal_${index}_cte`,
				'chargesRefTable',
				{idBillableItem: chargeRef.idBillableItem, amount: chargeRef.amount},
				{from: 'charge_cte', field: 'idCharge', to: 'idCharge'},
				{allowedColumns: '*', returnField: '*'}
			);
		});

		if (input.transaction && input.transactionRef.length > 0) {
			chain = chain.insertIntoTable('transaction_cte', 'transactionsTable', input.transaction, {
				allowedColumns: '*',
				returnField: '*',
			});
			input.transactionRef.forEach((ref, index) => {
				chain = chain.insertIntoTableWithReference(
					`transaction_ref_${index}_cte`,
					'transactionsRefTable',
					ref,
					{from: 'transaction_cte', field: 'idTransaction', to: 'idTransaction'},
					{allowedColumns: '*', returnField: '*'}
				);
			});
		}

		return chain.selectFrom('charge_cte').build();
	}
}

export interface TransactionChainInput {
	transaction: {entityId: string; entityType: string; amount: number; status: string};
	transactionRef: {idBillableItem: string; amountRef: number};
	feeAmount?: number;
	idFee: string;
	idUser?: string;
}

/** Chain B: references to the first step from several later steps, a null value, and a second reference source. */
export class TransactionsTable extends EnhancedTableBase<TransactionsSchema> {
	constructor() {
		super(transactions);
		this.registerRelatedTable('transactionsTable', {tableDefinition: transactions});
		this.registerRelatedTable('transactionsRefTable', {tableDefinition: transactionsRef});
		this.registerRelatedTable('financialEntitiesTable', {tableDefinition: financialEntities});
		this.registerRelatedTable('feesTable', {tableDefinition: fees});
		this.registerRelatedTable('financialFeesRefTable', {tableDefinition: financialFeesRef});
	}

	public insertTransactionWithTransactionRef(input: TransactionChainInput) {
		let chain = this.createChainedInsert();

		chain = chain.insert('transaction_cte', this.db, input.transaction, {
			allowedColumns: '*',
			returnField: '*',
			idUser: input.idUser || 'SERVER',
		});

		chain = chain.insertIntoTableWithReference(
			'transaction_ref_cte',
			'transactionsRefTable',
			input.transactionRef,
			{from: 'transaction_cte', field: 'idTransaction', to: 'idTransaction'},
			{allowedColumns: '*', returnField: '*'}
		);

		if (input.feeAmount && input.feeAmount > 0) {
			chain = chain.insertIntoTable(
				'fee_entity_1_cte',
				'financialEntitiesTable',
				{idFinInternal: input.idFee, entityType: 'FINANCIAL_FEE', finExternalId: null},
				{allowedColumns: '*', returnField: '*'}
			);

			chain = chain.insertIntoTableWithReference(
				'fee_entity_2_cte',
				'financialEntitiesTable',
				{entityType: 'PAYMENT_TRANSACTION', finExternalId: input.transaction.entityId},
				{from: 'transaction_cte', field: 'idTransaction', to: 'idFinInternal'},
				{allowedColumns: '*', returnField: '*'}
			);

			chain = chain.insertIntoTable(
				'fee_cte',
				'feesTable',
				{idFee: input.idFee, amount: input.feeAmount, status: input.transaction.status},
				{allowedColumns: '*', returnField: '*'}
			);

			chain = chain.insertIntoTableWithReference(
				'fee_ref_cte',
				'financialFeesRefTable',
				{idFee: input.idFee, amountRef: input.feeAmount},
				{from: 'transaction_cte', field: 'idTransaction', to: 'idFinInternal'},
				{allowedColumns: '*', returnField: '*'}
			);

			chain = chain.insertIntoTable(
				'fee_transaction_cte',
				'transactionsTable',
				{
					entityId: input.idFee,
					entityType: 'FINANCIAL_FEE',
					amount: input.feeAmount,
					status: input.transaction.status,
				},
				{allowedColumns: '*', returnField: '*'}
			);

			chain = chain.insertIntoTableWithReference(
				'fee_transaction_ref_cte',
				'transactionsRefTable',
				{idBillableItem: input.idFee, amountRef: input.feeAmount},
				{from: 'fee_transaction_cte', field: 'idTransaction', to: 'idTransaction'},
				{allowedColumns: '*', returnField: '*'}
			);
		}

		return chain.selectFrom('transaction_cte', '*').build();
	}
}

// ---------- Chain C: places ----------

const places = define('places', {
	idPlace: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	name: {type: 'TEXT', notNull: true},
	street: {type: 'TEXT'},
});
const placesContacts = define('places_contacts', {
	idPlaceContact: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	idPlace: {type: 'INTEGER', notNull: true},
	idContact: {type: 'INTEGER', notNull: true},
});
const placesContactsBilling = define('places_contacts_billing', {
	idPlaceContact: {type: 'INTEGER', primaryKey: true},
});

export const placesDb = new DatabaseOperations(places);
export const placesContactsDb = new DatabaseOperations(placesContacts);
export const placesContactsBillingDb = new DatabaseOperations(placesContactsBilling);

/** Chain C: table objects, one option set on every step, and a conditional step with empty data. */
export function insertPlace(input: {
	placeData: {name: string; street?: string};
	idContact: number;
	isBillingPlace: boolean;
	options: {returnField: 'idPlace' | '*'; onConflict?: boolean; idUser?: string};
}) {
	return createChainedInsert()
		.insert('inserted_place', placesDb, input.placeData, {
			allowedColumns: '*',
			returnField: input.options.returnField,
			onConflict: input.options.onConflict,
			idUser: input.options.idUser,
		})
		.insertWithReference(
			'inserted_place_contact',
			placesContactsDb,
			{idContact: input.idContact},
			{from: 'inserted_place', field: 'idPlace', to: 'idPlace'},
			{allowedColumns: '*', returnField: '*', onConflict: input.options.onConflict, idUser: input.options.idUser}
		)
		.insertWithReferenceIf(
			input.isBillingPlace,
			'inserted_billing',
			placesContactsBillingDb,
			{},
			{from: 'inserted_place_contact', field: 'idPlaceContact', to: 'idPlaceContact'},
			{allowedColumns: '*', returnField: '*', onConflict: input.options.onConflict, idUser: input.options.idUser}
		)
		.selectFrom('inserted_place')
		.build();
}

// ---------- Chain D: captures ----------

const propertyCapture = define('property_capture', {
	idCapture: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	status: {type: 'TEXT'},
	lastChangedBy: {type: 'TEXT'},
});
const captureContacts = define('capture_contacts', {
	idCaptureContact: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
	idCapture: {type: 'INTEGER', notNull: true},
	idOwner: {type: 'INTEGER', notNull: true},
	lastChangedBy: {type: 'TEXT'},
});

export const propertyCaptureDb = new DatabaseOperations(propertyCapture);
export const captureContactsDb = new DatabaseOperations(captureContacts);

/** Chain D: a first insert with empty data, and a final select on the last step. The caller reads results[0].rows[0]. */
export function createLead(input: {idContact: number}, idUser: string) {
	return createChainedInsert()
		.insert('inserted_capture', propertyCaptureDb, {}, {allowedColumns: '*', returnField: 'idCapture', idUser})
		.insertWithReference(
			'inserted_capture_contact',
			captureContactsDb,
			{idOwner: input.idContact},
			{from: 'inserted_capture', field: 'idCapture', to: 'idCapture'},
			{allowedColumns: '*', returnField: 'idCapture', idUser}
		)
		.selectFrom('inserted_capture_contact')
		.build();
}
