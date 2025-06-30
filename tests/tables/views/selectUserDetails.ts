import {UsersData} from '../definitions/users';
import {PostsData} from '../definitions/posts';
import {AddressesData} from '../definitions/addresses';
import {ColumnDefinition} from '../../../src/types';

type UserBasicData = Pick<UsersData, 'id' | 'name' | 'email'>;
type PostBasicData = Pick<PostsData, 'id' | 'title' | 'content' | 'createdAt'>;
type AddressBasicData = Pick<AddressesData, 'id' | 'street' | 'neighborhood' | 'city'>;

interface UserPostData extends PostBasicData {
	authorName: string;
}

interface UserAddressData extends AddressBasicData {
	userId: string;
}

export interface SelectUserDetailsInterface extends UserBasicData {
	posts?: UserPostData[] | null;
	addresses?: UserAddressData[] | null;
}

// Schema definition for the joined result - used for query parameters and column selection
export const selectUserDetailsColumns = {
	id: {
		type: 'INTEGER',
		primaryKey: true,
	},
	name: {
		type: 'TEXT',
		notNull: true,
	},
	email: {
		type: 'TEXT',
	},
	posts: {
		type: 'JSONB',
	},
	addresses: {
		type: 'JSONB',
	},
} as const;

export type SelectUserDetailsSchema = {
	[K in keyof typeof selectUserDetailsColumns]: ColumnDefinition;
};
