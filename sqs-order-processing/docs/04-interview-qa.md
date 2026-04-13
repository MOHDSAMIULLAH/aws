# SQS Interview Q&A — Junior to Architect

---

## Tier 1 — Junior (1–2 years)

---

**Q: What is SQS and why would you use it?**

A: SQS is a managed message queue from AWS. I'd use it to decouple services so they don't have to call each other directly. For example, when a user places an order, instead of the API synchronously calling the payment service, inventory service, and email service — it just puts a message in SQS and responds immediately. A separate worker handles the processing. This gives reliability (messages persist even if the worker crashes), scalability (can run many workers without changing the API), and a better user experience (API responds in milliseconds instead of waiting for processing).

---

**Q: What's the difference between Standard and FIFO queues?**

A: Standard gives you unlimited throughput but no delivery order guarantee and possible duplicates. FIFO gives exactly-once processing and strict ordering but has throughput limits (~3000 msg/sec with batching). I'd use FIFO for payment transactions where order matters — you can't process a refund before the initial charge. I'd use Standard for image processing, log ingestion, or notification delivery where high throughput matters more than order.

---

**Q: What is visibility timeout?**

A: When a consumer receives a message, SQS hides it from all other consumers for the visibility timeout period. This gives the consumer time to process it without another consumer picking it up simultaneously. If the consumer successfully processes the order, it deletes the message. If it fails or crashes, the message becomes visible again after the timeout and another consumer can retry it. The key mistake is setting the timeout too short — if processing takes 45 seconds but the timeout is 30 seconds, the message becomes visible again and gets processed twice.

---

**Q: What is a Dead-Letter Queue (DLQ)?**

A: A DLQ is a separate queue where messages go after failing a certain number of times (maxReceiveCount). For example, if a message fails processing 3 times, SQS automatically moves it to the DLQ. This prevents a "poison pill" message from looping forever and consuming worker resources. The DLQ is for investigation — you look at what message caused failures, fix the bug, and can then re-drive messages back to the main queue for reprocessing.

---

## Tier 2 — Mid-Level (2–4 years)

---

**Q: Why use SQS instead of making direct API calls between services?**

A: Direct API calls create tight coupling:
- If the downstream service is slow, the caller blocks and the user waits
- If the downstream service is down, the caller fails
- If there's a traffic spike, the downstream service gets overwhelmed
- Both services must be deployed and scaled together

With SQS:
- The producer responds immediately — no waiting for the consumer
- If the consumer crashes, messages wait safely in the queue (up to 14 days)
- Traffic spikes are absorbed — the queue buffers them, consumers process at their own pace
- Services are independently deployable and scalable

The trade-off is eventual consistency — the caller doesn't know when the order was actually processed. That's acceptable for most async workflows like order processing but not for something like checking account balance.

---

**Q: How do you handle duplicate messages in SQS?**

A: SQS Standard guarantees at-least-once delivery, meaning duplicates can happen. The solution is idempotency — designing your processing so running it twice produces the same result.

Practical approach:
1. Each message has a unique ID (I generate a UUID in the producer as `orderId`)
2. Before processing, check a database or Redis: "Have I already processed this orderId?"
3. If yes → skip silently, delete the message
4. If no → process, then record it as done

For payments, I'd use a database with a unique constraint on `order_id` in the `processed_orders` table. Trying to insert a duplicate throws an error that I can catch and treat as "already done." For high-volume use cases, Redis `SET key NX EX` is faster.

---

**Q: What happens if a consumer crashes mid-processing?**

A: The message is not deleted — it stays in the queue. After the visibility timeout expires, the message becomes visible again and another consumer (or the restarted one) picks it up. This is why not deleting on failure is actually correct behavior — SQS uses the lack of deletion as the failure signal.

The important thing is to set visibility timeout correctly. If it's too short, message becomes visible before the consumer finishes. If it's too long, a crash means the message is stuck for a long time before retry.

After `maxReceiveCount` attempts (typically 3–5), SQS moves the message to the DLQ, where it waits for investigation.

---

**Q: How do you scale SQS consumers?**

A: SQS naturally supports horizontal scaling. Run multiple consumer instances — each one polls independently and SQS ensures each message goes to only one consumer at a time (via visibility timeout).

Strategies:
- **EC2/ECS:** Run N container instances of the worker. Scale based on `ApproximateNumberOfMessagesVisible` via ASG
- **Lambda:** Use SQS event source mapping — Lambda automatically scales based on queue depth, up to your concurrency limit
- **Kubernetes:** HPA based on custom metric (queue depth via KEDA)

The key CloudWatch metric is `ApproximateAgeOfOldestMessage` — if this grows, your consumers can't keep up and you need more of them.

