import { PGLightQuery } from '@/queries/PGLightQuery';
import { classUtils } from '@/queries/shared/helpers';
import { addressesColumns } from '@tests/tables/definitions/addresses';
const addressesTable = {
    tableName: 'addresses',
    schema: {
        columns: addressesColumns,
    },
};
class AddressesTable extends PGLightQuery {
    constructor() {
        super(addressesTable);
        this.boundMethods = this.bindMethods();
    }
    bindMethods() {
        return classUtils.bindMethods(this);
    }
    insertAddress(dataToBeInserted, allowedColumns, returnField, onConflict, idUser) {
        return this.boundMethods.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser);
    }
    async selectAddresses(params, allowedColumns) {
        return this.select({
            params,
            allowedColumns,
        }).execute();
    }
    async selectAddressByUserId(userId) {
        return this.select({
            params: { userId },
            allowedColumns: '*',
        }).execute();
    }
    async selectAddressById(id) {
        return this.select({
            params: { id },
            allowedColumns: '*',
        }).execute();
    }
}
export default AddressesTable;
export { addressesColumns };
