import { PGLightQuery, BoundMethods } from '@/queries/PGLightQuery';
import { AddressesSchema, addressesColumns, AddressesData } from '@tests/tables/definitions/addresses';
import { QueryParams } from '@/types/column';
import { QueryObject } from '@/queries/shared/db/queryUtils';
declare class AddressesTable extends PGLightQuery<AddressesSchema> {
    private boundMethods;
    constructor();
    protected bindMethods(): BoundMethods<AddressesSchema> & PGLightQuery<AddressesSchema>;
    insertAddress(dataToBeInserted: Partial<AddressesData>, allowedColumns: (keyof AddressesSchema)[] | '*', returnField: keyof AddressesSchema, onConflict: boolean, idUser?: string): {
        queryObject: QueryObject;
        execute: () => Promise<Partial<AddressesData>[]>;
    };
    selectAddresses(params: QueryParams<AddressesSchema>, allowedColumns: (keyof AddressesSchema)[] | '*'): Promise<Partial<AddressesData>[]>;
    selectAddressByUserId(userId: number): Promise<Partial<AddressesData>[]>;
    selectAddressById(id: number): Promise<Partial<AddressesData>[]>;
}
export default AddressesTable;
export { AddressesSchema, addressesColumns };
//# sourceMappingURL=AddressesTable.d.ts.map