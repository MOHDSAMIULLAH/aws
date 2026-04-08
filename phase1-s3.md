# Phase 1 — Topic 3: S3 (Simple Storage Service)

---

## What is S3 Internally?

S3 is AWS's **object storage** service — not a file system, not a database. It's an infinitely scalable key-value store where the key is the file path and the value is the file content.

```
Traditional File System:              S3:
/home/ubuntu/images/cat.jpg           bucket-name/images/cat.jpg
      ↑ folder structure                   ↑ just a key (flat, no real folders)

Limited by disk size                  Unlimited storage
You manage the server                 AWS manages everything
Single region                         Multi-AZ replication automatically
```

Internally, S3 stores every object across **multiple AZs** — 99.999999999% (11 nines) durability. AWS replicates your file at least 3 times across different data centers.

---

## Core Concepts

```
S3
└── Bucket (globally unique name — like a domain name)
    ├── images/cat.jpg        ← object (key + content + metadata)
    ├── images/dog.jpg
    ├── uploads/cv.pdf
    └── index.html
```

| Term | What it means |
|---|---|
| Bucket | Top-level container. Name must be globally unique across ALL AWS accounts |
| Object | A file stored in S3 (max 5TB per object) |
| Key | Full "path" of the object (`images/cat.jpg`) — folders don't really exist |
| Prefix | Folder-like structure — just a naming convention |
| Bucket Policy | JSON rules — who can access what in the bucket |
| ACL | Access Control List — per-object access control (legacy, avoid) |
| Presigned URL | Temporary URL to access a private object (expires in N seconds) |
| Storage Class | Cost vs retrieval speed trade-off |
| Versioning | Keep multiple versions of the same object |
| Lifecycle Policy | Auto-move or delete objects after N days |

---

## Storage Classes

| Class | Use Case | Retrieval Speed |
|---|---|---|
| S3 Standard | Frequently accessed | Instant |
| S3-IA (Infrequent Access) | Backups, older data | Instant (higher retrieval fee) |
| S3 Glacier Instant | Archival, accessed rarely | Instant |
| S3 Glacier Flexible | Long-term archival | Minutes–hours |
| S3 Intelligent-Tiering | Unknown access patterns | Auto-moves between tiers |

---

## Architecture: How S3 Fits in Real Systems

```
User uploads image
      ↓
Node.js API (EC2) → SDK → S3 Bucket (private)
                              ↓
                    Generate Presigned URL → return to user
                              ↓
                    User browser fetches image directly from S3
                    (no load on your server)
```

```
Static frontend (React build)
      ↓
S3 Bucket (public static hosting) → CloudFront CDN → Users worldwide
```

---

## 2. Hands-On Steps

### Step 1: Create an S3 Bucket

1. AWS Console → **S3** → **Create bucket**
2. Bucket name: `zeenat-node-uploads` (must be globally unique — add random suffix if taken)
3. Region: same as your EC2 instance (e.g., `ap-south-1`)
4. **Block all public access**: leave ON (default) — keep private for now
5. Versioning: disable for now
6. Click **Create bucket**

---

### Step 2: Upload a File via Console

1. Click your bucket → **Upload**
2. Click **Add files** → select any file (e.g., a test image)
3. Leave all defaults → **Upload**
4. Click the uploaded file → copy the **Object URL**
5. Paste in browser → you'll get `AccessDenied` (bucket is private — correct!)

---

### Step 3: Make a Single Object Public (Bucket Policy)

To allow public read on the entire bucket:

