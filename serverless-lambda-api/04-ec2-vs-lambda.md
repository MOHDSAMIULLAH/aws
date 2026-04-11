# Comparison: EC2 vs Lambda

## Quick Comparison

| Aspect | Lambda | EC2 |
|--------|--------|-----|
| **Scaling** | Automatic, instant | Manual or ASG (slow) |
| **Cost** | Pay per invocation | Fixed monthly |
| **Startup** | Seconds (cold start) | Minutes |
| **Max Duration** | 15 minutes | Unlimited |
| **Concurrency** | Isolated per request | Shared resources |
| **Management** | None | OS, patches, security |
| **Ideal For** | Event-driven, APIs | Long-running tasks |
| **Learning Curve** | Minimal | Moderate to high |

---

## Detailed Cost Comparison

### Lambda Pricing

```
Request Pricing: $0.20 per 1,000,000 requests
Duration Pricing: $0.0000166667 per GB-second

Calculation:
- GB-second: (Memory in GB) × (Execution time in seconds)
- Example: 512 MB (0.5 GB) × 200 ms (0.2 s) = 0.1 GB-seconds
```

### Cost Scenarios

#### **Scenario 1: Low Traffic API**
```
Traffic: 10M requests/month
Avg execution time: 200ms
Memory: 512MB (0.5 GB)

Lambda Calculation:
  Requests: 10M × ($0.20/1M) = $2.00
  Duration: 10M × 0.2s × 0.5GB × $0.0000166667 = $16.67
  Free tier covers first 1M requests + 400,000 GB-seconds
  Actual cost: ~$18.67/month

EC2 (t3.medium):
  On-demand: $0.0416/hour × 730 hours = $30.37/month
  Already paying $30+ even if unused!

WINNER: Lambda saves ~$11/month + scales to 0
```

#### **Scenario 2: Medium Traffic with Spikes**
```
Traffic: 100M requests/month
Avg execution time: 300ms
Memory: 1GB

Lambda:
  Requests: 100M × ($0.20/1M) = $20.00
  Duration: 100M × 0.3s × 1GB × $0.0000166667 = $50.00
  Total: ~$70/month
  Scales to >10,000 concurrent requests instantly

EC2 with ASG (3 t3.large instances):
  Base: $0.1046/hour × 730 × 3 = $229.08/month
  During peak: Add 2-3 more instances = +$153/month
  Average over month: ~$300/month

WINNER: Lambda saves ~$230/month, faster scaling
```

#### **Scenario 3: Sustained High Load**
```
Traffic: 1B requests/month (consistent)
Avg execution time: 100ms
Memory: 2GB

Lambda:
  Requests: 1B × ($0.20/1M) = $200.00
  Duration: 1B × 0.1s × 2GB × $0.0000166667 = $333.33
  Total: ~$533.33/month

EC2 ASG (10 c5.xlarge instances):
  Base: $0.170/hour × 730 × 10 = $1,241/month
  Load balancer: ~$16.20/month
  Data transfer: ~$100/month
  Total: ~$1,357/month

WINNER: Still Lambda ($824/month cheaper!)
But: EC2 has predictable cost, Lambda may spike with traffic surge
```

#### **Scenario 4: Batch Processing (Long-running jobs)**
```
Scenario: Process 50GB of data daily, takes 1 hour

Lambda Limitation: MAX 15 minutes timeout!
[NOT VIABLE for this use case]

EC2 Solution:
  1 c5.xlarge instance running 1 hour/day
  $0.17/hour × 1 × 30 = $5.10/month
  Add queue/orchestration cost

WINNER: EC2 only option (Lambda can't do long tasks)
```

---

## Scaling Comparison

### Lambda Auto-scaling

```
Concurrent requests: How many Lambda functions run simultaneously
Default concurrency limit: 1,000 (per account)

Timeline:
0s:     100 requests arrive → 100 containers created
100ms:  Requests complete → Containers reused or destroyed
200ms:  1,000 requests arrive → Auto-scales to 1,000 concurrent
        (AWS creates 1,000 new containers instantly!)
300ms:  All complete → Idle containers destroyed after 15 min
Cost:   Only pay for execution time (100-200ms), nothing for idle

No provisioning needed!
```

### EC2 Auto-scaling Group

```
Timeline:
0m:     100 requests arrive → Handled by existing instances
5m:     1,000 requests arrive → ASG detects high CPU
10m:    Launches new instances (takes 3-5 minutes)
15m:    New instances ready → Requests now handled
Cost:   Pay for ALL instances even while scaling up

Manual intervention often needed!
```

### Scaling Chart

```
Requests/sec
     |              Lambda (scaling)
1000|            /
     |          /
     |        /\
 500 |      /    \____
     |    /
 250 |  / EC2 (scaling lag)
     |/________\  ASG adds instances
   0 |___________________
     0    5    10   15   20  minutes

Lambda: Instant scale-up, scale-down to zero
EC2: Delayed scale-up, pays even at scale-down
```

---

## Cost-Benefit Analysis

