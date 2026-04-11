# AWS Lambda & API Gateway - Core Concepts

## AWS Lambda

### What is Lambda?

**Serverless compute service** - Write code, Lambda handles infrastructure:
- No servers to provision or manage
- Auto-scaling based on requests
- Pay only for execution time (100ms increments)
- Triggered by events (API calls, S3, DynamoDB, SQS, etc.)

### Key Concepts

#### 1. **Function Basics**
```
- Code: Node.js, Python, Java, Go, .NET, Ruby, etc.
- Handler: Entry point for execution
- Runtime: Language environment (nodejs18.x, python3.11, etc.)
- Memory: 128 MB - 10,240 MB (CPU scales with memory)
- Timeout: 1 second - 15 minutes (default 3 min)
- Concurrency: Max parallel executions
```

#### 2. **Execution Model**
```
Cold Start: First invocation or after idle period (~1-2 seconds)
Warm Invocation: Reusing existing container (~10-50ms)
Container Lifecycle: Created → Reused → Destroyed
```

#### 3. **Pricing Model**
```
Requests: $0.20 per 1 million requests
Duration: $0.0000166667 per GB-second
Example: 1M requests, 512MB memory, 200ms avg
  → Requests: $0.20
  → Duration: 1M × 0.2s ÷ 3,600 × (512/1024) × $0.0000166667 ≈ $0.46
  → Total: ~$0.66/month (very cheap!)
```

### Anatomy of a Lambda Function

```javascript
// Node.js Handler
exports.handler = async (event, context) => {
  // event: input data (API request, S3 event, etc.)
  // context: metadata (request ID, memory limit, etc.)

  console.log('Request ID:', context.awsRequestId);
  console.log('Memory:', context.memoryLimitInMB);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello from Lambda!' })
  };
};
```

**Event Object**: Contains data about what triggered the function
**Context Object**: Runtime information
**Return Value**: Response back to the caller

### Lambda Triggers (Event Sources)

```
API Gateway → REST API calls
S3 → File uploads/deletes
DynamoDB Streams → Database changes
SQS → Queue messages
SNS → Topic notifications
CloudWatch Events → Scheduled tasks (cron)
ALB → Load balancer requests
CloudFront → CDN events
Cognito → User authentication
```

---

## API Gateway

### What is API Gateway?

**Managed service to create HTTP APIs** - Acts as front door for applications:
- Create REST APIs or WebSocket APIs
- Handle request/response transformations
- Rate limiting, caching, authentication
- Direct integration with Lambda, HTTP endpoints, AWS services
- Auto-scaling

### Two Types of APIs

#### **REST API** (Traditional)
- Resource-based (e.g., `/users/{id}`)
- Full control, more features
- Slightly higher latency (~100-300ms baseline)
- Good for complex workflows

#### **HTTP API** (Newer, Simpler)
- Fast, minimal features
- Lower latency (~50-100ms baseline)
- 70% cheaper than REST API
- Good for simple microservices

### API Gateway Components

```
1. Resources: URL paths (/users, /users/{id}, etc.)
2. Methods: HTTP verbs (GET, POST, PUT, DELETE, etc.)
3. Integration: What happens when called
   - Lambda
   - HTTP endpoint
   - AWS service (DynamoDB, SQS, etc.)
4. Authorization: Who can call it
   - API Key
   - OAuth
   - Lambda Authorizer (custom auth)
5. Stages: Environments (dev, prod, etc.)
```

### Request/Response Flow

```
CLIENT REQUEST
    ↓
[API Gateway]
    ├─ Validate request (auth, rate limits)
    ├─ Transform request body
    └─ Route to Lambda
        ↓
    [Lambda Function]
        ├─ Process logic
        └─ Return response
    ↓
[API Gateway]
    ├─ Transform response
    └─ Add headers
    ↓
CLIENT RESPONSE
```

### API Gateway Request Event

```json
{
  "resource": "/users/{id}",
  "requestContext": {
    "httpMethod": "GET",
    "requestId": "abc123",
    "stage": "prod"
  },
  "pathParameters": {
    "id": "123"
  },
  "queryStringParameters": {
    "include": "profile"
  },
  "headers": {
    "Authorization": "Bearer token123"
  },
  "body": null,
  "isBase64Encoded": false
}
```

---

## Lambda + API Gateway Integration

### Basic Flow

```
1. Client calls API: GET /api/users
2. API Gateway routes to Lambda function
3. Lambda receives event with HTTP details
4. Lambda processes and returns response
5. API Gateway formats as HTTP response
6. Client receives HTTP response
```

### Response Format

```javascript
{
  statusCode: 200,
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ users: [...] })
}
```

---

## Key Advantages

| Feature | Lambda | Traditional EC2 |
|---------|--------|-----------------|
| **Scaling** | Automatic, instant | Manual or ASG |
| **Cost** | Pay per invocation | Fixed monthly |
| **Management** | None needed | OS patches, updates |
| **Startup** | Seconds (cold start) | Minutes (full VM) |
| **Concurrency** | Isolated per request | Shared resources |
| **Best For** | Event-driven, APIs | Long-running tasks |

---

## Common Patterns

### 1. **REST API with Lambda**
```
Client → API Gateway → Lambda → DynamoDB
```

### 2. **Async Processing**
```
Client → API Gateway → Lambda (queue msg) → SQS
                       Background Lambda (processes queue)
```

### 3. **S3 File Processing**
```
Upload file to S3 → Trigger Lambda → Process → Store result
```

### 4. **Scheduled Tasks**
```
CloudWatch Event (cron) → Lambda → Daily report generation
```

