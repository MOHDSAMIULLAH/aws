# Hands-On Lab: Create Lambda + API Gateway

## Part 1: Create Lambda Function (AWS Console)

### Step 1: Create Lambda Function

1. Go to AWS Lambda → **Create function**
2. Choose **Author from scratch**
3. Configure:
   ```
   Function name: hello-world-api
   Runtime: Node.js 18.x
   Architecture: x86_64
   Execution role: Create new role with basic Lambda permissions
   ```
4. Click **Create function**

### Step 2: Write Lambda Handler

Replace the default code with:

```javascript
export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const path = event.requestContext?.resourcePath || '/';
  const method = event.requestContext?.httpMethod || 'GET';

  // Simple router
  if (path === '/' && method === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Welcome to Serverless API!' })
    };
  }

  if (path === '/users' && method === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        users: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Bob', email: 'bob@example.com' }
        ]
      })
    };
  }

  if (path === '/users' && method === 'POST') {
    const body = JSON.parse(event.body || '{}');
    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 3,
        ...body,
        created: new Date().toISOString()
      })
    };
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: 'Not Found' })
  };
};
```

### Step 3: Test Lambda

1. Click **Test** tab
2. Create test event:
   ```json
   {
     "requestContext": {
       "resourcePath": "/",
       "httpMethod": "GET"
     }
   }
   ```
3. Click **Test** → See response
4. Try different paths/methods

---

## Part 2: Create API Gateway

### Step 1: Create REST API

1. Go to API Gateway → **Create API**
2. Choose **REST API** → **Build**
3. Configure:
   ```
   API Name: serverless-api
   Description: Lambda-based REST API
   Endpoint Type: Regional
   ```
4. Click **Create API**

### Step 2: Create Resources and Methods

**Create Root GET method:**

1. Select **/** in resources
2. Click **Create Method** → **GET**
3. Configure:
   ```
   Integration type: Lambda Function
   Lambda Function: hello-world-api
   ```
4. Click **Save**
5. In **Integration Response** → ensure 200 status → Click the arrow to expand
6. Check **Use Lambda Proxy Integration** (already selected)

**Add POST method for creating users:**

1. Select **/** → **Create Method** → **POST**
2. Same integration setup (Lambda proxy)

**Create /users resource:**

1. Select **/** → **Create Resource**
2. Resource name: `users`
3. Create GET and POST methods same as above

**Create /users/{id} resource:**

1. Select **/users** → **Create Resource**
2. Resource name: `{id}`
3. Create methods for GET, PUT, DELETE

### Step 3: Deploy API

1. Click **Deploy API**
2. Create new stage: `dev`
3. Click **Deploy**
4. **Note the Invoke URL**: `https://xxx.execute-api.region.amazonaws.com/dev`

### Step 4: Test API

```bash
# Test GET root
curl https://xxx.execute-api.region.amazonaws.com/dev/

# Test GET users
curl https://xxx.execute-api.region.amazonaws.com/dev/users

# Test POST users
curl -X POST https://xxx.execute-api.region.amazonaws.com/dev/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Charlie","email":"charlie@example.com"}'
```

---

## Part 3: Infrastructure as Code (SAM)

Use **AWS SAM (Serverless Application Model)** for repeatable deployment.

### Create SAM Template

`template.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  StageName:
    Type: String
    Default: dev
    Description: API stage name

Globals:
  Function:
    Runtime: nodejs18.x
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables:
        STAGE: !Ref StageName

Resources:
  # Lambda Function
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: index.handler
      Description: HTTP API handler
      Events:
        ApiRoot:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /
            Method: GET
        ApiUsers:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /users
            Method: GET
        ApiUsersCreate:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /users
            Method: POST

  # API Gateway
  ApiGateway:
    Type: AWS::Serverless::Api
    Properties:
      Name: serverless-api
      StageName: !Ref StageName
      TracingEnabled: true

Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint
    Value: !Sub 'https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/${StageName}'

  FunctionArn:
    Description: Lambda function ARN
    Value: !GetAtt HelloWorldFunction.Arn
```

### Deploy with SAM

```bash
# Build
sam build

# Deploy (interactive)
sam deploy --guided

# Or redeploy
sam deploy
```

---

## Key SAM Features

```
- Simplifies Lambda + API Gateway configuration
- One command deployment
- Local testing with: sam local start-api
- Automatic IAM roles
- Built-in monitoring
```

---

## Environment Setup (Recommended)

### Local Development with SAM

```bash
# Install SAM CLI
# macOS: brew install aws-sam-cli
# Linux: See AWS docs

# Start local API server
sam local start-api

# Test locally
curl http://localhost:3000/

# Watch logs in real-time
sam local start-api --debug
```

