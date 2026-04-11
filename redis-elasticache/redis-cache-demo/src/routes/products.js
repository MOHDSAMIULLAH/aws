const express = require('express');
const svc     = require('../services/productService');

const router = express.Router();

// GET /products
router.get('/', async (req, res) => {
  try {
    const start  = Date.now();
    const result = await svc.getAllProducts();
    const ms     = Date.now() - start;

    res.json({
      source:    result.source,
      latencyMs: ms,
      count:     result.data.length,
      data:      result.data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /products/:id
router.get('/:id', async (req, res) => {
  try {
    const start  = Date.now();
    const result = await svc.getProductById(req.params.id);
    const ms     = Date.now() - start;

    if (!result) return res.status(404).json({ error: 'Product not found' });

    res.json({
      source:    result.source,
      latencyMs: ms,
      data:      result.data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /products
router.post('/', async (req, res) => {
  try {
    const { name, price, category, stock } = req.body;
    if (!name || !price) {
      return res.status(400).json({ error: 'name and price are required' });
    }

    const product = await svc.createProduct({ name, price, category, stock });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /products/:id
router.put('/:id', async (req, res) => {
  try {
    const product = await svc.updateProduct(req.params.id, req.body);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /products/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await svc.deleteProduct(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: `Product ${req.params.id} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
