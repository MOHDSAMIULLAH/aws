const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/s3');

const router = express.Router();
const BUCKET = process.env.S3_BUCKET_NAME;

// Multer — store file in memory buffer before sending to S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Allowed: jpg, png, webp, pdf'));
    }
    cb(null, true);
  }
});

// ─────────────────────────────────────────────
// POST /api/upload
// Upload a single file to S3
// ─────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided.' });
    }

    const fileExtension = req.file.originalname.split('.').pop();
    console.log(`fileExtension: ${fileExtension}`);
    const key = `uploads/${uuidv4()}.${fileExtension}`;
    // console.log(`key: ${key}`);

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        originalName: req.file.originalname,
        uploadedBy: req.headers['x-user-id'] || 'anonymous'
      }
    });
    // console.log(`command: ${JSON.stringify(command)}`);

    await s3Client.send(command);

    // Generate presigned URL so the client can view the file immediately
    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: 3600 } // 1 hour
    );
    // console.log(`url: ${url}`);

    res.status(201).json({
      message: 'File uploaded successfully',
      key,
      url,
      expiresIn: '1 hour',
      size: req.file.size,
      mimeType: req.file.mimetype
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// GET /api/files
// List all files in the bucket (uploads/ prefix)
// ─────────────────────────────────────────────
router.get('/files', async (req, res, next) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'uploads/',
      MaxKeys: 50
    });

    const result = await s3Client.send(command);

    const files = (result.Contents || []).map(obj => ({
      key: obj.Key,
      size: `${(obj.Size / 1024).toFixed(2)} KB`,
      lastModified: obj.LastModified
    }));

    res.json({
      count: files.length,
      files
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// GET /api/file/:key
// Generate a presigned URL for a specific file
// ─────────────────────────────────────────────
router.get('/file/:key(*)', async (req, res, next) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: req.params.key
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.json({
      key: req.params.key,
      url,
      expiresIn: '1 hour'
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// DELETE /api/file/:key
// Delete a file from S3
// ─────────────────────────────────────────────
router.delete('/file/:key(*)', async (req, res, next) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: req.params.key
    });

    await s3Client.send(command);

    res.json({
      message: 'File deleted successfully',
      key: req.params.key
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
