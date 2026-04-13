# SQS Hands-On Lab — AWS Console

## Prerequisites

- AWS account with Free Tier or credits
- IAM user with SQS permissions (or Admin for learning)
- Node.js 18+ installed locally
- AWS CLI configured (`aws configure`)

---

## Step 1 — Create the Dead-Letter Queue (DLQ) First

Always create the DLQ **before** the main queue so you can link it.

1. Go to **AWS Console → SQS → Create queue**
2. Settings:
   - Type: **Standard**
   - Name: `order-processing-dlq`
   - Visibility timeout: `30 seconds`
   - Message retention: `7 days` (keep failed messages longer for debugging)
   - All other settings: leave default
3. Click **Create Queue**
4. **Copy the ARN** of this DLQ (you'll need it in the next step)

---

## Step 2 — Create the Main Queue

1. Go to **SQS → Create queue**
2. Settings:
   - Type: **Standard**
   - Name: `order-processing-queue`

### Visibility Timeout
- Set to **60 seconds**
- Why: Our order processing takes ~5–10 seconds. Set timeout comfortably above that. If processing takes longer than 60s, message becomes visible again and gets processed twice.

### Message Retention
- Set to **4 days** (default is fine, max is 14 days)
- This means if your worker is down for 4 days, messages are gone

### Receive Message Wait Time
- Set to **20 seconds** (enables long polling)
- This reduces empty responses and API costs significantly

### Dead-Letter Queue (Redrive Policy)
- Scroll to **Dead-letter queue** section
- Enable redrive: **Yes**
- Dead-letter queue ARN: paste the ARN from Step 1
- Maximum receives: **3** (after 3 failures, send to DLQ)

3. Click **Create Queue**
4. **Copy the Queue URL** — you'll need this in the `.env`

---

## Step 3 — Verify Your Setup

1. Open `order-processing-queue`
2. Click **Send and receive messages**
3. Send a test message:
   ```json
   {"orderId": "test-001", "userId": "user-123", "item": "laptop"}
   ```
4. Click **Poll for messages**
5. You should see your message appear
6. Click the message → inspect it
7. **Do NOT delete it manually** — the visibility timeout will expire and it'll reappear

---

## Step 4 — IAM Permissions for Your App

If using an IAM user or role for your Node.js app, it needs these permissions:

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

For local development: just run `aws configure` with your IAM credentials. AWS SDK picks them up automatically.

---

## Step 5 — Verify AWS CLI Access

```bash
# List your queues
aws sqs list-queues --region ap-south-1

# Send a test message via CLI
aws sqs send-message \
  --queue-url https://sqs.ap-south-1.amazonaws.com/ACCOUNT_ID/order-processing-queue \
  --message-body '{"test": "hello"}' \
  --region ap-south-1

# Receive a message
aws sqs receive-message \
  --queue-url https://sqs.ap-south-1.amazonaws.com/ACCOUNT_ID/order-processing-queue \
  --region ap-south-1
```

---

## Queue Settings Summary

| Setting | Main Queue | DLQ |
|---------|-----------|-----|
| Type | Standard | Standard |
| Visibility Timeout | 60s | 30s |
| Message Retention | 4 days | 7 days |
| Long Polling | 20s | default |
| Max Receives | 3 → then DLQ | N/A |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                     AWS SQS                          │
│                                                      │
│  Producer (API)                                      │
│  POST /order  ──────────→  order-processing-queue    │
│                                  │                   │
│                          [message visible]            │
│                                  │                   │
│                    Consumer receives message          │
│                    [visibility timeout: 60s]          │
│                                  │                   │
│                    ┌─────────────┴────────────┐      │
│                    │ Success                  │ Fail │
│                    ↓                          ↓      │
│              Delete message         Visibility expires│
│                                     Retry (max 3)    │
│                                          ↓           │
│                                   → DLQ after 3 fails│
└──────────────────────────────────────────────────────┘
```
