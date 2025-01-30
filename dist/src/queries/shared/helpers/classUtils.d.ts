import { PGLightQuery, BoundMethods } from '../../PGLightQuery';
export declare function bindMethods<T extends Record<string, any>, U extends PGLightQuery<T>>(instance: U): BoundMethods<T> & U;
export declare function generatePrimaryKey(prefix: string): string;
declare const _default: {
    bindMethods: typeof bindMethods;
    generatePrimaryKey: typeof generatePrimaryKey;
};
export default _default;
//# sourceMappingURL=classUtils.d.ts.map