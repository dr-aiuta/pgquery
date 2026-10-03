/**
 * ChainedInsertBuilder Test Suite Index
 *
 * This file imports and runs all ChainedInsertBuilder tests to verify
 * complete functionality and reusability across different scenarios.
 *
 * Test Coverage:
 * - Basic chained insert functionality
 * - Multi-table relationships with references
 * - Conditional insert logic
 * - Enhanced TableBase integration
 * - Real-world business scenarios (E-commerce, LMS)
 * - SQL generation and safety
 * - Error handling
 * - Performance with large datasets
 */

// Import all test suites
import './chained-insert-builder.test';
import './enhanced-table-base.test';
import './real-world-scenarios.test';
import './sql-generation.test';

// This file serves as an entry point for running all ChainedInsertBuilder tests
// Run with: npm test -- tests/integration/chained-insert-builder/index.test.ts

describe('ChainedInsertBuilder - Complete Test Suite', () => {
	it('should load all test suites successfully', () => {
		// This test ensures all imports are successful
		expect(true).toBe(true);
	});
});
