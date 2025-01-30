import {UsersData} from '../definitions/users';
import {PostsData} from '../definitions/posts';
import {AddressesData} from '../definitions/addresses';

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
