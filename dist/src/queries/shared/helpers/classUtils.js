import { PGLightQuery } from '../../PGLightQuery';
import { v4 as uuidv4 } from 'uuid';
export function bindMethods(instance) {
    // Get methods from the parent class PGLightQuery
    const parentMethods = Object.getOwnPropertyNames(PGLightQuery.prototype).filter((name) => typeof instance[name] === 'function' && name !== 'constructor');
    // Get methods from the current class (the class extending PGLightQuery)
    const currentMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance)).filter((name) => typeof instance[name] === 'function' && name !== 'constructor');
    const methodNames = [...parentMethods, ...currentMethods];
    const boundMethods = methodNames.reduce((methods, methodName) => {
        methods[methodName] = instance[methodName].bind(instance);
        return methods;
    }, {});
    return Object.assign(boundMethods, {
        tableName: instance.tableName,
        schema: instance.schema,
    });
}
export function generatePrimaryKey(prefix) {
    const primaryKeyString = prefix.concat('_', uuidv4()
        .replace(/[^a-zA-Z0-9]+/g, '')
        .toUpperCase());
    return primaryKeyString;
}
export default {
    bindMethods,
    generatePrimaryKey,
};
