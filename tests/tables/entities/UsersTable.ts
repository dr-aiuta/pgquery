import {TableDefinition} from '../../../src/types';
import {TableBase} from '../../../src/core/table-base';
import {UsersSchema, usersColumns, UsersData} from '../definitions/users';
import {QueryParams} from '../../../src/types';
import {QueryObject, QueryResult} from '../../../src/utils/query-utils';
import {SelectUserDetailsInterface, SelectUserDetailsSchema} from '../views/selectUserDetails';
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
		allowedColumns: (keyof UsersSchema)[] | '*',
		options: {
			data: Partial<UsersData>;
			returnField?: keyof UsersSchema;
			onConflict?: boolean;
			idUser?: string;
		}
	): QueryResult<Partial<UsersData>[]> {
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

	public selectUsers(
		allowedColumns: (keyof UsersSchema)[] | '*',
		options?: {
			where?: QueryParams<UsersSchema>;
			alias?: string;
		}
	): QueryResult<Partial<UsersData>[]> {
		return this.select<UsersData>({
			allowedColumns,
			options: {
				where: options?.where,
				alias: options?.alias,
			},
		});
	}

	public selectUserById(id: number): QueryResult<Partial<UsersData>[]> {
		return this.select<UsersData>({
			allowedColumns: '*',
			options: {
				where: {id},
			},
		});
	}

	public selectUserDetails(
		allowedColumns: (keyof SelectUserDetailsSchema)[] | '*',
		options: {
			where?: QueryParams<SelectUserDetailsSchema>;
			whereClause?: string;
		}
	): QueryResult<Partial<SelectUserDetailsInterface>[]> {
		let sqlText = this.predefinedQueries.selectUserDetails;

		if (options.whereClause) {
			sqlText += ` AND ${options.whereClause}`;
		}

		return this.selectWithCustomSchema<SelectUserDetailsInterface, SelectUserDetailsSchema>({
			allowedColumns,
			predefinedSQL: {
				sqlText,
			},
			options: {
				where: options.where,
			},
		});
	}

	// Public transaction method to expose protected functionality
	public transaction() {
		return super.transaction();
	}
}

export default UsersTable;
export {UsersSchema, usersColumns};
