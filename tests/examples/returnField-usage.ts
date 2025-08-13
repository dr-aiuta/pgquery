/**
 * Examples demonstrating the enhanced returnField functionality
 *
 * The returnField parameter now supports three options:
 * 1. A single field name (string)
 * 2. An array of field names
 * 3. The '*' wildcard to return all fields
 */

import {createChainedInsert} from '../../src/utils/chained-insert-builder';
import {DatabaseOperations} from '../../src/core/database-operations';

// Example 1: Using returnField with a single field
// This returns only the 'id' field after the insert
function insertUserReturnId(usersDb: DatabaseOperations<any>, userData: any) {
	return usersDb.insert({
		allowedColumns: '*',
		options: {
			data: userData,
			returnField: 'id', // Returns only the id field
		},
	});
}

// Example 2: Using returnField with an array of fields
// This returns multiple specific fields after the insert
function insertUserReturnSpecificFields(usersDb: DatabaseOperations<any>, userData: any) {
	return usersDb.insert({
		allowedColumns: '*',
		options: {
			data: userData,
			returnField: ['id', 'name', 'email'], // Returns only these three fields
		},
	});
}

// Example 3: Using returnField with '*' to return all fields
// This returns all fields from the inserted row
function insertUserReturnAll(usersDb: DatabaseOperations<any>, userData: any) {
	return usersDb.insert({
		allowedColumns: '*',
		options: {
			data: userData,
			returnField: '*', // Returns all fields
		},
	});
}

// Example 4: Update operations with different returnField options
function updateUserExamples(usersDb: DatabaseOperations<any>) {
	// Return only the updated timestamp
	const updateWithTimestamp = usersDb.update({
		allowedColumns: '*',
		options: {
			data: {name: 'Updated Name'},
			where: {id: 1},
			returnField: 'updatedAt',
		},
	});

	// Return multiple fields after update
	const updateWithMultipleFields = usersDb.update({
		allowedColumns: '*',
		options: {
			data: {name: 'Updated Name'},
			where: {id: 1},
			returnField: ['id', 'name', 'updatedAt'],
		},
	});

	// Return all fields after update
	const updateReturnAll = usersDb.update({
		allowedColumns: '*',
		options: {
			data: {name: 'Updated Name'},
			where: {id: 1},
			returnField: '*',
		},
	});

	return {updateWithTimestamp, updateWithMultipleFields, updateReturnAll};
}

// Example 5: Chained insert with different returnField options
function chainedInsertExample(usersDb: DatabaseOperations<any>, postsDb: DatabaseOperations<any>) {
	const userData = {name: 'John Doe', email: 'john@example.com'};
	const postData = {title: 'My First Post', content: 'Hello World'};

	return (
		createChainedInsert()
			// Insert user and return all fields
			.insert('new_user', usersDb, userData, {returnField: '*'})
			// Insert post with reference to user, return only id and title
			.insertWithReference(
				'user_post',
				postsDb,
				postData,
				{from: 'new_user', field: 'id', to: 'userId'},
				{returnField: ['id', 'title']}
			)
			// Update another record, return just the id
			.update('updated_record', postsDb, {views: 1}, {id: 10}, {returnField: 'id'})
			.selectFrom('new_user')
			.build()
	);
}

// Example 6: Conditional operations with array returnField
function conditionalChainedInsert(
	usersDb: DatabaseOperations<any>,
	addressesDb: DatabaseOperations<any>,
	hasAddress: boolean
) {
	const userData = {name: 'Jane Smith', email: 'jane@example.com'};
	const addressData = {street: '123 Main St', city: 'New York', zip: '10001'};

	return (
		createChainedInsert()
			// Insert user, return specific fields
			.insert('new_user', usersDb, userData, {
				returnField: ['id', 'name', 'email', 'createdAt'],
			})
			// Conditionally insert address if hasAddress is true
			.insertWithReferenceIf(
				hasAddress,
				'user_address',
				addressesDb,
				addressData,
				{from: 'new_user', field: 'id', to: 'userId'},
				{returnField: '*'} // Return all address fields
			)
			.selectFrom('new_user')
			.build()
	);
}

// Example 7: Empty array handling (no RETURNING clause)
function insertWithoutReturning(usersDb: DatabaseOperations<any>, userData: any) {
	return usersDb.insert({
		allowedColumns: '*',
		options: {
			data: userData,
			returnField: [], // Empty array - no RETURNING clause will be generated
		},
	});
}

// Example 8: Real-world use case - User registration with profile
async function registerUserWithProfile(
	usersDb: DatabaseOperations<any>,
	profilesDb: DatabaseOperations<any>,
	userData: any,
	profileData: any
) {
	const result = await createChainedInsert()
		// Create user account, return only essential fields for security
		.insert('new_user', usersDb, userData, {
			returnField: ['id', 'username', 'email'], // Don't return sensitive fields like password hash
		})
		// Create user profile with reference to user
		.insertWithReference(
			'user_profile',
			profilesDb,
			profileData,
			{from: 'new_user', field: 'id', to: 'userId'},
			{returnField: '*'} // Return all profile fields for the welcome page
		)
		.selectFrom('user_profile')
		.build()
		.execute();

	return result;
}

export {
	insertUserReturnId,
	insertUserReturnSpecificFields,
	insertUserReturnAll,
	updateUserExamples,
	chainedInsertExample,
	conditionalChainedInsert,
	insertWithoutReturning,
	registerUserWithProfile,
};