---

## Tier 3 — Senior / Architect (4+ years)

---

**Q: When would you NOT use SQS? What are the trade-offs?**

A: SQS introduces asynchronous processing, which means eventual consistency. You wouldn't use it when:

1. **Immediate response required** — if the user needs "your payment was successful" synchronously, SQS adds latency
2. **Request-response pattern** — SQS is one-way; for bidirectional, consider SQS + response queue or just direct HTTP
3. **Ordering with high throughput** — FIFO is limited to 3000 msg/sec; high-volume ordered streams belong in Kafka/Kinesis
4. **Real-time event streaming** — SQS is for jobs, not streams. Kinesis Data Streams handles real-time analytics better
5. **Message > 256KB** — SQS has a hard limit; use S3 + SQS (put payload in S3, send reference in SQS)

---

**Q: Describe how you'd design a system where order of processing matters (e.g., user account state transitions)**

A: For strict ordering tied to a specific entity (like a userId), I'd use SQS FIFO with a **MessageGroupId** equal to the userId:

```javascript
await sqsClient.send(new SendMessageCommand({
  QueueUrl: process.env.SQS_FIFO_QUEUE_URL,
  MessageBody: JSON.stringify(event),
  MessageGroupId: userId,           // all events for same user stay ordered
  MessageDeduplicationId: eventId,  // dedup key
}));
```

This guarantees that events for user-A are processed in order while events for user-B and user-C are processed in parallel — giving you per-entity ordering without sacrificing overall throughput.

If throughput requirements exceed FIFO limits (3000/sec), the architecture shifts to Kafka with partitioning by userId, which gives the same guarantee at much higher scale.

---

**Q: How would you handle a DLQ message that keeps failing even after you fix the bug?**

A: This usually means the message payload itself is the problem (corrupted, unexpected format, business rule violation that can't be recovered). My approach:

1. **Inspect** — read the DLQ message, understand why it fails
2. **Categorize:**
   - Transient failure (downstream was down) → re-drive to main queue
   - Permanent failure (bad data, unrecoverable) → process manually, archive, and dead-letter
3. **SQS Dead-letter Queue Re-drive** — AWS Console and API both support re-driving DLQ messages back to the main queue after a fix
4. **Poison pill detection** — if a message has been in the DLQ for X days, trigger a compensating transaction (e.g., cancel order, refund) and alert on-call

---

**Q: How would you prevent message loss if your SQS queue is deleted accidentally?**

A: SQS doesn't persist messages outside its own storage — deletion is permanent. Mitigation strategies:

1. **Infrastructure as Code** — use CloudFormation/Terraform with deletion protection; don't allow console deletion in production
2. **Event archive** — before sending to SQS, write the event to a durable store (DynamoDB or S3). If queue is lost, can replay from there
3. **Event sourcing** — treat events as first-class persisted entities; SQS is just the delivery mechanism, not the source of truth
4. **IAM policies** — restrict `sqs:DeleteQueue` so only infrastructure-as-code roles can call it, not application roles

---

## Common Scenario Questions

---

**Scenario: Your consumer is CPU-bound and processing is slow. Queue depth keeps growing. What do you do?**

1. **Scale consumers horizontally** — run more worker instances; queue handles distribution automatically
2. **Increase batch size** — poll up to 10 messages instead of 1 (already optimal)
3. **Profile the consumer** — is there a slow DB query, serial loop that could be parallelized?
4. **Consider Lambda** if workload is spiky — auto-scales instantly
5. **Long-term** — if it's a permanent bottleneck, the processing logic needs optimization or the queue strategy needs re-evaluation

---

**Scenario: Same order was charged twice. How do you investigate?**

1. Check `ApproximateReceiveCount` in the message attributes — was it received more than once?
2. Check application logs — two workers processed the same MessageId?
3. Check if idempotency logic is missing or broken
4. Check visibility timeout — was it set shorter than processing time?
5. Check DLQ — first attempt may have crashed after payment but before delete

Root fix: Add database-level idempotency (unique constraint on orderId in processed_orders table).

---

**Scenario: You need to process 10,000 orders/minute. How do you architect this?**

```
API (multiple instances)
  ↓ batch send to SQS (SendMessageBatch — up to 10 at once)
SQS Standard Queue
  ↓
Lambda with SQS trigger (event source mapping)
  - concurrency scales automatically
  - Lambda processes batches of up to 10 messages
  - failed messages → DLQ
  ↓
RDS/DynamoDB for order state
```

At 10k/min ≈ 167/sec — Standard queue handles this trivially. With Lambda, concurrency auto-scales. The bottleneck will be the downstream database, not SQS.
