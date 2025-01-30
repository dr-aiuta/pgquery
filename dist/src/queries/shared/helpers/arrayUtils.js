export function checkArrayUniqueness(arrayToBeChecked) {
    // Runtime check for uniqueness
    const uniqueElements = new Set(arrayToBeChecked);
    if (uniqueElements.size !== arrayToBeChecked.length) {
        throw new Error('Array must contain unique items');
    }
}
export default {
    checkArrayUniqueness,
};
