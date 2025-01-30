export type RequireExactlyOne<T> = {
	[K in keyof T]: Pick<T, K> & Partial<Record<Exclude<keyof T, K>, never>>;
}[keyof T];

export type UniqueArray<T> = T extends readonly [infer X, ...infer Rest]
	? InArray<Rest, X> extends true
		? ['Encountered value with duplicates:', X]
		: readonly [X, ...UniqueArray<Rest>]
	: T;

export type InArray<T, X> = T extends readonly [X, ...infer _Rest]
	? true
	: T extends readonly [X]
	? true
	: T extends readonly [infer _, ...infer Rest]
	? InArray<Rest, X>
	: false;
