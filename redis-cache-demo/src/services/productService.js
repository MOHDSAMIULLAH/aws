const db    = require('../db');
const redis = require('../redis');

const TTL = parseInt(process.env.CACHE_TTL || '60');

// ── GET ALL ────────────────────────────────────────────────────
async function getAllProducts() {
  const cacheKey = 'products:all';

  const cached = await redis.get(cacheKey);
  if (cached) {
    return { source: 'cache', data: JSON.parse(cached) };
  }

  const result = await db.query('SELECT * FROM products ORDER BY id');
  await redis.set(cacheKey, JSON.stringify(result.rows), 'EX', TTL);

  return { source: 'db', data: result.rows };
}

// ── GET BY ID ─────────────────────────────────────────────────
async function getProductById(id) {
  const cacheKey = `product:${id}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return { source: 'cache', data: JSON.parse(cached) };
  }

  const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  if (!result.rows.length) return null;

  await redis.set(cacheKey, JSON.stringify(result.rows[0]), 'EX', TTL);

  return { source: 'db', data: result.rows[0] };
}

// ── CREATE ────────────────────────────────────────────────────
async function createProduct({ name, price, category, stock }) {
  const result = await db.query(
    'INSERT INTO products (name, price, category, stock) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, price, category, stock]
  );
  const product = result.rows[0];

  // Invalidate list cache — new product was added
  await redis.del('products:all');

  return product;
}

// ── UPDATE ────────────────────────────────────────────────────
async function updateProduct(id, { name, price, category, stock }) {
  const result = await db.query(
    'UPDATE products SET name=$1, price=$2, category=$3, stock=$4 WHERE id=$5 RETURNING *',
    [name, price, category, stock, id]
  );
  if (!result.rows.length) return null;

  const product = result.rows[0];

  // Invalidate both the individual and list caches
  await redis.del(`product:${id}`);
  await redis.del('products:all');

  return product;
}

// ── DELETE ────────────────────────────────────────────────────
async function deleteProduct(id) {
  const result = await db.query('DELETE FROM products WHERE id=$1 RETURNING id', [id]);
  if (!result.rows.length) return false;

  await redis.del(`product:${id}`);
  await redis.del('products:all');

  return true;
}

module.exports = { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct };
