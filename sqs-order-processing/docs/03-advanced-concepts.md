# SQS Advanced Concepts

## 1. Visibility Timeout — Deep Dive

### What it is
When a consumer receives a message, SQS hides it from all other consumers for the visibility timeout duration. This **prevents duplicate processing** while one consumer is working on it.

### The danger zone

```
Visibility Timeout: 30 seconds
Actual Processing Time: 45 seconds

Timeline:
t=0s  → Consumer A receives message, starts processing
t=30s → Visibility timeout expires, message becomes visible AGAIN
t=31s → Consumer B receives the SAME message, starts processing
t=45s → Consumer A finishes, tries to delete message
t=45s → Consumer B is STILL processing the same message
         → Consumer A's delete succeeds (by ReceiptHandle, not MessageId)
         → Consumer B's delete will FAIL (ReceiptHandle is stale)
```

**Fix:** Set visibility timeout to 6x your expected processing time.

### Extending visibility timeout dynamically
For unpredictable processing times, use a heartbeat:

```javascript
async function processWithHeartbeat(message, processOrder) {
  const HEARTBEAT_INTERVAL = 20_000; // 20 seconds
  const EXTENSION = 60; // extend by 60 seconds each heartbeat

  const heartbeat = setInterval(async () => {
    try {
      await sqsClient.send(new ChangeMessageVisibilityCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: EXTENSION,
      }));
      console.log('[Heartbeat] Extended visibility timeout');
    } catch (err) {
      console.error('[Heartbeat] Failed to extend:', err.message);
    }
  }, HEARTBEAT_INTERVAL);

  try {
    const result = await processOrder(JSON.parse(message.Body));
    return result;
  } finally {
    clearInterval(heartbeat);
  }
}
```

---

## 2. Message Retention

- SQS keeps messages for **1 minute to 14 days** (default: 4 days)
- After retention period, messages are **permanently deleted** — even if not processed
- If your worker is down for more than your retention period, you **lose messages**

### Production strategy
- Set DLQ retention higher (7–14 days) so failed messages persist longer for debugging
- Set main queue retention based on your SLA (if order must be processed within 1 hour, you don't actually need 4 days)
- Monitor `ApproximateAgeOfOldestMessage` in CloudWatch — if this grows, your consumer can't keep up

---

## 3. At-Least-Once Delivery

SQS Standard queues guarantee **at-least-once delivery** — meaning the same message may be delivered more than once.

### When does this happen?
- Consumer processes successfully but crashes before deleting
- Two consumers poll at the exact same moment during visibility timeout expiry
- SQS internal redundancy sometimes delivers the same message twice

### The consequence
Without protection:
```
Order a1b2c3 processed twice
→ user charged twice
→ inventory deducted twice
→ two confirmation emails sent
```

This is a **real production bug**. You MUST handle it.

---

## 4. Idempotency — The Fix for Duplicates

**Idempotent** = doing the same thing twice produces the same result.

```
Charge $100 (first time)  → balance: $900 ✅
Charge $100 (second time) → balance: $800 ❌  (not idempotent)

vs.

Set balance = $900 (first time)  → balance: $900 ✅
Set balance = $900 (second time) → balance: $900 ✅  (idempotent)
```

### Pattern 1 — Database deduplication key

```javascript
async function processOrder(order) {
  const existing = await db.query(
    'SELECT id FROM processed_orders WHERE order_id = $1',
    [order.orderId]
  );

  if (existing.rows.length > 0) {
    console.log(`[Idempotency] Order ${order.orderId} already processed, skipping`);
    return { skipped: true, orderId: order.orderId };
  }

  await chargePayment(order);
  await sendEmail(order);

  await db.query(
    'INSERT INTO processed_orders (order_id, processed_at) VALUES ($1, NOW())',
    [order.orderId]
  );

  return { success: true, orderId: order.orderId };
}
```

### Pattern 2 — Redis deduplication (faster, with TTL)

```javascript
async function processOrderIdempotent(order) {
  const key = `processed:order:${order.orderId}`;
  
  // Only set if Not eXists — atomic check-and-set
  const result = await redis.set(key, '1', { EX: 86400, NX: true });
  
  if (result === null) {
    console.log(`[Idempotency] Duplicate detected: ${order.orderId}`);
    return { duplicate: true };
  }

  await processOrder(order);
  return { success: true };
}
```

### Which to use?
| Scenario | Use |
|----------|-----|
| Need audit trail of processed orders | Database |
| High throughput, speed matters | Redis |
| Simple, few duplicates expected | Database |
| Payment / financial system | Both (belt-and-suspenders) |

---

## 5. Production Best Practices

### Scaling Consumers

SQS naturally supports horizontal scaling — run multiple worker instances, each polls independently.

**On EC2/ECS:** Run N container instances of your worker.

**On Lambda:** Use SQS event source mapping — Lambda auto-scales based on queue depth.

```
Queue depth: 100 messages → Lambda spins up 10 concurrent executions
Queue depth: 1000 messages → Lambda scales to handle it (up to concurrency limit)
```

### Batch Delete for Efficiency

```javascript
import { DeleteMessageBatchCommand } from '@aws-sdk/client-sqs';

async function deleteMessageBatch(messages) {
  const entries = messages.map((msg, i) => ({
    Id: String(i),
    ReceiptHandle: msg.ReceiptHandle,
  }));

  const result = await sqsClient.send(new DeleteMessageBatchCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    Entries: entries,
  }));
  
  if (result.Failed?.length > 0) {
    console.error('[Worker] Some deletes failed:', result.Failed);
  }
}
```

### CloudWatch Metrics to Watch

| Metric | What it means | Alert when |
|--------|--------------|-----------|
| `ApproximateNumberOfMessagesVisible` | Messages waiting to be processed | Consistently > 1000 |
| `ApproximateAgeOfOldestMessage` | Age of oldest unprocessed message | > your SLA |
| `NumberOfMessagesSent` | Messages produced | Spike = traffic surge |
| `NumberOfMessagesDeleted` | Messages successfully processed | Drop = consumers failing |
| DLQ `ApproximateNumberOfMessagesVisible` | Failed messages | > 0 = something is broken |

### Set a DLQ Alarm

```
CloudWatch → Alarms → Create Alarm
→ Metric: SQS → order-processing-dlq → ApproximateNumberOfMessagesVisible
→ Condition: >= 1
→ Action: Send SNS notification (email/Slack)
```

---

## 6. Common Mistakes

### Mistake 1 — Not Deleting Messages After Success
Without deletion, message becomes visible again → processed infinite times.
Always call `DeleteMessageCommand` after successful processing.

### Mistake 2 — Visibility Timeout Too Short
Processing takes 45s, timeout is 30s → message re-delivered before you finish → duplicate processing.
**Fix:** Set timeout to 6x processing time. Use heartbeat for variable-duration tasks.

### Mistake 3 — Short Polling (Burning Money)
Not setting `WaitTimeSeconds` defaults to 0 → floods API with empty responses.
**Fix:** Always set `WaitTimeSeconds: 20`.

### Mistake 4 — Tight Coupling Through SQS
Consumer calling back to producer's database re-introduces the coupling SQS was meant to remove.
**Fix:** Use separate databases or a results queue.

### Mistake 5 — No DLQ Configured
A poison-pill message (bad data, unrecoverable error) loops forever consuming worker CPU.
**Fix:** Always configure a DLQ with `maxReceiveCount = 3-5`.
