# Interview Q&A + Advanced Topics

## Common Interview Questions

### 1. **What is cold start and how do you minimize it?**

**Answer:**
Cold start is the delay when Lambda creates a new container for the first invocation or after idle time.

**Why it happens:**
```
Timeline:
- First request: AWS creates container (~1-2s)
  - Download code
  - Start runtime
  - Initialize application
  - Run handler code
  - Return response

- Subsequent requests: Reuse container (~10-50ms)
  - Just run handler code
```

**Impact by language:**
```
Node.js:     ~400-500ms cold start
Python:      ~400-600ms cold start
Java:        ~3-5 seconds (slowest)
Go:          ~100-200ms (fastest)
.NET:        ~1-2 seconds
```

**Minimization strategies:**

1. **Provisioned Concurrency** (direct approach)
   ```
   Keep N containers always warm
   Cost: ~$0.015 per hour per unit
   Good for critical APIs where cold start unacceptable
   ```

2. **Lightweight code**
   ```javascript
   // ❌ BAD: Slow imports
   const AWS = require('aws-sdk');         // 200ms
   const axios = require('axios');         // 50ms
   const lodash = require('lodash');      // 100ms

   // ✅ GOOD: Import only what you need
   const DynamoDB = require('aws-sdk/clients/dynamodb');
   const httpsGet = async (url) => { ... };  // Custom
   const pick = (obj, keys) => { ... };      // Custom
   ```

3. **Optimize dependencies**
   ```
   Use bundler:   webpack, esbuild, tsc
   Remove unused: npm prune --production
   Use Lambda Layers: Share common libraries
   ```

4. **Use environment variables**
   ```javascript
   // ✅ GOOD: Global scope (initialized once)
   const dynamodb = new AWS.DynamoDB.DocumentClient();

   exports.handler = async (event) => {
     // dynamodb reused from previous invocation
     return await dynamodb.query(...).promise();
   };
   ```

5. **Choose lightweight runtime**
   ```
   ✅ Go:          100ms
   ✅ Node.js:     400ms
   ⚠️  Python:     500ms
   ❌ Java:        2000ms+
   ```

---

### 2. **Explain Lambda concurrency limits**

**Answer:**
Concurrency = number of Lambda functions executing simultaneously.

**Default limit: 1,000 per account per region**

**Types:**

```
1. Unreserved Concurrency
   ├─ Default: 1,000
   ├─ Shared across all functions
   ├─ If one function consumes 800, others get 200
   └─ Risk: One function starves others

2. Reserved Concurrency
   ├─ Allocate X concurrent executions to one function
   ├─ Guarantees availability, throttles excess
   ├─ Cost: Free (handled automatically)
   └─ Use case: Critical APIs

3. Provisioned Concurrency
   ├─ Keep X containers always warm
   ├─ Cost: $0.015/hour per unit
   ├─ Avoids cold starts
   └─ Use case: Latency-sensitive applications
```

**Example:**

```
Account limit: 1,000 concurrent

Function A (unreserved):
├─ Traffic: 500 TPS
├─ 200ms execution
├─ Concurrent: 500 × 0.2 = 100 concurrent
└─ Uses 100 of 1,000

Function B (unreserved):
├─ Traffic: 1,000 TPS
├─ 100ms execution
├─ Concurrent: 1,000 × 0.1 = 100 concurrent
└─ Uses 100 of 1,000

Available for others: 800 concurrent

Function B spikes to 3,000 TPS:
├─ Requests: 300 concurrent
├─ Available: 800
├─ Result: All handled ✅

Function B spikes to 5,000 TPS:
├─ Requests: 500 concurrent
├─ Available: 800
├─ Result: All handled ✅

Function B spikes to 10,000 TPS:
├─ Requests: 1,000 concurrent
├─ Limit reached: 1,000
├─ Excess requests: THROTTLED ❌
├─ Error: TooManyRequestsException
└─ Result: 100% failure rate for requests beyond limit!
```

**Solution: Set Reserved Concurrency**

```yaml
# SAM template
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: index.handler
      ReservedConcurrentExecutions: 500  # Reserve 500 for this function
```

**Monitoring:**

```
CloudWatch Metrics:
- Duration
- Errors
- Throttles (indicates hitting limit!)
- Concurrent Executions
- Duration
```

---

### 3. **How do you handle Lambda timeout and long-running tasks?**

**Answer:**
Lambda timeout = 15 minutes MAX. Design around this.

**Solutions:**

