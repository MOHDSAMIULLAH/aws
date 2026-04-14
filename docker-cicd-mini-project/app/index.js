const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || 'docker-cicd-app';

app.use(express.json());

// ── Health check ────────────────────────────────────────────
// Used by ECS / ALB to verify the container is alive
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy hai',
    app: APP_NAME,
    version: process.env.APP_VERSION || '1.0.0',
    uptime: `${process.uptime().toFixed(2)}s`,
    timestamp: new Date().toISOString(),
  });
});

// ── Root ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: `Welcome to ${APP_NAME}`,
    endpoints: {
      health:   'GET /health',
      products: 'GET /api/products',
    },
  });
});

// ── Products (mock data — no DB needed for this demo) ───────
const products = [
  { id: 1, name: 'Laptop',  price: 999 },
  { id: 2, name: 'Mouse',   price: 29  },
  { id: 3, name: 'Monitor', price: 299 },
];

app.get('/api/products', (req, res) => {
  res.json({ count: products.length, products });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// ── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `${req.method} ${req.path} not found` });
});

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] ${APP_NAME} running on port ${PORT}`);
});
