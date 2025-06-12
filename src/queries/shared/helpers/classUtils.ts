import {v4 as uuidv4} from 'uuid';

export function generatePrimaryKey(prefix: string): string {
	const primaryKeyString = prefix.concat(
		'_',
		uuidv4()
			.replace(/[^a-zA-Z0-9]+/g, '')
			.toUpperCase()
	);
	return primaryKeyString;
}

export default {
	generatePrimaryKey,
};
