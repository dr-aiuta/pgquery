import {setupTests, dbpg, createMockQueryResult} from '../pg-lightquery/test-setup';
import {createChainedInsert} from '../../../src/utils/chained-insert-builder';
import {EnhancedTableBase} from '../../../src/core/table-base-extensions';
import {DatabaseOperations} from '../../../src/core/database-operations';
import {TableDefinition, ColumnDefinition} from '../../../src/types/core-types';

/**
 * Real-world scenario tests demonstrating complete reusability
 * across different domains and business contexts
 */

// E-commerce scenario table definitions
type OrdersSchema = {
	id: ColumnDefinition;
	customerId: ColumnDefinition;
	totalAmount: ColumnDefinition;
	status: ColumnDefinition;
	createdAt: ColumnDefinition;
};

type OrderItemsSchema = {
	id: ColumnDefinition;
	orderId: ColumnDefinition;
	productId: ColumnDefinition;
	quantity: ColumnDefinition;
	price: ColumnDefinition;
};

type PaymentsSchema = {
	id: ColumnDefinition;
	orderId: ColumnDefinition;
	amount: ColumnDefinition;
	method: ColumnDefinition;
	status: ColumnDefinition;
};

type ShipmentsSchema = {
	id: ColumnDefinition;
	orderId: ColumnDefinition;
	trackingNumber: ColumnDefinition;
	carrier: ColumnDefinition;
	status: ColumnDefinition;
};

// Learning Management System scenario
type CoursesSchema = {
	id: ColumnDefinition;
	title: ColumnDefinition;
	instructorId: ColumnDefinition;
	description: ColumnDefinition;
	status: ColumnDefinition;
};

type EnrollmentsSchema = {
	id: ColumnDefinition;
	courseId: ColumnDefinition;
	studentId: ColumnDefinition;
	enrolledAt: ColumnDefinition;
	status: ColumnDefinition;
};

type AssignmentsSchema = {
	id: ColumnDefinition;
	courseId: ColumnDefinition;
	title: ColumnDefinition;
	dueDate: ColumnDefinition;
	maxPoints: ColumnDefinition;
};

// Define table definitions
const ordersTableDef: TableDefinition<OrdersSchema> = {
	tableName: 'orders',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			customerId: {type: 'INTEGER', notNull: true},
			totalAmount: {type: 'DECIMAL', notNull: true},
			status: {type: 'TEXT', notNull: true, default: 'pending'},
			createdAt: {type: 'TIMESTAMP WITHOUT TIME ZONE', notNull: true, default: 'NOW()'},
		},
	},
};

const orderItemsTableDef: TableDefinition<OrderItemsSchema> = {
	tableName: 'order_items',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			orderId: {type: 'INTEGER', notNull: true},
			productId: {type: 'INTEGER', notNull: true},
			quantity: {type: 'INTEGER', notNull: true},
			price: {type: 'DECIMAL', notNull: true},
		},
	},
};

const paymentsTableDef: TableDefinition<PaymentsSchema> = {
	tableName: 'payments',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			orderId: {type: 'INTEGER', notNull: true},
			amount: {type: 'DECIMAL', notNull: true},
			method: {type: 'TEXT', notNull: true},
			status: {type: 'TEXT', notNull: true, default: 'pending'},
		},
	},
};

const shipmentsTableDef: TableDefinition<ShipmentsSchema> = {
	tableName: 'shipments',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			orderId: {type: 'INTEGER', notNull: true},
			trackingNumber: {type: 'TEXT', notNull: true},
			carrier: {type: 'TEXT', notNull: true},
			status: {type: 'TEXT', notNull: true, default: 'preparing'},
		},
	},
};

const coursesTableDef: TableDefinition<CoursesSchema> = {
	tableName: 'courses',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			title: {type: 'TEXT', notNull: true},
			instructorId: {type: 'INTEGER', notNull: true},
			description: {type: 'TEXT'},
			status: {type: 'TEXT', notNull: true, default: 'draft'},
		},
	},
};

const enrollmentsTableDef: TableDefinition<EnrollmentsSchema> = {
	tableName: 'enrollments',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			courseId: {type: 'INTEGER', notNull: true},
			studentId: {type: 'INTEGER', notNull: true},
			enrolledAt: {type: 'TIMESTAMP WITHOUT TIME ZONE', notNull: true, default: 'NOW()'},
			status: {type: 'TEXT', notNull: true, default: 'active'},
		},
	},
};

const assignmentsTableDef: TableDefinition<AssignmentsSchema> = {
	tableName: 'assignments',
	schema: {
		columns: {
			id: {type: 'INTEGER', primaryKey: true, autoIncrement: true},
			courseId: {type: 'INTEGER', notNull: true},
			title: {type: 'TEXT', notNull: true},
			dueDate: {type: 'TIMESTAMP WITHOUT TIME ZONE'},
			maxPoints: {type: 'INTEGER', notNull: true, default: 100},
		},
	},
};

// E-commerce service class
class ECommerceOrderService extends EnhancedTableBase<OrdersSchema> {
	constructor() {
		super(ordersTableDef);
		this.registerRelatedTable('order_items', {tableDefinition: orderItemsTableDef});
		this.registerRelatedTable('payments', {tableDefinition: paymentsTableDef});
		this.registerRelatedTable('shipments', {tableDefinition: shipmentsTableDef});
	}

	/**
	 * Complete order processing with items, payment, and optional shipping
	 */
	public processCompleteOrder(
		customerId: number,
		items: Array<{productId: number; quantity: number; price: number}>,
		paymentData: {amount: number; method: string},
		requiresShipping = true,
		shippingData?: {trackingNumber: string; carrier: string}
	) {
		const orderData = {
			customerId,
			totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
			status: 'processing',
		};

		let builder = this.createChainedInsert()
			.insert('new_order', this.db, orderData, {returnField: '*'})
			.insertWithReference(
				'order_payment',
				this.getRelatedTable('payments'),
				{
					...paymentData,
					status: 'completed',
				},
				{
					from: 'new_order',
					field: 'id',
					to: 'orderId',
				}
			);

		// Add order items
		items.forEach((item, index) => {
			builder = builder.insertWithReference(`order_item_${index}`, this.getRelatedTable('order_items'), item, {
				from: 'new_order',
				field: 'id',
				to: 'orderId',
			});
		});

		// Conditionally add shipping
		if (requiresShipping && shippingData) {
			builder = builder.insertWithReference(
				'order_shipment',
				this.getRelatedTable('shipments'),
				{
					...shippingData,
					status: 'preparing',
				},
				{
					from: 'new_order',
					field: 'id',
					to: 'orderId',
				}
			);
		}

		return builder.selectFrom('new_order').build();
	}

	/**
	 * Quick order for digital products (no shipping required)
	 */
	public processDigitalOrder(
		customerId: number,
		items: Array<{productId: number; quantity: number; price: number}>,
		paymentData: {amount: number; method: string}
	) {
		return this.processCompleteOrder(customerId, items, paymentData, false);
	}
}

// Learning Management System service class
class LMSCourseService extends EnhancedTableBase<CoursesSchema> {
	constructor() {
		super(coursesTableDef);
		this.registerRelatedTable('enrollments', {tableDefinition: enrollmentsTableDef});
		this.registerRelatedTable('assignments', {tableDefinition: assignmentsTableDef});
	}

	/**
	 * Create a complete course with automatic instructor enrollment and initial assignments
	 */
	public createCourseWithSetup(
		courseData: {title: string; instructorId: number; description?: string},
		initialAssignments: Array<{title: string; dueDate?: Date; maxPoints?: number}> = [],
		autoEnrollInstructor = true
	) {
		let builder = this.createChainedInsert().insert(
			'new_course',
			this.db,
			{
				...courseData,
				status: 'active',
			},
			{returnField: '*'}
		);

		// Auto-enroll instructor
		if (autoEnrollInstructor) {
			builder = builder.insertWithReference(
				'instructor_enrollment',
				this.getRelatedTable('enrollments'),
				{
					studentId: courseData.instructorId,
					status: 'instructor',
				},
				{
					from: 'new_course',
					field: 'id',
					to: 'courseId',
				}
			);
		}

		// Add initial assignments
		initialAssignments.forEach((assignment, index) => {
			builder = builder.insertWithReference(
				`initial_assignment_${index}`,
				this.getRelatedTable('assignments'),
				assignment,
				{
					from: 'new_course',
					field: 'id',
					to: 'courseId',
				}
			);
		});

		return builder.selectFrom('new_course').build();
	}

