import {PGLightQuery, BoundMethods} from '../../PGLightQuery';
import {v4 as uuidv4} from 'uuid';

export function bindMethods<T extends Record<string, any>, U extends PGLightQuery<T>>(
	instance: U
): BoundMethods<T> & U {
	// Get methods from the parent class PGLightQuery
	const parentMethods = Object.getOwnPropertyNames(PGLightQuery.prototype).filter(
		(name) => typeof (instance as any)[name] === 'function' && name !== 'constructor'
	);

	// Get methods from the current class (the class extending PGLightQuery)
	const currentMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance)).filter(
		(name) => typeof (instance as any)[name] === 'function' && name !== 'constructor'
	);

	const methodNames = [...parentMethods, ...currentMethods];

	const boundMethods = methodNames.reduce((methods, methodName) => {
		methods[methodName as keyof BoundMethods<T>] = (instance as any)[methodName].bind(instance);
		return methods;
	}, {} as BoundMethods<T>);

	return Object.assign(boundMethods, {
		tableName: instance.tableName,
		schema: instance.schema,
	}) as BoundMethods<T> & U;
}

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
	bindMethods,
	generatePrimaryKey,
};
