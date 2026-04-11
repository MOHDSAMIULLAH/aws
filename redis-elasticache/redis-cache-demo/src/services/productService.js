const { eq, asc } = require('drizzle-orm');
const { db }       = require('../db');
const { products } = require('../db/schema');
const redis        = require('../redis');

const TTL = parseInt(process.env.CACHE_TTL || '60');

// ── GET ALL ────────────────────────────────────────────────────
async function getAllProducts() {
  const cacheKey = 'products:all';

  const cached = await redis.get(cacheKey);
  if (cached) return { source: 'cache', data: JSON.parse(cached) };

  const data = await db.select().from(products).orderBy(asc(products.id));
  await redis.set(cacheKey, JSON.stringify(data), 'EX', TTL);

  return { source: 'db', data };
}

// ── GET BY ID ─────────────────────────────────────────────────
async function getProductById(id) {
  const cacheKey = `product:${id}`;

  const cached = await redis.get(cacheKey);
  if (cached) return { source: 'cache', data: JSON.parse(cached) };

  const rows = await db.select().from(products).where(eq(products.id, parseInt(id)));
  if (!rows.length) return null;

  await redis.set(cacheKey, JSON.stringify(rows[0]), 'EX', TTL);

  return { source: 'db', data: rows[0] };
}

// ── CREATE ────────────────────────────────────────────────────
async function createProduct({ name, price, category, stock }) {
  const rows = await db
    .insert(products)
    .values({ name, price, category, stock })
    .returning();

  await redis.del('products:all');

  return rows[0];
}

// ── UPDATE ────────────────────────────────────────────────────
async function updateProduct(id, { name, price, category, stock }) {
  const rows = await db
    .update(products)
    .set({ name, price, category, stock })
    .where(eq(products.id, parseInt(id)))
    .returning();

  if (!rows.length) return null;

  await redis.del(`product:${id}`);
  await redis.del('products:all');

  return rows[0];
}

// ── DELETE ────────────────────────────────────────────────────
async function deleteProduct(id) {
  const rows = await db
    .delete(products)
    .where(eq(products.id, parseInt(id)))
    .returning({ id: products.id });

  if (!rows.length) return false;

  await redis.del(`product:${id}`);
  await redis.del('products:all');

  return true;
}

module.exports = { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct };
