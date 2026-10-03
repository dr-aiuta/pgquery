/**
 * Thrown when the library rejects its input before a query is built.
 *
 * Every validation failure throws it: an unknown key or operator in `where`, a bad `limit`,
 * `offset` or `orderBy`, a bad `returnField`, a missing `allowedColumns`. An application
 * can map it to HTTP 400 in one place.
 *
 * Errors from PostgreSQL are never wrapped in it. They pass through unchanged, with their `code`.
 */
export class QueryInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'QueryInputError';
	}
}
