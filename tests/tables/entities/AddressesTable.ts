import {TableDefinition} from '@/types/table';
import {PGLightQuery, BoundMethods} from '@/queries/PGLightQuery';
import {classUtils} from '@/queries/shared/helpers';
import {AddressesSchema, addressesColumns, AddressesData} from '@tests/tables/definitions/addresses';
import {QueryParams} from '@/types/column';
import {QueryObject} from '@/queries/shared/db/queryUtils';

const addressesTable: TableDefinition<AddressesSchema> = {
	tableName: 'addresses',
	schema: {
		columns: addressesColumns,
	},
};

class AddressesTable extends PGLightQuery<AddressesSchema> {
	private boundMethods: BoundMethods<AddressesSchema> & PGLightQuery<AddressesSchema>;

	constructor() {
		super(addressesTable);
		this.boundMethods = this.bindMethods();
	}

	protected bindMethods(): BoundMethods<AddressesSchema> & PGLightQuery<AddressesSchema> {
		return classUtils.bindMethods(this);
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
		return this.boundMethods.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser);
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

	public async selectAddressByUserId(userId: number): Promise<Partial<AddressesData>[]> {
		return this.select<AddressesData>({
			params: {userId},
			allowedColumns: '*',
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
