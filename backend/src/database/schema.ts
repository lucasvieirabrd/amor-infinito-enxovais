import { mysqlTable, varchar, datetime, int, decimal, mysqlEnum, text, json } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// Tabelas principais
export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  role: mysqlEnum('role', ['admin', 'seller']).notNull().default('seller'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  deletedAt: datetime('deleted_at'),
});

export const customers = mysqlTable('customers', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  cpf: varchar('cpf', { length: 14 }).notNull().unique(),
  email: varchar('email', { length: 255 }),
  cep: varchar('cep', { length: 9 }),
  addressStreet: varchar('address_street', { length: 255 }),
  addressNeighborhood: varchar('address_neighborhood', { length: 255 }),
  addressCity: varchar('address_city', { length: 255 }),
  addressState: varchar('address_state', { length: 2 }),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  deletedAt: datetime('deleted_at'),
});

export const products = mysqlTable('products', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 50 }).unique(),
  quantity: int('quantity').notNull().default(0),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  minStockLevel: int('min_stock_level').notNull().default(0),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  deletedAt: datetime('deleted_at'),
});

export const sales = mysqlTable('sales', {
  id: varchar('id', { length: 36 }).primaryKey(),
  saleNumber: varchar('sale_number', { length: 20 }).notNull().unique(),
  customerId: varchar('customer_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  paymentMethod: mysqlEnum('payment_method', ['cash', 'credit_card', 'installment']).notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  saleDate: datetime('sale_date').notNull().default(sql`CURRENT_TIMESTAMP`),
  installmentsCount: int('installments_count'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  deletedAt: datetime('deleted_at'),
});

export const saleItems = mysqlTable('sale_items', {
  id: varchar('id', { length: 36 }).primaryKey(),
  saleId: varchar('sale_id', { length: 36 }).notNull(),
  productId: varchar('product_id', { length: 36 }).notNull(),
  quantity: int('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const installments = mysqlTable('installments', {
  id: varchar('id', { length: 36 }).primaryKey(),
  saleId: varchar('sale_id', { length: 36 }).notNull(),
  customerId: varchar('customer_id', { length: 36 }).notNull(),
  installmentNumber: int('installment_number').notNull(),
  dueDate: datetime('due_date').notNull(),
  originalAmount: decimal('original_amount', { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).notNull().default('0.00'),
  paymentDate: datetime('payment_date'),
  status: mysqlEnum('status', ['pending', 'paid', 'overdue', 'canceled']).notNull().default('pending'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  deletedAt: datetime('deleted_at'),
});

export const messages = mysqlTable('messages', {
  id: varchar('id', { length: 36 }).primaryKey(),
  metaMessageId: varchar('meta_message_id', { length: 255 }).unique(),
  customerId: varchar('customer_id', { length: 36 }),
  fromPhone: varchar('from_phone', { length: 20 }).notNull(),
  toPhone: varchar('to_phone', { length: 20 }).notNull(),
  type: mysqlEnum('type', ['text', 'template', 'image', 'audio', 'video', 'document', 'unknown']).notNull(),
  content: text('content'),
  direction: mysqlEnum('direction', ['inbound', 'outbound']).notNull(),
  status: mysqlEnum('status', ['sent', 'delivered', 'read', 'failed', 'received']).notNull().default('received'),
  tag: mysqlEnum('tag', ['cobrança', 'lead', 'suporte', 'none']).notNull().default('none'),
  notes: text('notes'),
  timestamp: datetime('timestamp').notNull(),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  deletedAt: datetime('deleted_at'),
});

export const auditLogs = mysqlTable('audit_logs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  action: varchar('action', { length: 255 }).notNull(),
  entityType: varchar('entity_type', { length: 255 }).notNull(),
  entityId: varchar('entity_id', { length: 36 }).notNull(),
  oldValue: json('old_value'),
  newValue: json('new_value'),
  ipAddress: varchar('ip_address', { length: 45 }),
  timestamp: datetime('timestamp').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = mysqlTable('settings', {
  id: varchar('id', { length: 36 }).primaryKey(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const saleSequence = mysqlTable('sale_sequence', {
  id: int('id').primaryKey().autoincrement(),
  currentNumber: int('current_number').notNull().default(0),
  prefix: varchar('prefix', { length: 10 }).notNull().default('VEN-'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});
