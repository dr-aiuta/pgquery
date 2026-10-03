import {ChargesTable, TransactionsTable, insertPlace, createLead, ChargeChainInput} from './consumer-chains.fixtures';

/**
 * Pins the SQL of four chains shaped like the ones applications run today.
 * A change to the chained builder must leave these strings alone, or change them on purpose.
 */

const chargeInput: ChargeChainInput = {
	chargeData: {idCharge: 'chr_1', amount: 1500, status: 'PENDING'},
	financialEntity: {finExternalId: 'ext-1'},
	chargeType: 'PIX',
	idDealList: [10, 11],
	idOtherExpenseList: ['oth_1'],
	chargesRef: [
		{idBillableItem: 'deal_10', amount: 1000},
		{idBillableItem: 'deal_11', amount: 500},
	],
	transaction: {entityId: 'chr_1', entityType: 'CHARGE', amount: 1500, status: 'PENDING'},
	transactionRef: [{idBillableItem: 'deal_10', amountRef: 1000}],
	idUser: 'user-1',
};

const transactionInput = {
	transaction: {entityId: 'chr_1', entityType: 'CHARGE', amount: 1500, status: 'PAID'},
	transactionRef: {idBillableItem: 'deal_10', amountRef: 1500},
	idFee: 'fee_1',
};

const placeInput = {placeData: {name: 'Home', street: 'Main St'}, idContact: 7, options: {returnField: '*' as const}};

