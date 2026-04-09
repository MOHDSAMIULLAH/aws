require('dotenv').config();

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.set('trust proxy', 1);

// ── Health check ──────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: process.env.APP_NAME || 'rds-crud-api',
    env: process.env.NODE_ENV || 'development',
    db: process.env.DB_HOST,
    uptime: `${process.uptime().toFixed(2)}s`,
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'RDS Blog API',
    version: '1.0.0',
    endpoints: {
      health:     'GET  /health',
      listUsers:  'GET  /api/users',
      getUser:    'GET  /api/users/:id',
      createUser: 'POST /api/users',
      updateUser: 'PUT  /api/users/:id',
      deleteUser: 'DELETE /api/users/:id',
      listPosts:  'GET  /api/posts',
      getPosts:   'GET  /api/posts?user_id=:id',
      getPost:    'GET  /api/posts/:id',
      createPost: 'POST /api/posts',
      updatePost: 'PUT  /api/posts/:id',
      deletePost: 'DELETE /api/posts/:id',
    },
  });
});

app.use('/api/users', require('./src/routes/users'));
app.use('/api/posts', require('./src/routes/posts'));

// ── 404 ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ─────────────────────────────
app.use(require('./src/middleware/errorHandler'));

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] ENV: ${process.env.NODE_ENV}`);
  console.log(`[${new Date().toISOString()}] DB Host: ${process.env.DB_HOST}`);
});
