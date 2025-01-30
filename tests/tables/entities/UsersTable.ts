import {TableDefinition} from '@/types/table';
import {PGLightQuery, BoundMethods} from '@/queries/PGLightQuery';
import {classUtils} from '@/queries/shared/helpers';
import {UsersSchema, usersColumns, UsersData} from '@tests/tables/definitions/users';
import {QueryParams} from '@/types/column';
import {QueryObject} from '@/queries/shared/db/queryUtils';
import {SelectUserDetailsInterface} from '../views/selectUserDetails';
import predefinedUsersQueries from '../queries/predefined/users';

const usersTable: TableDefinition<UsersSchema> = {
	tableName: 'users',
	schema: {
		columns: usersColumns,
	},
};

class UsersTable extends PGLightQuery<UsersSchema> {
	private boundMethods: BoundMethods<UsersSchema> & PGLightQuery<UsersSchema>;
	private predefinedQueries = {
		selectUserDetails: predefinedUsersQueries.selectUserDetails,
	};

	constructor() {
		super(usersTable);
		this.boundMethods = this.bindMethods();
	}

	protected bindMethods(): BoundMethods<UsersSchema> & PGLightQuery<UsersSchema> {
		return classUtils.bindMethods(this);
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
		return this.boundMethods.insert(dataToBeInserted, allowedColumns, returnField, onConflict, idUser);
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