1. **Break into multiple invocations** (Recommended)
   ```
   ┌─────────────────────────────────┐
   │  Lambda 1 (5 min) - Process A   │
   └─────────────┬───────────────────┘
                 │
           Queue to SQS
                 │
   ┌─────────────▼───────────────────┐
   │  Lambda 2 (5 min) - Process B   │
   └─────────────┬───────────────────┘
                 │
           Queue to SQS
                 │
   ┌─────────────▼───────────────────┐
   │  Lambda 3 (5 min) - Process C   │
   └─────────────────────────────────┘

   Total: 15 minutes work in 3 functions
   ```

2. **Async processing with Step Functions**
   ```
   Lambda (1s) → Queue job → Step Function orchestrates
                 ↓
            Lambda Workers process in parallel
                 ↓
            Store results in DynamoDB
                 ↓
            Client polls or uses SNS notification
   ```

3. **Use EC2 for long tasks**
   ```
   Lambda (triggers job)
      ↓
   SQS (queue)
      ↓
   EC2 (processes, no time limit)
   ```

---

### 4. **Explain Lambda memory and CPU scaling**

**Answer:**
Higher memory = Higher CPU allocation (linear relationship).

```
Memory (MB) | CPU | Cost per GB-sec | Use case
128         | 0.08 vCPU  | $0.0000166667 | Text processing
256         | 0.16 vCPU  | $0.0000166667 | Small APIs
512         | 0.25 vCPU  | $0.0000166667 | Typical APIs
1024        | 0.5 vCPU   | $0.0000166667 | Medium workload
2048        | 1 vCPU     | $0.0000166667 | Heavy computation
3008        | 1.5 vCPU   | $0.0000166667 | Very heavy work
```

**Cost-benefit:** Doubling memory doubles cost but halves execution time (often net positive).

**Example:**

```
Task: Process 1MB image

512MB option:
  ├─ Execution time: 2 seconds
  ├─ Cost: 0.5GB × 2s = 1 GB-second
  └─ Invocation cost: $0.0000166667

1024MB option:
  ├─ Execution time: 1 second (2x faster CPU)
  ├─ Cost: 1GB × 1s = 1 GB-second
  └─ Invocation cost: $0.0000166667

Same cost, but:
- 1024MB: 2x faster, better user experience
- 512MB: Slower, more time to complete
```

**Optimization approach:**

1. Start with 256MB (cheap)
2. Monitor execution time in CloudWatch
3. Calculate if upgrading saves money:
   ```
   Current: 256MB × 5s = 1.28 GB-seconds per invocation
   Proposed: 1024MB × 1s = 1.024 GB-seconds per invocation
   Savings: (1.28 - 1.024) = 0.256 GB-seconds saved!
   Plus: Faster response = better UX
   Action: Upgrade!
   ```

---

### 5. **Design a resilient API using Lambda + API Gateway**

**Answer:**

```
┌──────────────────────────────┐
│      API Gateway             │
├──────────────────────────────┤
│ - Rate limiting: 1000 req/s  │
│ - Caching: 1 hour            │
│ - API Key auth               │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│   Lambda (Sync Handler)      │
├──────────────────────────────┤
│ - Timeout: 30s               │
│ - Memory: 512MB              │
│ - Reserved concurrency: 100  │
│ - Idempotency key handling   │
└──────────────┬───────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────┐         ┌─────▼────┐
│DynamoDB│         │    EC2   │
│ Fast   │         │ Heavy    │
│Reads   │         │ Tasks    │
└────────┘         └──────────┘

Resilience Features:
├─ Circuit breaker pattern (Lambda)
├─ Retry logic with exponential backoff
├─ Dead-letter queue for failures
├─ CloudWatch alarms for anomalies
├─ Auto-scaling based on queue depth
└─ Multi-AZ deployment (API Gateway default)
```

---

### 6. **What are Lambda Layers and how are they used?**

**Answer:**
Lambda Layers = Shared libraries/dependencies for multiple functions.

**Use cases:**
```
✅ Shared utilities (logging, auth)
✅ Common libraries (AWS SDK, moment.js)
✅ Database drivers
✅ Custom runtime
```

**Structure:**

```
layer-zip/
├─ nodejs/
│  └─ node_modules/
│     ├─ aws-sdk/
│     ├─ moment/
│     └─ lodash/
└─ bin/         (for custom runtimes)
```

**Example:**

```yaml
# In template.yaml
UtilsLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: shared-utils
    ContentUri: layers/utils/
    CompatibleRuntimes:
      - nodejs18.x

MyFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref UtilsLayer
      - arn:aws:lambda:region:account:layer:common:1
```

**Benefits:**
```
├─ Reduce deployment package size
├─ Faster cold starts (compiled once)
├─ Easy updates (one layer, multiple functions)
└─ Cost savings (shared compute)
```

---

## Advanced Topics

### 1. **Lambda@Edge**

