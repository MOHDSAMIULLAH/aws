# SQS Concepts — Simple + Practical

## What is SQS?

Amazon Simple Queue Service (SQS) is a **managed message queue** — a buffer that sits between two services so they don't need to talk to each other directly.

Think of it like a **restaurant order ticket rail**:
- Waiter (producer) puts a ticket on the rail
- Kitchen (consumer) picks it up when ready
- Neither blocks the other

---

## Core Terms

| Term | What it means | Restaurant analogy |
|------|--------------|-------------------|
| **Queue** | The buffer that holds messages | The ticket rail |
| **Message** | The data unit sent/received | The order ticket |
| **Producer** | The service that sends messages | The waiter |
| **Consumer** | The service that processes messages | The kitchen |
| **Visibility Timeout** | Time a message is hidden while being processed | Kitchen "claimed" the ticket |
| **DLQ** | Dead-Letter Queue — where failed messages go | Order that failed 3 times → manager's desk |

---

## Standard vs FIFO Queue

| Feature | Standard | FIFO |
|---------|----------|------|
| **Order** | Best-effort (not guaranteed) | Strict order guaranteed |
| **Throughput** | Unlimited | 3,000 msg/sec with batching, 300 without |
| **Duplicates** | At-least-once (may get duplicates) | Exactly-once processing |
| **Use case** | High-volume, order doesn't matter | Payments, inventory, order status |
| **Cost** | Cheaper | Slightly more expensive |
| **Name suffix** | None | Must end in `.fifo` |

**Rule of thumb:**
- Processing 10,000 product images? → Standard
- Processing bank transactions? → FIFO

---

## Why SQS in Backend Systems?

### Problem without SQS (tight coupling)

```
User → POST /order → API → directly calls inventory service
                          → directly calls payment service
                          → directly calls email service
```

If **any** of these downstream services is slow or down:
- The user's request **hangs**
- You get **cascading failures**
- You can't scale independently

### Solution with SQS (loose coupling)

```
User → POST /order → API → SQS Queue
                              ↓
                    Worker polls → process inventory
                                 → charge payment
                                 → send email
```

Benefits:
1. **Decoupling** — API doesn't care if the worker is slow
2. **Reliability** — message persists if worker crashes (up to 14 days)
3. **Scalability** — run 10 workers or 1, queue handles the buffer
4. **Backpressure** — queue absorbs traffic spikes naturally
5. **Retry** — failed messages stay, get retried automatically

---

## SQS Message Lifecycle

```
Producer sends message
        ↓
Message enters queue (visible)
        ↓
Consumer receives message
        ↓
Message becomes INVISIBLE (visibility timeout starts)
        ↓
        ├── Consumer deletes message → DONE ✅
        └── Visibility timeout expires → message becomes visible again
                                              ↓
                                        Consumer retries
                                              ↓
                                        After N failures → DLQ 📥
```

---

## Key SQS Settings (know these for interviews)

| Setting | What it does | Typical value |
|---------|-------------|--------------|
| **Visibility Timeout** | How long message is hidden during processing | 30s–5min (must be > processing time) |
| **Message Retention** | How long SQS keeps unprocessed messages | 1 min–14 days (default: 4 days) |
| **Receive Message Wait Time** | Long polling duration | 20s (recommended) |
| **Max Receive Count** | Failed attempts before DLQ | 3–5 |
| **Delivery Delay** | Delay before message is visible | 0–15 min |
| **Max Message Size** | Max payload | 256 KB |

---

## Long Polling vs Short Polling

| | Short Polling | Long Polling |
|---|---|---|
| Behavior | Returns immediately (even if empty) | Waits up to 20s for a message |
| Cost | More API calls = more cost | Fewer calls = less cost |
| Recommendation | Avoid | Use this (set WaitTimeSeconds=20) |
