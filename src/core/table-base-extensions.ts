import {ColumnTypeMapping} from '../types/core-types';
import {TableBase} from './table-base';

/**
 * @deprecated Use TableBase. It has registerRelatedTable, getRelatedTable and createChainedInsert itself.
 * EnhancedTableBase is the same class under its old name, kept so existing table classes keep compiling.
 */
export const EnhancedTableBase = TableBase;

/**
 * @deprecated Use TableBase.
 */
export type EnhancedTableBase<T extends Record<string, {type: keyof ColumnTypeMapping}>> = TableBase<T>;

export {RelatedTablesRegistry, createRelatedTablesHelper} from './table-base';
export type {RelatedTableConfig} from './table-base';