```
Use case: Modify requests/responses at CloudFront edge locations

Example: Add security headers
  Client → CloudFront Edge → Lambda@Edge (add headers)
           ↓
        Origin (S3/EC2)

Latency: ~50-100ms closer to user
Limitations:
├─ Max 30 seconds timeout (vs 15 min)
├─ Max 128 MB memory (vs 10GB)
├─ Specific runtimes (Node.js, Python only)
└─ ~$0.60 per 1M invocations (vs $0.20)
```

### 2. **SnapStart for Java**

```
Problem: Java Lambda has ~3-5s cold start (JVM startup)
Solution: SnapStart creates snapshots of initialized state

Enablement:
Resources:
  JavaFunction:
    Type: AWS::Serverless::Function
    Properties:
      SnapStartConfiguration:
        SnapStartApplied: true

Result: Cold start reduced to ~150ms (90% improvement!)
Cost: +$0.015 per month per snapshot version
```

### 3. **Lambda with VPC**

```
Use case: Access private databases, resources

Configuration:
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      VpcConfig:
        SecurityGroupIds:
          - sg-12345
        SubnetIds:
          - subnet-a
          - subnet-b

Tradeoff:
├─ Pros: Access private RDS, ElastiCache
├─ Cons: ENI attachment takes 5-10 seconds (cold start penalty!)
└─ Solution: Use RDS Proxy or NAT endpoints for Internet access
```

### 4. **Lambda with X-Ray**

```
Distributed tracing to debug performance issues

Enable:
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      TracingConfig:
        Mode: Active

Then view:
├─ Service map (how functions connect)
├─ Latency breakdown (where time spent)
├─ Errors and exceptions
└─ Performance bottlenecks
```

### 5. **EventBridge for Complex Workflows**

```
Instead of: Lambda calling other services directly

Use: EventBridge to decouple

Architecture:
┌───────────────┐
│  Lambda 1     │ Emit event: "user.created"
├───────────────┤
│ EventBridge   │ Route based on rules
├───────────────┤
│ Lambda 2      │ Handle "user.created" → Send email
│ Lambda 3      │ Handle "user.created" → Update analytics
│ SQS           │ Handle "user.created" → Queue notification
└───────────────┘

Benefits:
├─ Loose coupling
├─ Easy to add handlers
├─ Dead-letter queue support
└─ Retry logic built-in
```

---

## Design Patterns

### 1. **Fan-Out Pattern**

```
One request triggers multiple parallel Lambdas

Lambda A (orchestrator)
    ├─ → Lambda B (email)
    ├─ → Lambda C (analytics)
    ├─ → Lambda D (cache update)
    └─ → Lambda E (notification)

Implementation: SNS or Lambda invoke
Cost: 5 invocations per request
```

### 2. **Retry Pattern**

```javascript
const AWS = require('aws-sdk');

async function callWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;

      // Exponential backoff
      const delay = Math.pow(2, i) * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
exports.handler = async (event) => {
  return await callWithRetry(() =>
    dynamodb.query({...}).promise()
  );
};
```

### 3. **Circuit Breaker Pattern**

```javascript
let failureCount = 0;
let lastFailureTime = null;
const FAILURE_THRESHOLD = 5;
const RECOVERY_TIMEOUT = 60000; // 1 minute

async function callWithCircuitBreaker(fn) {
  // Check if circuit is open
  if (failureCount >= FAILURE_THRESHOLD) {
    if (Date.now() - lastFailureTime < RECOVERY_TIMEOUT) {
      throw new Error('Circuit breaker is open');
    }
    // Try to recover
    failureCount = 0;
  }

  try {
    const result = await fn();
    failureCount = 0; // Reset on success
    return result;
  } catch (err) {
    failureCount++;
    lastFailureTime = Date.now();
    throw err;
  }
}
```

---

## Common Mistakes to Avoid

```
❌ Mistake 1: Cold start anxiety
✅ Fix: Use Provisioned Concurrency only if needed

❌ Mistake 2: Synchronous processing of heavy tasks
✅ Fix: Use SQS + async Lambda workers

❌ Mistake 3: Not setting memory limits
✅ Fix: Profile and allocate appropriate memory

❌ Mistake 4: Logging sensitive data
✅ Fix: Encrypt logs, use CloudWatch Logs encryption

❌ Mistake 5: No idempotency
✅ Fix: Store idempotency tokens in DynamoDB

❌ Mistake 6: Hard timeout limits
✅ Fix: Use Step Functions for long processes

❌ Mistake 7: Shared state between invocations
✅ Fix: Assume container reuse but don't rely on it

❌ Mistake 8: No monitoring/alarms
✅ Fix: Set CloudWatch alarms for Errors, Throttles, Duration
```

