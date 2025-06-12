export function checkArrayUniqueness<T>(arrayToBeChecked: T[]): void {
	// Runtime check for uniqueness
	const uniqueElements = new Set(arrayToBeChecked);
	if (uniqueElements.size !== arrayToBeChecked.length) {
		throw new Error('Array must contain unique items');
	}
}

export default {
	checkArrayUniqueness,
};
