import {TableDefinition} from '@/types';
import {TableBase} from '@/core/table-base';
import {UsersSchema, usersColumns, UsersData} from '@tests/tables/definitions/users';
import {QueryParams} from '@/types';
import {QueryObject} from '@/utils/query-utils';
import {SelectUserDetailsInterface} from '../views/selectUserDetails';
import predefinedUsersQueries from '../queries/predefined/users';

const usersTable: TableDefinition<UsersSchema> = {
	tableName: 'users',
	schema: {
		columns: usersColumns,
	},
};

class UsersTable extends TableBase<UsersSchema> {
	private predefinedQueries = {
		selectUserDetails: predefinedUsersQueries.selectUserDetails,
	};

	constructor() {
		super(usersTable);
	}

	public insertUser(
		dataToBeInserted: Partial<UsersData>,
		allowedColumns: (keyof UsersSchema)[] | '*',
		returnField: keyof UsersSchema,
		onConflict: boolean,
		idUser?: string
	): {
		queryObject: QueryObject;
		execute: () => Promise<Partial<UsersData>[]>;
	} {
		return this.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser || 'SERVER');
	}

	public async selectUsers(
		params: QueryParams<UsersSchema>,
		allowedColumns: (keyof UsersSchema)[] | '*'
	): Promise<Partial<UsersData>[]> {
		return this.select<UsersData>({
			params,
			allowedColumns,
		}).execute();
	}

	public async selectUserById(id: number): Promise<Partial<UsersData>[]> {
		return this.select<UsersData>({
			params: {id},
			allowedColumns: '*',
		}).execute();
	}

	public async selectUserDetails(
		params: Record<string, any>,
		allowedColumns: (keyof UsersSchema)[] | '*',
		whereClause?: string
	): Promise<Partial<SelectUserDetailsInterface>[]> {
		let sqlText = this.predefinedQueries.selectUserDetails;

		if (whereClause) {
			sqlText += ` AND ${whereClause}`;
		}

		return this.select<SelectUserDetailsInterface>({
			params,
			allowedColumns,
			predefinedSQL: {
				sqlText,
			},
		}).execute();
	}
}

export default UsersTable;
export {UsersSchema, usersColumns};
