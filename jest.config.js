module.exports = {
	// ...
	transform: {
		'^.+\\.tsx?$': 'ts-jest',
	},
	// Only this checkout's tests. Without it Jest also runs the copies under .claude/worktrees.
	roots: ['<rootDir>/tests'],
	testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	preset: 'ts-jest',
	testEnvironment: 'node',
	// ...
};
