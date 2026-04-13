# SQS Order Processing System

Async order processing system built with Node.js and AWS SQS.

A user hits `POST /order` → message queued in SQS → worker consumes and processes it async.
Failed messages retry 3 times automatically, then land in a Dead-Letter Queue (DLQ).

---

## Project Structure

```
sqs-order-processing/
├── producer/
│   └── index.js              ← Express API — POST /order sends message to SQS
├── consumer/
│   ├── worker.js             ← Polls SQS, processes batches concurrently
│   └── orderProcessor.js     ← Business logic (inventory → payment → email)
├── shared/
│   └── sqsClient.js          ← Shared AWS SQS client (SDK v3)
├── docs/
│   ├── 01-concepts.md        ← SQS concepts: queue, producer, consumer, Standard vs FIFO
│   ├── 02-hands-on.md        ← AWS Console setup: create queue, DLQ, IAM, CLI verify
│   ├── 03-advanced-concepts.md ← Visibility timeout, idempotency, scaling, common mistakes
│   └── 04-interview-qa.md    ← Junior → Architect Q&A + scenario questions
├── .env.example
├── .gitignore
└── package.json
```

---

## Prerequisites

- Node.js 18+
- AWS account (Free Tier or credits)
- AWS CLI installed and configured

---

## Step 1 — AWS Console Setup

Before running the code you need two SQS queues. **Create the DLQ first.**

### 1a. Create the Dead-Letter Queue

1. AWS Console → **SQS** → **Create queue**
2. Settings:
   - Type: **Standard**
   - Name: `order-processing-dlq`
   - Visibility timeout: `30 seconds`
   - Message retention: `7 days`
3. **Create Queue** → copy the **ARN** (you'll need it next)

### 1b. Create the Main Queue

1. SQS → **Create queue**
2. Settings:
   - Type: **Standard**
   - Name: `order-processing-queue`
   - Visibility timeout: `60 seconds`
   - Message retention: `4 days`
   - Receive message wait time: `20 seconds` ← enables long polling
3. Scroll to **Dead-letter queue** section:
   - Enable redrive: **Yes**
   - Dead-letter queue ARN: paste the ARN from step 1a
   - Maximum receives: `3`
4. **Create Queue** → copy the **Queue URL** (you'll need it in `.env`)

### 1c. Get your Queue URLs

From the SQS console, open each queue and copy the URL. They look like:
```
https://sqs.ap-south-1.amazonaws.com/123456789012/order-processing-queue
https://sqs.ap-south-1.amazonaws.com/123456789012/order-processing-dlq
```

---

## Step 2 — IAM Permissions

Your IAM user needs these SQS permissions. Add them via IAM → Users → your user → Add permissions → JSON policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:YOUR_REGION:YOUR_ACCOUNT_ID:order-processing-queue"
    }
  ]
}
```

---

## Step 3 — Local Setup

```bash
# Clone / navigate to the project
cd sqs-order-processing

# Install dependencies
npm install

# Create your .env from the example
cp .env.example .env
```

Open `.env` and fill in your values:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=ap-south-1

SQS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/ACCOUNT_ID/order-processing-queue
SQS_DLQ_URL=https://sqs.ap-south-1.amazonaws.com/ACCOUNT_ID/order-processing-dlq

PORT=3000
```

---

## Step 4 — Verify AWS Access (optional but recommended)

```bash
# Confirm your credentials work
aws sqs list-queues --region ap-south-1

# Should return your two queue URLs
```

---

## Step 5 — Run the Project

You need **two terminals** running simultaneously.

### Terminal 1 — Start the Consumer (Worker)

```bash
npm run consumer
```

Expected output:
```
[Worker] Starting SQS consumer worker...
[Worker] Queue: https://sqs.ap-south-1.amazonaws.com/...
[Worker] Polling for messages (long poll: 20s)...

....
```

The dots mean the worker is polling but the queue is empty. Leave this running.

### Terminal 2 — Start the Producer (API)

```bash
npm run producer
```

Expected output:
```
[Producer] API running on port 3000
```

