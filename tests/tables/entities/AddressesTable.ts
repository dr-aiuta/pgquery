import {TableDefinition} from '@/types/table';
import {TableBase} from '@/queries/TableBase';
import {AddressesSchema, addressesColumns, AddressesData} from '@tests/tables/definitions/addresses';
import {QueryParams} from '@/types/column';
import {QueryObject} from '@/queries/shared/db/queryUtils';

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
