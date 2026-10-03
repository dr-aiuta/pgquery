import {QueryInputError} from '../utils/query-input-error';

/**
 * The one place that decides which names may be written into SQL text.
 *
 * A name that passes holds letters, digits and underscores only, and does not start with a digit.
 * Such a name cannot break out of double quotes, and it cannot carry SQL when written without them.
 */
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isIdentifier(name: unknown): name is string {
	return typeof name === 'string' && IDENTIFIER.test(name);
}

function invalid(kind: string, name: unknown): QueryInputError {
	return new QueryInputError(
		`Invalid ${kind}: ${String(name)}. Expected letters, digits and underscores, not starting with a digit.`
	);
}

/**
 * Checks a name and returns it in double quotes.
 * Used for names that are not checked against a table definition, such as a field of an earlier chain step.
 */
export function ident(name: unknown, kind = 'identifier'): string {
	if (!isIdentifier(name)) {
		throw invalid(kind, name);
	}
	return `"${name}"`;
}

/**
 * Checks a name and returns it as it is, without quotes.
 * Used for the name of a chain step, which has always been written unquoted.
 */
export function plainName(name: unknown, kind = 'name'): string {
	if (!isIdentifier(name)) {
		throw invalid(kind, name);
	}
	return name;
}

/**
 * Checks a table name and returns it as it is, without quotes.
 * Quoting would stop PostgreSQL from folding case, which would break a table defined with capitals.
 * A schema-qualified name is split on the dot, and each part is checked.
 */
export function tableName(name: unknown): string {
	if (typeof name !== 'string' || name === '' || !name.split('.').every(isIdentifier)) {
		throw invalid('table name', name);
	}
	return name;
}
