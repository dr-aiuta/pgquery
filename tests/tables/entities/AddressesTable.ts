import {TableDefinition} from '../../../src/types';
import {TableBase} from '../../../src/core/table-base';
import {AddressesSchema, addressesColumns, AddressesData} from '../definitions/addresses';
import {QueryParams} from '../../../src/types';
import {QueryObject, QueryResult} from '../../../src/utils/query-utils';

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
		allowedColumns: (keyof AddressesSchema)[] | '*',
		options: {
			data: Partial<AddressesData>;
			returnField?: keyof AddressesSchema;
			onConflict?: boolean;
			idUser?: string;
		}
	): QueryResult<Partial<AddressesData>[]> {
		return this.insert({
			allowedColumns,
			options: {
				data: options.data,
				returnField: options.returnField,
				onConflict: options.onConflict || false,
				idUser: options.idUser || 'SERVER',
			},
		});
	}

	public selectAddresses(
		allowedColumns: (keyof AddressesSchema)[] | '*',
		options?: {
			where?: QueryParams<AddressesSchema>;
			alias?: string;
		}
	): QueryResult<Partial<AddressesData>[]> {
		return this.select<AddressesData>({
			allowedColumns,
			options: {
				where: options?.where,
				alias: options?.alias,
			},
		});
	}

	public selectAddressById(id: number): QueryResult<Partial<AddressesData>[]> {
		return this.select<AddressesData>({
			allowedColumns: '*',
			options: {
				where: {id},
			},
		});
	}
}

export default AddressesTable;
export {AddressesSchema, addressesColumns};
