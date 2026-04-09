const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/posts  (optional: ?user_id=x)
router.get('/', async (req, res, next) => {
  try {
    const { user_id } = req.query;
    let query = `
      SELECT p.id, p.title, p.body, p.created_at,
             u.id AS user_id, u.name AS author_name
      FROM posts p
      JOIN users u ON u.id = p.user_id
    `;
    const params = [];
    if (user_id) {
      query += ' WHERE p.user_id = $1';
      params.push(user_id);
    }
    query += ' ORDER BY p.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/posts/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.body, p.created_at,
              u.id AS user_id, u.name AS author_name
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/posts
router.post('/', async (req, res, next) => {
  const { user_id, title, body } = req.body;
  if (!user_id || !title) {
    return res.status(400).json({ error: 'user_id and title are required' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO posts (user_id, title, body) VALUES ($1, $2, $3) RETURNING *',
      [user_id, title, body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(err);
  }
});

// PUT /api/posts/:id
router.put('/:id', async (req, res, next) => {
  const { title, body } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE posts
       SET title = COALESCE($1, title),
           body  = COALESCE($2, body)
       WHERE id = $3 RETURNING *`,
      [title, body, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM posts WHERE id = $1',
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Post not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
