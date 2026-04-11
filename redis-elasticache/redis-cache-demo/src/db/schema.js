const { pgTable, serial, text, numeric, integer, timestamp } = require('drizzle-orm/pg-core');

const products = pgTable('products', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  price:     numeric('price', { precision: 10, scale: 2 }).notNull(),
  category:  text('category'),
  stock:     integer('stock').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

module.exports = { products };