describe('consumer chains', () => {
	describe('chain A: a main insert between name-based inserts and updates', () => {
		it('builds the full chain', () => {
			const {queries} = new ChargesTable().insertChargeWithChainedInsert(chargeInput);

			expect(queries).toHaveLength(1);
			expect(queries[0].sqlText).toBe(
				[
					'WITH financial_entity_cte AS (',
					'  INSERT INTO financial_entities ("idFinInternal", "entityType", "finExternalId")',
					'VALUES ($1, $2, $3)',
					'RETURNING *',
					'),',
					'charge_cte AS (',
					'  INSERT INTO charges ("idCharge", "amount", "status", "fineValue")',
					'VALUES ($4, $5, $6, $7)',
					'RETURNING *',
					'),',
					'charge_type_cte AS (',
					'  INSERT INTO charge_types ("type", "idCharge") VALUES ($8, (SELECT "idCharge" FROM charge_cte)) RETURNING *',
					'),',
					'charge_ref_deal_0_cte AS (',
					'  INSERT INTO charges_ref ("idBillableItem", "amount", "idCharge") VALUES ($9, $10, (SELECT "idCharge" FROM charge_cte)) RETURNING *',
					'),',
					'charge_ref_deal_1_cte AS (',
					'  INSERT INTO charges_ref ("idBillableItem", "amount", "idCharge") VALUES ($11, $12, (SELECT "idCharge" FROM charge_cte)) RETURNING *',
					'),',
					'transaction_cte AS (',
					'  INSERT INTO transactions ("entityId", "entityType", "amount", "status")',
					'VALUES ($13, $14, $15, $16)',
					'RETURNING *',
					'),',
					'transaction_ref_0_cte AS (',
					'  INSERT INTO transactions_ref ("idBillableItem", "amountRef", "idTransaction") VALUES ($17, $18, (SELECT "idTransaction" FROM transaction_cte)) RETURNING *',
					'),',
					'deal_cte AS (',
					'  UPDATE deals',
					'SET "status" = $19',
					'WHERE "idDeal" = ANY($20)',
					'RETURNING *',
					'),',
					'other_expense_cte AS (',
					'  UPDATE other_expenses',
					'SET "status" = $21',
					'WHERE "idExpense" = ANY($22)',
					'RETURNING *',
					')',
					'SELECT * FROM charge_cte;',
				].join('\n')
			);
			expect(queries[0].values).toEqual([
				'chr_1',
				'CHARGE',
				'ext-1',
				'chr_1',
				1500,
				'PENDING',
				0,
				'PIX',
				'deal_10',
				1000,
				'deal_11',
				500,
				'chr_1',
				'CHARGE',
				1500,
				'PENDING',
				'deal_10',
				1000,
				'PENDING',
				[10, 11],
				'PENDING',
				['oth_1'],
			]);
		});

		it('builds the smallest chain', () => {
			const {queries} = new ChargesTable().insertChargeWithChainedInsert({
				chargeData: {idCharge: 'chr_2', amount: 10},
				chargesRef: [{idBillableItem: 'deal_1', amount: 10}],
				transactionRef: [],
			});

			expect(queries[0].sqlText).toBe(
				[
					'WITH charge_cte AS (',
					'  INSERT INTO charges ("idCharge", "amount", "fineValue")',
					'VALUES ($1, $2, $3)',
					'RETURNING *',
					'),',
					'charge_ref_deal_0_cte AS (',
					'  INSERT INTO charges_ref ("idBillableItem", "amount", "idCharge") VALUES ($4, $5, (SELECT "idCharge" FROM charge_cte)) RETURNING *',
					')',
					'SELECT * FROM charge_cte;',
				].join('\n')
			);
			expect(queries[0].values).toEqual(['chr_2', 10, 0, 'deal_1', 10]);
		});
	});

	describe('chain B: several steps reference the first one', () => {
		it('builds the chain without a fee', () => {
			const {queries} = new TransactionsTable().insertTransactionWithTransactionRef(transactionInput);

			expect(queries[0].sqlText).toBe(
				[
					'WITH transaction_cte AS (',
					'  INSERT INTO transactions ("entityId", "entityType", "amount", "status")',
					'VALUES ($1, $2, $3, $4)',
					'RETURNING *',
					'),',
					'transaction_ref_cte AS (',
					'  INSERT INTO transactions_ref ("idBillableItem", "amountRef", "idTransaction") VALUES ($5, $6, (SELECT "idTransaction" FROM transaction_cte)) RETURNING *',
					')',
					'SELECT * FROM transaction_cte;',
				].join('\n')
			);
			expect(queries[0].values).toEqual(['chr_1', 'CHARGE', 1500, 'PAID', 'deal_10', 1500]);
		});

		it('builds the chain with a fee', () => {
			const {queries} = new TransactionsTable().insertTransactionWithTransactionRef({...transactionInput, feeAmount: 3.5});

			expect(queries[0].sqlText).toBe(
				[
					'WITH transaction_cte AS (',
					'  INSERT INTO transactions ("entityId", "entityType", "amount", "status")',
					'VALUES ($1, $2, $3, $4)',
					'RETURNING *',
					'),',
					'transaction_ref_cte AS (',
					'  INSERT INTO transactions_ref ("idBillableItem", "amountRef", "idTransaction") VALUES ($5, $6, (SELECT "idTransaction" FROM transaction_cte)) RETURNING *',
					'),',
					'fee_entity_1_cte AS (',
					'  INSERT INTO financial_entities ("idFinInternal", "entityType", "finExternalId")',
					'VALUES ($7, $8, $9)',
					'RETURNING *',
					'),',
					'fee_entity_2_cte AS (',
					'  INSERT INTO financial_entities ("entityType", "finExternalId", "idFinInternal") VALUES ($10, $11, (SELECT "idTransaction" FROM transaction_cte)) RETURNING *',
					'),',
					'fee_cte AS (',
					'  INSERT INTO fees ("idFee", "amount", "status")',
					'VALUES ($12, $13, $14)',
					'RETURNING *',
					'),',
					'fee_ref_cte AS (',
					'  INSERT INTO financial_fees_ref ("idFee", "amountRef", "idFinInternal") VALUES ($15, $16, (SELECT "idTransaction" FROM transaction_cte)) RETURNING *',
					'),',
					'fee_transaction_cte AS (',
					'  INSERT INTO transactions ("entityId", "entityType", "amount", "status")',
					'VALUES ($17, $18, $19, $20)',
					'RETURNING *',
					'),',
					'fee_transaction_ref_cte AS (',
					'  INSERT INTO transactions_ref ("idBillableItem", "amountRef", "idTransaction") VALUES ($21, $22, (SELECT "idTransaction" FROM fee_transaction_cte)) RETURNING *',
					')',
					'SELECT * FROM transaction_cte;',
				].join('\n')
			);
			expect(queries[0].values).toEqual([
				'chr_1',
				'CHARGE',
				1500,
				'PAID',
				'deal_10',
				1500,
				'fee_1',
				'FINANCIAL_FEE',
				null,
				'PAYMENT_TRANSACTION',
				'chr_1',
				'fee_1',
				3.5,
				'PAID',
				'fee_1',
				3.5,
				'fee_1',
				'FINANCIAL_FEE',
				3.5,
				'PAID',
				'fee_1',
				3.5,
			]);
		});
	});

	describe('chain C: table objects and a conditional step', () => {
		it('builds the chain without the conditional step', () => {
			const {queries} = insertPlace({...placeInput, isBillingPlace: false});

			expect(queries[0].sqlText).toBe(
				[
					'WITH inserted_place AS (',
					'  INSERT INTO places ("name", "street")',
					'VALUES ($1, $2)',
					'RETURNING *',
					'),',
					'inserted_place_contact AS (',
					'  INSERT INTO places_contacts ("idContact", "idPlace") VALUES ($3, (SELECT "idPlace" FROM inserted_place)) RETURNING *',
					')',
					'SELECT * FROM inserted_place;',
				].join('\n')
			);
			expect(queries[0].values).toEqual(['Home', 'Main St', 7]);
		});

		it('cannot build the conditional step, whose data is empty', () => {
			// The builder parses the generated INSERT back, and an insert with no column has nothing to parse.
			expect(() => insertPlace({...placeInput, isBillingPlace: true})).toThrow(
				'Unable to parse INSERT statement for reference injection'
			);
		});

		it('loses ON CONFLICT on the referenced step', () => {
			const {queries} = insertPlace({
				...placeInput,
				isBillingPlace: false,
				options: {returnField: 'idPlace', onConflict: true, idUser: 'user-1'},
			});

			expect(queries[0].sqlText).toBe(
				[
					'WITH inserted_place AS (',
					'  INSERT INTO places ("name", "street")',
					'VALUES ($1, $2) ON CONFLICT ("idPlace") DO UPDATE SET "name" = EXCLUDED."name", "street" = EXCLUDED."street"',
					'RETURNING "idPlace"',
					'),',
					'inserted_place_contact AS (',
					'  INSERT INTO places_contacts ("idContact", "idPlace") VALUES ($3, (SELECT "idPlace" FROM inserted_place)) RETURNING *',
					')',
					'SELECT * FROM inserted_place;',
				].join('\n')
			);
		});
	});

	describe('chain D: a first insert with empty data', () => {
		it('builds the chain', () => {
			const {queries} = createLead({idContact: 42}, 'user-9');

			expect(queries[0].sqlText).toBe(
				[
					'WITH inserted_capture AS (',
					'  INSERT INTO property_capture ("lastChangedBy")',
					'VALUES ($1)',
					'RETURNING "idCapture"',
					'),',
					'inserted_capture_contact AS (',
					'  INSERT INTO capture_contacts ("idOwner", "lastChangedBy", "idCapture") VALUES ($2, $3, (SELECT "idCapture" FROM inserted_capture)) RETURNING "idCapture"',
					')',
					'SELECT * FROM inserted_capture_contact;',
				].join('\n')
			);
			expect(queries[0].values).toEqual(['user-9', 42, 'user-9']);
		});
	});
});
