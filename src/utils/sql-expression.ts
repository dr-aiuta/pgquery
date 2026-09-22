/**
 * SQL expressions used as column defaults, e.g. `default: sqlExpression('now()')`.
 *
 * The marker is branded with a registered symbol, so a plain object such as a JSONB default
 * `{sql: 'SELECT 1'}` is never mistaken for an expression and is always rendered as a literal.
 */
const SQL_EXPRESSION = Symbol.for('pg-lightquery.sqlExpression');

export interface SqlExpression {
	readonly [SQL_EXPRESSION]: true;
	readonly sql: string;
}

export function sqlExpression(sql: string): SqlExpression {
	return {[SQL_EXPRESSION]: true, sql};
}

export function isSqlExpression(value: unknown): value is SqlExpression {
	return typeof value === 'object' && value !== null && (value as any)[SQL_EXPRESSION] === true;
}
