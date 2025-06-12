import {TableDefinition} from '@/types';
import {TableBase} from '@/core/table-base';
import {AddressesSchema, addressesColumns, AddressesData} from '@tests/tables/definitions/addresses';
import {QueryParams} from '@/types';
import {QueryObject} from '@/utils/query-utils';

const addressesTable: TableDefinition<AddressesSchema> = {
	tableName: 'addresses',
	schema: {
		columns: addressesColumns,
	},
};

class AddressesTable extends TableBase<AddressesSchema> {
	constructor() {
		super(addressesTable);
	}

	public insertAddress(
		dataToBeInserted: Partial<AddressesData>,
		allowedColumns: (keyof AddressesSchema)[] | '*',
		returnField: keyof AddressesSchema,
		onConflict: boolean,
		idUser?: string
	): {
		queryObject: QueryObject;
		execute: () => Promise<Partial<AddressesData>[]>;
	} {
		return this.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser || 'SERVER');
	}

	public async selectAddresses(
		params: QueryParams<AddressesSchema>,
		allowedColumns: (keyof AddressesSchema)[] | '*'
	): Promise<Partial<AddressesData>[]> {
		return this.select<AddressesData>({
			params,
			allowedColumns,
		}).execute();
	}

	public async selectAddressById(id: number): Promise<Partial<AddressesData>[]> {
		return this.select<AddressesData>({
			params: {id},
			allowedColumns: '*',
		}).execute();
	}
}

export default AddressesTable;
export {AddressesSchema, addressesColumns};
