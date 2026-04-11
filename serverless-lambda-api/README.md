# Serverless Todo REST API

Complete REST API built with AWS Lambda and API Gateway. Deploy in minutes!

## Quick Start

### Prerequisites
```bash
# Install AWS CLI
aws configure

# Install SAM CLI
brew install aws-sam-cli  # macOS
# See: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html
```

### Deploy
```bash
# Build
sam build

# Deploy (first time - interactive)
sam deploy --guided

# Redeploy
sam deploy
```

## Architecture

```
Client (curl/Postman)
  ↓
API Gateway (REST)
  ├─ GET /todos → ListTodos Lambda
  ├─ POST /todos → CreateTodo Lambda
  ├─ GET /todos/{id} → GetTodo Lambda
  ├─ PUT /todos/{id} → UpdateTodo Lambda
  └─ DELETE /todos/{id} → DeleteTodo Lambda
  ↓
DynamoDB (todos table)
```

## Directory Structure

```
.
├── template.yaml                 # SAM CloudFormation template
├── package.json
├── src/
│   ├── handlers/
│   │   ├── getTodos.js          # List all todos
│   │   ├── getTodo.js           # Get single todo
│   │   ├── createTodo.js        # Create todo
│   │   ├── updateTodo.js        # Update todo
│   │   └── deleteTodo.js        # Delete todo
│   └── utils/
│       ├── dynamodb.js          # DynamoDB client & operations
│       └── response.js          # Response formatting
└── README.md
```

## API Endpoints

### List Todos
```bash
GET /todos

Example:
curl https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/todos

Response:
{
  "todos": [
    {
      "userId": "user-123",
      "todoId": "todo-1712873400123",
      "title": "Learn Lambda",
      "description": "Master serverless",
      "completed": false,
      "createdAt": "2024-04-11T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Create Todo
```bash
POST /todos
Content-Type: application/json

{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread"
}

Response (201):
{
  "id": "todo-1712873400456",
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "completed": false
}
```

### Get Todo
```bash
GET /todos/todo-1712873400123

Response:
{
  "userId": "user-123",
  "todoId": "todo-1712873400123",
  "title": "Learn Lambda",
  "completed": false,
  "createdAt": "2024-04-11T10:00:00.000Z"
}
```

### Update Todo
```bash
PUT /todos/todo-1712873400123
Content-Type: application/json

{
  "completed": true,
  "description": "Updated description"
}

Response:
{
  "userId": "user-123",
  "todoId": "todo-1712873400123",
  "title": "Learn Lambda",
  "completed": true,
  "description": "Updated description",
  "updatedAt": "2024-04-11T11:00:00.000Z"
}
```

### Delete Todo
```bash
DELETE /todos/todo-1712873400123

Response (204): Empty
```

## Local Testing

### Start Local API Server
```bash
sam local start-api

# Test locally
curl http://localhost:3000/todos
```

### Invoke Function Directly
```bash
sam local invoke ListTodosFunction -e events/list.json
```

## How It Works

### Cold Start Flow
```
1. First request → 1-2 seconds delay
   ├─ AWS creates container
   ├─ Downloads code
   ├─ Initializes Node.js runtime
   ├─ Runs handler code
   └─ Returns response

2. Subsequent requests (within 15 min) → 10-50ms
   ├─ Reuses existing container
   ├─ Runs handler code immediately
   └─ Returns response
```

### Lambda Handler
```javascript
exports.handler = async (event) => {
  // event = HTTP request details
  // Return { statusCode, headers, body }
}
```

## Monitoring

### View Logs
```bash
sam logs -n ListTodosFunction --tail
```

### CloudWatch Metrics
- Duration: Execution time
- Errors: Failed invocations
- Throttles: Reached concurrency limit
- Concurrent Executions: Running functions

## Cost Estimate

```
Monthly examples:
- 10M requests, 200ms avg: ~$18.67
- 100M requests, 300ms avg: ~$200+
- 1B requests: ~$533

Components:
- Lambda: $0.20 per 1M requests + duration
- DynamoDB (Pay-per-request): $1.25 per M write, $0.25 per M read
- API Gateway: $3.50 per 1M calls
```

## Troubleshooting

### "TABLE_NAME not found"
- Ensure DynamoDB table is created
- Check template.yaml is deploying the table

### "TooManyRequestsException"
- Hit Lambda concurrency limit (default 1,000)
- Solution: Request limit increase or use Reserved Concurrency

### "Cold Start Latency"
- First invocation after idle: Normal 1-2s delay
- For critical APIs use Provisioned Concurrency ($0.015/hour)

### Function Timeout
- Default: 30 seconds
- Increase in template.yaml: `Timeout: 60`
- Max: 900 seconds (15 minutes)

## Next Steps

### 1. Add Authentication
```yaml
MyFunction:
  Type: AWS::Serverless::Function
  Properties:
    Auth:
      DefaultAuthorizer: MyCognitoAuth
```

### 2. Add CORS
```yaml
TodoApi:
  Type: AWS::Serverless::Api
  Properties:
    Cors: "'*'"
```

### 3. Add Caching
```yaml
Methods:
  - Path: /todos
    Method: GET
    CacheClusterEnabled: true
    CacheClusterSize: '0.5'
```

### 4. Use Lambda Layers
```yaml
UtilsLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    ContentUri: layers/utils/
    CompatibleRuntimes: [nodejs18.x]
```

## Key Concepts

### Lambda
- Runs code without managing servers
- Auto-scales from 0 to thousands
- Pay only for execution time
- Max 15-minute timeout
- Default 1,000 concurrent limit

### API Gateway
- Converts HTTP requests to Lambda events
- Routes based on path & method
- Handles rate limiting & caching
- Generates SDK clients
- Supports REST & WebSocket APIs

### DynamoDB
- NoSQL database (fast, scalable)
- Pay-per-request (no capacity planning)
- Strongly consistent (millisecond latency)
- Replicated across 3 AZs

## Performance Tips

1. **Optimize memory**: Higher = faster CPU
   - 256MB: Slower, cheaper
   - 1024MB: Fast, reasonable cost
   - Profile to find sweet spot

2. **Reduce bundle size**: Faster cold start
   - Minify dependencies
   - Remove unused packages
   - Use Lambda Layers

3. **Async processing**: For long tasks
   - Return quickly
   - Queue job (SQS)
   - Process asynchronously

## Clean Up

Remove all resources to avoid charges:
```bash
sam delete
```

## Resources

- [AWS Lambda Docs](https://docs.aws.amazon.com/lambda/)
- [API Gateway Docs](https://docs.aws.amazon.com/apigateway/)
- [SAM Docs](https://docs.aws.amazon.com/serverless-application-model/)
- [Pricing Calculator](https://calculator.aws/)

## License

MIT