### Choose **Lambda** if:

✅ **Event-driven workload**
- API calls
- File uploads (S3 trigger)
- Messages (SQS/SNS)
- Database streams (DynamoDB)

✅ **Unpredictable traffic**
- Scales from 0 to 10,000 automatically
- No over-provisioning wastage

✅ **Short-lived operations** (< 15 min)
- API requests (~100-500ms)
- Image processing (~1-5s)
- Data transformations (~30s)

✅ **Want minimal ops**
- No patching, no security updates
- AWS manages everything

✅ **Cost-conscious**
- Pay only for what you use
- Free tier: 1M requests/month included

**Cost example: Startup API**
```
1,000 users × 5 requests/day × 30 days = 150,000 requests/month
150,000 × 200ms on 512MB
Lambda cost: ~$0.25/month 🔥
Saves ~$30/month vs t2.micro EC2!
```

### Choose **EC2** if:

✅ **Long-running tasks** (> 15 minutes)
- Batch processing
- Machine learning training
- Video encoding

✅ **Consistent high load**
- 1000+ concurrent requests always
- Cost delta is minimal

✅ **Need specific compliance**
- Must control IP addresses
- Must run specific OS kernel version

✅ **Complex dependencies**
- Need system libraries
- Multi-process applications
- Specific runtime versions

✅ **Require persistent state**
- In-process caching preferred
- Session management
- Local disk storage

**Cost example: Data pipeline**
```
Process 100GB data daily, takes 2 hours
Lambda: Can't run (15 min limit)
EC2: 1 c5.xlarge 2 hours/day = $5/month ✅
You need EC2!
```

---

## Real-World Scenarios

### Scenario: REST API

```
Lambda:
├─ Cold start: 1-2s (first call only)
├─ Warm call: 10-50ms
├─ Auto-scales to 1,000+ concurrent
├─ Cost: ~$50-200/month (typical)
└─ Ops: 0 (AWS manages)

EC2 ASG:
├─ Response: 5-10ms (no cold start)
├─ Scales in 5-10 minutes
├─ Cost: $200+/month minimum
└─ Ops: Patches, updates, monitoring
```

**Recommendation: Lambda** (Better for APIs)

### Scenario: Scheduled Reports

```
Lambda:
├─ Triggered by CloudWatch Events
├─ Duration: 5 minutes
├─ Memory: 512MB
├─ Monthly cost: ~$1
└─ Best fit: ✅

EC2:
├─ Always running cron job
├─ Wastes resources 99% of time
├─ Monthly cost: $30+
└─ Best fit: ✗
```

**Recommendation: Lambda** (Obvious choice)

### Scenario: Real-time Video Encoding

```
Lambda:
├─ Timeout: 15 minutes MAX
├─ Video processing: Often > 15 min
└─ Best fit: ✗

EC2:
├─ No time limit
├─ Can encode gigabyte-sized videos
├─ Cost predictable for batch processing
└─ Best fit: ✅
```

**Recommendation: EC2** (Only option)

---

## Hybrid Approach (Best of Both)

### Architecture

```
┌─────────────────────────────────────┐
│         API Gateway                  │
├─────────────────────────────────────┤
│  Lambda (< 15 min)                  │ Fast, scalable
├─────────────────────────────────────┤
│     SQS (Task Queue)                 │ Decouple
├─────────────────────────────────────┤
│   EC2 Batch Processor (> 15 min)   │ Heavy lifting
└─────────────────────────────────────┘

Flow:
1. Client calls API → Lambda (quick response)
2. Lambda queues long job → SQS
3. EC2 worker polls queue → Processes task
4. Update DynamoDB with result
5. Lambda retrieves cached result
```

**Cost Benefits:**
- API response: Fast + cheap (Lambda)
- Heavy work: Scalable + cost-effective (EC2)
- Total cost: Lower than either alone

---

## TCO (Total Cost of Ownership) Calculation

### 3-Year Cost Comparison

#### **Lambda + API Gateway**

```
Year 1-3 (same):
  Lambda: $200/month × 12 = $2,400/year
  API Gateway: $3.50/month × 12 = $42/year
  Developer time: ~2 hours/month = ~$300/year
  Total per year: $2,742
  3-year total: $8,226
  Ops overhead: None
```

#### **EC2 + Manual Management**

```
Year 1:
  EC2: $300/month × 12 = $3,600
  Storage: $50/month × 12 = $600
  Developer: Patching, security (5 hrs/mo) = $2,400
  Monitoring: CloudWatch costs = $200
  Year 1 total: $6,800

Year 2-3:
  Hardware refresh: +$1,000/year
  Major security incident: ~$5,000
  Year 2 total: $6,800 + $1,000 + $2,500 = $10,300
  Year 3 total: $6,800 + $1,000 + $2,500 = $10,300

3-year total: $27,400
Ops overhead: 60+ hours/year
```

**Winner: Lambda** ($8,226 vs $27,400 = 70% cheaper!)
Plus: Zero operational risk, instant scaling, automatic patching

