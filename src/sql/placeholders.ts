/**
 * The one place that reads and renumbers $n placeholders.
 */

/**
 * Calls back with every placeholder number found outside quoted text and comments.
 * A `$1` inside a string literal, a quoted identifier, a dollar-quoted string or a comment is not a placeholder.
 */
function scanPlaceholders(sql: string, onPlaceholder: (number: number, start: number, end: number) => void): void {
	let i = 0;
	while (i < sql.length) {
		const char = sql[i];
		const next = sql[i + 1];

		if (char === "'" || char === '"') {
			// A quote is escaped by doubling it.
			i++;
			while (i < sql.length) {
				if (sql[i] === char) {
					if (sql[i + 1] === char) {
						i += 2;
						continue;
					}
					break;
				}
				i++;
			}
			i++;
		} else if (char === '-' && next === '-') {
			const lineEnd = sql.indexOf('\n', i);
			i = lineEnd === -1 ? sql.length : lineEnd + 1;
		} else if (char === '/' && next === '*') {
			const commentEnd = sql.indexOf('*/', i + 2);
			i = commentEnd === -1 ? sql.length : commentEnd + 2;
		} else if (char === '$' && i > 0 && /[A-Za-z0-9_$]/.test(sql[i - 1])) {
			// A dollar sign inside an identifier, as in price$1, starts nothing.
			i++;
		} else if (char === '$') {
			const digits = /^\d+/.exec(sql.slice(i + 1));
			if (digits) {
				const end = i + 1 + digits[0].length;
				onPlaceholder(parseInt(digits[0], 10), i, end);
				i = end;
				continue;
			}
			// $tag$ ... $tag$ and $$ ... $$
			const tag = /^[A-Za-z_][A-Za-z0-9_]*\$|^\$/.exec(sql.slice(i + 1));
			if (tag) {
				const delimiter = `$${tag[0]}`;
				const bodyStart = i + delimiter.length;
				const close = sql.indexOf(delimiter, bodyStart);
				i = close === -1 ? sql.length : close + delimiter.length;
			} else {
				i++;
			}
		} else {
			i++;
		}
	}
}

/** The highest placeholder number in the SQL text, or 0 when it has none. */
export function maxPlaceholder(sql: string): number {
	let max = 0;
	scanPlaceholders(sql, (number) => {
		if (number > max) {
			max = number;
		}
	});
	return max;
}

/** Adds the offset to every placeholder number in the SQL text. */
export function renumber(sql: string, offset: number): string {
	if (offset === 0) {
		return sql;
	}
	let result = '';
	let last = 0;
	scanPlaceholders(sql, (number, start, end) => {
		result += `${sql.slice(last, start)}$${number + offset}`;
		last = end;
	});
	return result + sql.slice(last);
}