1. Bucket → **Permissions** tab
2. **Block public access** → Edit → uncheck all → Save → confirm
3. **Bucket policy** → Edit → paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::zeenat-node-uploads/*"
    }
  ]
}
```

4. Save changes
5. Now paste the Object URL in browser → file loads

> **Production rule:** Never make buckets fully public. Use presigned URLs instead.

---

### Step 4: Static Website Hosting

Host a React/HTML site directly from S3:

1. Create a new bucket: `zeenat-static-site`
2. **Block public access** → uncheck all → Save
3. Bucket → **Properties** tab → scroll to **Static website hosting**
4. Enable → Index document: `index.html` → Error document: `index.html`
5. Save
6. Upload an `index.html` file:

```html
<!DOCTYPE html>
<html>
  <body>
    <h1>Hello from S3 Static Hosting!</h1>
    <p>Deployed by Zeenat</p>
  </body>
</html>
```

7. Add bucket policy (same as Step 3 but with `zeenat-static-site`)
8. Properties → Static website hosting → copy the **Bucket website endpoint**
9. Open in browser → your HTML page loads

---

### Step 5: Access S3 from EC2 (IAM Role + AWS SDK)

#### Attach IAM Role to EC2

1. IAM → Roles → Create role
2. Trusted entity: **AWS service → EC2**
3. Attach policy: `AmazonS3FullAccess`
4. Name: `ec2-s3-access-role`
5. EC2 → Instances → select instance → **Actions → Security → Modify IAM role**
6. Select `ec2-s3-access-role` → Update

#### Install AWS SDK on EC2

```bash
# SSH into EC2
cd ~/app
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

#### Upload File from Node.js

```js
// s3.js
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');

const s3 = new S3Client({ region: 'ap-south-1' }); // no keys needed — IAM Role handles auth

const BUCKET = 'zeenat-node-uploads';

// Upload a file
async function uploadFile(filePath, key) {
  const fileContent = fs.readFileSync(filePath);
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fileContent,
    ContentType: 'image/jpeg'
  });
  const result = await s3.send(command);
  console.log('Uploaded:', result);
}

// Generate presigned URL (temporary access link, expires in 1 hour)
async function getPresignedUrl(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  return url;
}

module.exports = { uploadFile, getPresignedUrl };
```

---

### Step 6: File Upload API Route (Multipart via Multer)

```bash
npm install multer multer-s3
```

```js
// upload.js
const express = require('express');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

const router = express.Router();
const s3 = new S3Client({ region: 'ap-south-1' });

const upload = multer({
  storage: multerS3({
    s3,
    bucket: 'zeenat-node-uploads',
    key: (req, file, cb) => {
      const key = `uploads/${Date.now()}-${file.originalname}`;
      cb(null, key);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

router.post('/upload', upload.single('file'), (req, res) => {
  res.json({
    message: 'File uploaded',
    url: req.file.location,
    key: req.file.key
  });
});

module.exports = router;
```

Add to `index.js`:
```js
const uploadRouter = require('./upload');
app.use('/api', uploadRouter);
```

Test:
```bash
curl -X POST http://<YOUR_IP>/api/upload \
  -F "file=@/path/to/image.jpg"
```

---

### Step 7: Enable Versioning

1. Bucket → **Properties** → **Bucket Versioning** → Enable
2. Upload the same file twice with different content
3. Bucket → file → **Versions** tab → you'll see both versions
4. Can restore any version or delete specific version

> Versioning protects against accidental deletes and overwrites.

---

### Step 8: Lifecycle Policy (Auto-cleanup)

Automatically delete old uploads after 30 days:

1. Bucket → **Management** → **Create lifecycle rule**
2. Rule name: `delete-old-uploads`
3. Prefix: `uploads/`
4. Actions: **Expire current versions of objects** → 30 days
5. Save

---

## 3. Hands-On Problems

### Problem 1 — Presigned URL API
Build an endpoint that returns a presigned URL for any S3 object:

```js
const { getPresignedUrl } = require('./s3');

app.get('/api/file/:key', async (req, res) => {
  try {
    const url = await getPresignedUrl(req.params.key);
    res.json({ url, expiresIn: '1 hour' });
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});
```

Test: `curl http://<IP>/api/file/uploads/test.jpg`
The URL in the response works in browser for 1 hour, then expires.

---

### Problem 2 — List All Files in Bucket

```js
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

app.get('/api/files', async (req, res) => {
  const command = new ListObjectsV2Command({
    Bucket: 'zeenat-node-uploads',
    Prefix: 'uploads/'
  });
  const result = await s3.send(command);
  const files = result.Contents.map(obj => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified
  }));
  res.json(files);
});
```

---

### Problem 3 — Delete a File

```js
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

app.delete('/api/file/:key', async (req, res) => {
  const command = new DeleteObjectCommand({
    Bucket: 'zeenat-node-uploads',
    Key: req.params.key
  });
  await s3.send(command);
  res.json({ message: 'Deleted', key: req.params.key });
});
```

---

## 4. Mini Projects

### Mini Project 1 — Image Upload Service
Build a REST API that:
1. `POST /api/upload` — accepts image, uploads to S3, returns presigned URL
2. `GET /api/files` — lists all uploaded files
3. `DELETE /api/file/:key` — deletes a file

All three routes are covered in Steps 5–6 + Problems 2–3 above.

### Mini Project 2 — Static Resume/Portfolio Site
1. Build a simple HTML/CSS page
2. Host it on S3 with static website hosting (Step 4)
3. Access via S3 website endpoint
4. (Bonus) Add CloudFront CDN in front — covered in Phase 4

---

## 5. Interview Questions & Answers

### Q1: S3 vs EBS vs EFS — what's the difference?
| Storage | Type | Use Case |
|---|---|---|
| S3 | Object storage | Files, images, backups, static hosting |
| EBS | Block storage (disk) | EC2 OS disk, databases |
| EFS | File system (NFS) | Shared file system across multiple EC2s |

S3 = you access via HTTP API. EBS = attached like a hard drive. EFS = mounted like a network folder.

### Q2: How do you securely give a user temporary access to a private S3 file?
Use a **Presigned URL**. Generate server-side using the AWS SDK with an expiry time. The URL contains a signature — valid only for the specified duration. No AWS credentials needed by the client.

### Q3: S3 bucket is public — what are the risks?
- Anyone can read, download, or enumerate your files
- Data leaks (user PII, credentials, internal docs)
- AWS bills you for bandwidth of all those downloads
- Fix: enable Block Public Access + use presigned URLs

### Q4: How does S3 achieve 11 nines durability?
AWS replicates every object across at least 3 Availability Zones within the region. Even if an entire AZ goes down, your data is safe. This is managed entirely by AWS — you do nothing.

### Q5: You accidentally deleted 10,000 files from S3 — how do you recover?
- If **versioning was enabled**: restore previous versions
- If **MFA Delete was enabled**: accidental deletes are blocked without MFA
- If neither: data is gone — no recovery
- Lesson: always enable versioning on critical buckets

### Q6: Large file (5GB) upload to S3 fails halfway — what do you use?
**Multipart Upload**. S3 SDK automatically splits large files into chunks (5MB+), uploads in parallel, and assembles server-side. If a chunk fails, only that chunk is retried. `aws-sdk` handles this automatically when file > 100MB.

---

## 6. Mistakes to Avoid

| Mistake | Why Dangerous | Fix |
|---|---|---|
| Public bucket with sensitive data | Anyone can access your files | Block Public Access + presigned URLs |
| No versioning on critical data | Accidental delete = permanent loss | Enable versioning |
| No lifecycle policies | Storage costs grow forever | Set lifecycle rules |
| Storing AWS keys in code | Keys leak via GitHub | Use IAM Roles (no keys needed) |
| Same bucket for everything | Hard to manage permissions | Separate buckets by purpose |
| No CORS config for frontend uploads | Browser uploads fail | Configure CORS on bucket |
| Ignoring S3 access logs | No audit trail | Enable server access logging |

---

## CORS Config (for browser-side uploads)

If your React frontend uploads directly to S3:

1. Bucket → **Permissions** → **Cross-origin resource sharing (CORS)**
2. Add:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["http://your-frontend-domain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

## Key Rules (Senior Engineer Mindset)

- Never make production buckets fully public — use presigned URLs
- Always enable versioning on buckets that hold important data
- Use IAM Roles for EC2-to-S3 access — never hardcode keys
- Separate buckets by environment (dev/staging/prod) and purpose
- Set lifecycle policies — don't let storage costs grow unchecked
- Enable S3 access logging + CloudTrail for audit
- CORS must be configured for any browser-to-S3 direct upload