---

## Step 6 — Send Test Orders

### Send a single order

```bash
curl -X POST http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "item": "MacBook Pro", "quantity": 1}'
```

Expected response (`202 Accepted`):
```json
{
  "message": "Order received and queued for processing",
  "orderId": "a1b2c3d4-...",
  "status": "QUEUED",
  "sqsMessageId": "abc123..."
}
```

Switch to Terminal 1 — you should see:
```
[Worker] Received 1 message(s)

[Worker] Processing message: abc123... (attempt #1)
[Processor] Starting order: a1b2c3d4-...
[Processor] Inventory checked for: MacBook Pro
[Processor] Payment charged for order: a1b2c3d4-...
[Processor] Confirmation email sent to user: user-123
[Processor] Order COMPLETE: a1b2c3d4-...
[Worker] ✅ Deleted after success: abc123...
```

### Send multiple orders at once

```bash
for i in {1..5}; do
  curl -s -X POST http://localhost:3000/order \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"user-$i\", \"item\": \"Product-$i\", \"quantity\": $i}"
  echo ""
done
```

---

## Step 7 — Test DLQ Behavior (Retry + Dead-Letter)

The `orderProcessor.js` has a ~20% random failure rate to let you observe retries naturally.

To **force all messages to fail** and see the full DLQ flow:

1. Open `consumer/orderProcessor.js` and change line:
   ```javascript
   if (Math.random() < 0.2) {   // change 0.2 to 1.0
   ```
2. Restart the consumer: `npm run consumer`
3. Send an order
4. Watch the worker logs — you'll see:
   ```
   [Worker] Processing message: abc123... (attempt #1)
   [Worker] ❌ Failed for order-id: Payment failed...
   [Worker] Attempt 1/3. Message stays in queue for retry.
   
   [Worker] Processing message: abc123... (attempt #2)
   [Worker] ❌ Failed ...
   
   [Worker] Processing message: abc123... (attempt #3)
   [Worker] ❌ Failed ...
   ```
5. After 3 failures, SQS moves the message to the DLQ automatically
6. Go to **AWS Console → SQS → `order-processing-dlq`** → **Poll for messages**
7. You'll see your failed message with the full payload

> Change `1.0` back to `0.2` when done testing.

---

## Architecture

```
User
  │
  ▼
POST /order (Express API — producer)
  │  responds 202 immediately
  ▼
SQS: order-processing-queue
  │  [visibility timeout: 60s]
  ▼
Worker polls every ~20s (long polling)
  │
  ├── Success → DeleteMessage ✅
  │
  └── Failure → message becomes visible again after 60s
                    │
                    ├── Retry attempt #2
                    ├── Retry attempt #3
                    └── After 3 failures → DLQ 📥
```

---

## How Retry Works

SQS handles retries automatically — no extra code needed.

1. Consumer receives message → visibility timeout starts (60s)
2. Processing fails → consumer does NOT delete the message
3. After 60s, message becomes visible again
4. Consumer picks it up again (attempt #2)
5. After 3 failures (maxReceiveCount=3), SQS moves message to DLQ

You can inspect DLQ messages, fix the bug, and re-drive them back to the main queue from the AWS Console.

---

## Key Configuration

| Setting | Value | Why |
|---------|-------|-----|
| Visibility timeout | 60s | Processing takes ~1.6s; 60s gives safe headroom |
| Long polling | 20s | Reduces empty API calls and cost |
| Max receive count | 3 | 3 attempts before DLQ |
| DLQ retention | 7 days | Keep failed messages longer for debugging |

---

## Reference Docs

| File | What's in it |
|------|-------------|
| `docs/01-concepts.md` | SQS core concepts, Standard vs FIFO, message lifecycle |
| `docs/02-hands-on.md` | Detailed AWS Console setup with screenshots guide |
| `docs/03-advanced-concepts.md` | Visibility timeout deep dive, idempotency patterns, scaling, common mistakes |
| `docs/04-interview-qa.md` | Interview Q&A from junior to architect level |
