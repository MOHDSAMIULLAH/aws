require('dotenv').config();

const express = require('express');
const uploadRouter = require('./src/routes/upload');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust Nginx proxy — required to get real client IP
app.set('trust proxy', 1);

// ── Health check ──────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: process.env.APP_NAME || 'zeenat-s3-api',
    env: process.env.NODE_ENV || 'development',
    bucket: process.env.S3_BUCKET_NAME,
    uptime: `${process.uptime().toFixed(2)}s`,
    timestamp: new Date().toISOString(),
    memory: {
      used: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      total: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`
    }
  });
});

// ── Routes ────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'Zeenat S3 File API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      upload: 'POST /api/upload',
      listFiles: 'GET /api/files',
      getFile: 'GET /api/file/:key',
      deleteFile: 'DELETE /api/file/:key'
    }
  });
});

app.use('/api', uploadRouter);

// ── 404 handler ───────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler (must be last) ──────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[${new Date().toISOString()}] S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
});