	/**
	 * Enroll multiple students in a course
	 */
	public enrollStudentsInCourse(courseId: number, studentIds: number[]) {
		const coursesDb = new DatabaseOperations(coursesTableDef);

		let builder = createChainedInsert().insert('course_ref', coursesDb, {id: courseId}, {returnField: '*'});

		studentIds.forEach((studentId, index) => {
			builder = builder.insertWithReference(
				`enrollment_${index}`,
				this.getRelatedTable('enrollments'),
				{
					studentId,
					status: 'active',
				},
				{
					from: 'course_ref',
					field: 'id',
					to: 'courseId',
				}
			);
		});

		return builder.selectFrom('course_ref').build();
	}
}

describe('Real-World Scenarios - Complete Reusability Demonstration', () => {
	setupTests();

	let ecommerceService: ECommerceOrderService;
	let lmsService: LMSCourseService;

	beforeEach(() => {
		ecommerceService = new ECommerceOrderService();
		lmsService = new LMSCourseService();
	});

	describe('E-Commerce Order Processing', () => {
		it('should process complete order with multiple items, payment, and shipping', async () => {
			const customerId = 123;
			const items = [
				{productId: 1, quantity: 2, price: 29.99},
				{productId: 2, quantity: 1, price: 49.99},
				{productId: 3, quantity: 3, price: 15.99},
			];
			const paymentData = {amount: 157.95, method: 'credit_card'};
			const shippingData = {trackingNumber: 'TRK123456', carrier: 'UPS'};

			const expectedOrder = {
				id: 1,
				customerId,
				totalAmount: 157.95,
				status: 'processing',
				createdAt: new Date(),
			};

			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedOrder]));

			const orderProcess = ecommerceService.processCompleteOrder(customerId, items, paymentData, true, shippingData);

			const sql = orderProcess.queries[0].sqlText;

			// Should contain all expected CTEs
			expect(sql).toContain('WITH new_order AS');
			expect(sql).toContain(',\norder_payment AS');
			expect(sql).toContain(',\norder_item_0 AS');
			expect(sql).toContain(',\norder_item_1 AS');
			expect(sql).toContain(',\norder_item_2 AS');
			expect(sql).toContain(',\norder_shipment AS');

			// Should contain all table inserts
			expect(sql).toContain('INSERT INTO orders');
			expect(sql).toContain('INSERT INTO payments');
			expect(sql).toContain('INSERT INTO order_items');
			expect(sql).toContain('INSERT INTO shipments');

			// Should contain all item data
			expect(orderProcess.queries[0].values).toContain(29.99);
			expect(orderProcess.queries[0].values).toContain(49.99);
			expect(orderProcess.queries[0].values).toContain(15.99);
			expect(orderProcess.queries[0].values).toContain('credit_card');
			expect(orderProcess.queries[0].values).toContain('TRK123456');

			const result = await orderProcess.execute();
			expect(result[0].rows).toEqual([expectedOrder]);
		});

		it('should process digital order without shipping', async () => {
			const customerId = 456;
			const items = [{productId: 100, quantity: 1, price: 9.99}];
			const paymentData = {amount: 9.99, method: 'paypal'};

			const expectedOrder = {
				id: 2,
				customerId,
				totalAmount: 9.99,
				status: 'processing',
				createdAt: new Date(),
			};

			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedOrder]));

			const digitalOrder = ecommerceService.processDigitalOrder(customerId, items, paymentData);
			const sql = digitalOrder.queries[0].sqlText;

			// Should contain order, payment, and item CTEs
			expect(sql).toContain('WITH new_order AS');
			expect(sql).toContain(',\norder_payment AS');
			expect(sql).toContain(',\norder_item_0 AS');

			// Should NOT contain shipping CTE
			expect(sql).not.toContain('order_shipment AS');
			expect(sql).not.toContain('INSERT INTO shipments');

			const result = await digitalOrder.execute();
			expect(result[0].rows).toEqual([expectedOrder]);
		});

		it('should handle large orders with many items efficiently', async () => {
			const customerId = 789;
			const manyItems = Array.from({length: 20}, (_, i) => ({
				productId: i + 1,
				quantity: Math.floor(Math.random() * 5) + 1,
				price: Math.round((Math.random() * 100 + 10) * 100) / 100,
			}));
			const totalAmount = manyItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
			const paymentData = {amount: totalAmount, method: 'credit_card'};

			const expectedOrder = {id: 3, customerId, totalAmount, status: 'processing'};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedOrder]));

			const largeOrder = ecommerceService.processCompleteOrder(customerId, manyItems, paymentData, false);
			const sql = largeOrder.queries[0].sqlText;

			// Should have all 20 order items
			for (let i = 0; i < 20; i++) {
				expect(sql).toContain(`order_item_${i} AS`);
			}

			// Should be a single transaction query
			expect(largeOrder.queries).toHaveLength(1);

			const result = await largeOrder.execute();
			expect(result[0].rows).toEqual([expectedOrder]);
		});
	});

	describe('Learning Management System Course Management', () => {
		it('should create course with instructor enrollment and initial assignments', async () => {
			const courseData = {
				title: 'Advanced JavaScript Concepts',
				instructorId: 42,
				description: 'Deep dive into advanced JS topics',
			};

			const initialAssignments = [
				{title: 'Introduction Assignment', maxPoints: 50},
				{title: 'Midterm Project', maxPoints: 150},
				{title: 'Final Exam', maxPoints: 200},
			];

			const expectedCourse = {
				id: 1,
				...courseData,
				status: 'active',
			};

			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedCourse]));

			const courseSetup = lmsService.createCourseWithSetup(courseData, initialAssignments, true);
			const sql = courseSetup.queries[0].sqlText;

			// Should contain course, instructor enrollment, and assignment CTEs
			expect(sql).toContain('WITH new_course AS');
			expect(sql).toContain(',\ninstructor_enrollment AS');
			expect(sql).toContain(',\ninitial_assignment_0 AS');
			expect(sql).toContain(',\ninitial_assignment_1 AS');
			expect(sql).toContain(',\ninitial_assignment_2 AS');

			// Should contain all table inserts
			expect(sql).toContain('INSERT INTO courses');
			expect(sql).toContain('INSERT INTO enrollments');
			expect(sql).toContain('INSERT INTO assignments');

			// Should contain assignment titles
			expect(courseSetup.queries[0].values).toContain('Introduction Assignment');
			expect(courseSetup.queries[0].values).toContain('Midterm Project');
			expect(courseSetup.queries[0].values).toContain('Final Exam');

			const result = await courseSetup.execute();
			expect(result[0].rows).toEqual([expectedCourse]);
		});

		it('should create minimal course without instructor enrollment', async () => {
			const courseData = {
				title: 'Basic Python',
				instructorId: 24,
			};

			const expectedCourse = {
				id: 2,
				...courseData,
				status: 'active',
			};

			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedCourse]));

			const minimalCourse = lmsService.createCourseWithSetup(courseData, [], false);
			const sql = minimalCourse.queries[0].sqlText;

			// Should only contain course CTE
			expect(sql).toContain('WITH new_course AS');
			expect(sql).not.toContain('instructor_enrollment AS');
			expect(sql).not.toContain('initial_assignment');

			// Should only contain course insert
			expect(sql).toContain('INSERT INTO courses');
			expect(sql).not.toContain('INSERT INTO enrollments');
			expect(sql).not.toContain('INSERT INTO assignments');

			const result = await minimalCourse.execute();
			expect(result[0].rows).toEqual([expectedCourse]);
		});

		it('should enroll multiple students in existing course', async () => {
			const courseId = 5;
			const studentIds = [101, 102, 103, 104, 105];

			const expectedCourse = {id: courseId, title: 'Existing Course'};
			(dbpg.query as jest.Mock).mockResolvedValue(createMockQueryResult([expectedCourse]));

			const batchEnrollment = lmsService.enrollStudentsInCourse(courseId, studentIds);
			const sql = batchEnrollment.queries[0].sqlText;

			// Should contain course reference and all enrollment CTEs
			expect(sql).toContain('WITH course_ref AS');
			expect(sql).toContain(',\nenrollment_0 AS');
			expect(sql).toContain(',\nenrollment_1 AS');
			expect(sql).toContain(',\nenrollment_2 AS');
			expect(sql).toContain(',\nenrollment_3 AS');
			expect(sql).toContain(',\nenrollment_4 AS');

			// Should contain all student IDs in values
			studentIds.forEach((studentId) => {
				expect(batchEnrollment.queries[0].values).toContain(studentId);
			});

			const result = await batchEnrollment.execute();
			expect(result[0].rows).toEqual([expectedCourse]);
		});
	});

	describe('Cross-Domain Pattern Verification', () => {
		it('should demonstrate identical patterns work across different domains', () => {
			// Both services use the same underlying patterns but for different business logic

			// E-commerce: Order -> Items + Payment + Shipping
			const ecommercePattern = ecommerceService.processCompleteOrder(
				1,
				[{productId: 1, quantity: 1, price: 10}],
				{amount: 10, method: 'card'},
				true,
				{trackingNumber: 'TRK1', carrier: 'FedEx'}
			);

			// LMS: Course -> Enrollment + Assignments
			const lmsPattern = lmsService.createCourseWithSetup(
				{title: 'Test Course', instructorId: 1},
				[{title: 'Assignment 1', maxPoints: 100}],
				true
			);

			// Both should use the same CTE pattern structure
			const ecommerceSql = ecommercePattern.queries[0].sqlText;
			const lmsSql = lmsPattern.queries[0].sqlText;

			// Both should start with WITH and use comma-separated CTEs
			expect(ecommerceSql).toMatch(/^WITH \w+ AS/);
			expect(lmsSql).toMatch(/^WITH \w+ AS/);

			// Both should have multiple CTEs separated by commas
			expect(ecommerceSql.split(',\n').length).toBeGreaterThan(2);
			expect(lmsSql.split(',\n').length).toBeGreaterThan(2);

			// Both should end with a SELECT statement
			expect(ecommerceSql).toMatch(/SELECT .+ FROM \w+;$/);
			expect(lmsSql).toMatch(/SELECT .+ FROM \w+;$/);

			// Both should be single-query transactions
			expect(ecommercePattern.queries).toHaveLength(1);
			expect(lmsPattern.queries).toHaveLength(1);
		});

		it('should handle different data types and constraints across domains', () => {
			// E-commerce with decimal prices and integer quantities
			const ecommerceOrder = ecommerceService.processDigitalOrder(999, [{productId: 1, quantity: 5, price: 19.99}], {
				amount: 99.95,
				method: 'stripe',
			});

			// LMS with text titles and date constraints
			const lmsCourse = lmsService.createCourseWithSetup(
				{title: 'Data Types Course', instructorId: 999, description: 'Learning about data types'},
				[{title: 'Data Type Assignment', dueDate: new Date('2024-12-31'), maxPoints: 75}]
			);

			// Both should handle their respective data types properly
			expect(ecommerceOrder.queries[0].values).toContain(19.99); // decimal
			expect(ecommerceOrder.queries[0].values).toContain(5); // integer
			expect(ecommerceOrder.queries[0].values).toContain('stripe'); // string

			expect(lmsCourse.queries[0].values).toContain('Data Types Course'); // string
			expect(lmsCourse.queries[0].values).toContain(999); // integer
			expect(lmsCourse.queries[0].values).toContain(75); // integer
		});
	});

	describe('Error Handling Across Domains', () => {
		it('should handle database errors consistently across all domains', async () => {
			const dbError = new Error('Connection timeout');
			(dbpg.query as jest.Mock).mockRejectedValue(dbError);

			const ecommercePromise = ecommerceService
				.processDigitalOrder(1, [{productId: 1, quantity: 1, price: 10}], {amount: 10, method: 'card'})
				.execute();

			const lmsPromise = lmsService.createCourseWithSetup({title: 'Error Course', instructorId: 1}).execute();

			// Both should reject with the same error
			await expect(ecommercePromise).rejects.toThrow('Connection timeout');
			await expect(lmsPromise).rejects.toThrow('Connection timeout');
		});
	});
});
