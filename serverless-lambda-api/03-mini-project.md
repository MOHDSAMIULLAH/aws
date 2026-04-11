# Mini Project: Serverless Todo REST API

Build a complete REST API for managing todos with:
- Lambda backend
- API Gateway
- DynamoDB storage
- Authentication
- Error handling

## Architecture

```
Client (curl/Postman)
  ↓
API Gateway (REST API)
  ↓
Lambda Functions:
  - GET /todos → ListTodos
  - POST /todos → CreateTodo
  - GET /todos/{id} → GetTodo
  - PUT /todos/{id} → UpdateTodo
  - DELETE /todos/{id} → DeleteTodo
  ↓
DynamoDB (todos table)
```

## Directory Structure

```
todo-api/
├── template.yaml           # SAM template
├── src/
│   ├── handlers/
│   │   ├── getTodos.js
│   │   ├── getTodo.js
│   │   ├── createTodo.js
│   │   ├── updateTodo.js
│   │   └── deleteTodo.js
│   └── utils/
│       ├── dynamodb.js
│       └── response.js
├── events/                 # Test events
│   ├── create.json
│   ├── list.json
│   └── get.json
└── README.md
```

## Implementation Files

### 1. SAM Template (template.yaml)

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  Stage:
    Type: String
    Default: dev

Globals:
  Function:
    Runtime: nodejs18.x
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables:
        TABLE_NAME: !Ref TodosTable
        STAGE: !Ref Stage

Resources:
  # DynamoDB Table
  TodosTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: todos
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
        - AttributeName: todoId
          AttributeType: S
      KeySchema:
        - AttributeName: userId
          KeyType: HASH        # Partition key
        - AttributeName: todoId
          KeyType: RANGE       # Sort key
      BillingMode: PAY_PER_REQUEST  # Auto-scaling

  # Lambda Layers (shared utilities)
  UtilsLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: todo-utils
      ContentUri: src/utils/
      CompatibleRuntimes:
        - nodejs18.x

  # List Todos Function
  ListTodosFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/handlers/getTodos.js
      Handler: getTodos.handler
      Layers:
        - !Ref UtilsLayer
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref TodosTable
      Events:
        ListApi:
          Type: Api
          Properties:
            RestApiId: !Ref TodoApi
            Path: /todos
            Method: GET

  # Get Todo Function
  GetTodoFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/handlers/getTodo.js
      Handler: getTodo.handler
      Layers:
        - !Ref UtilsLayer
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref TodosTable
      Events:
        GetApi:
          Type: Api
          Properties:
            RestApiId: !Ref TodoApi
            Path: /todos/{id}
            Method: GET

  # Create Todo Function
  CreateTodoFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/handlers/createTodo.js
      Handler: createTodo.handler
      Layers:
        - !Ref UtilsLayer
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref TodosTable
      Events:
        CreateApi:
          Type: Api
          Properties:
            RestApiId: !Ref TodoApi
            Path: /todos
            Method: POST

  # Update Todo Function
  UpdateTodoFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/handlers/updateTodo.js
      Handler: updateTodo.handler
      Layers:
        - !Ref UtilsLayer
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref TodosTable
      Events:
        UpdateApi:
          Type: Api
          Properties:
            RestApiId: !Ref TodoApi
            Path: /todos/{id}
            Method: PUT

  # Delete Todo Function
  DeleteTodoFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/handlers/deleteTodo.js
      Handler: deleteTodo.handler
      Layers:
        - !Ref UtilsLayer
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref TodosTable
      Events:
        DeleteApi:
          Type: Api
          Properties:
            RestApiId: !Ref TodoApi
            Path: /todos/{id}
            Method: DELETE

  # API Gateway
  TodoApi:
    Type: AWS::Serverless::Api
    Properties:
      Name: todo-api
      StageName: !Ref Stage
      TracingEnabled: true

Outputs:
  ApiEndpoint:
    Description: API endpoint URL
    Value: !Sub 'https://${TodoApi}.execute-api.${AWS::Region}.amazonaws.com/${Stage}'
    Export:
      Name: TodoApiEndpoint

  TableName:
    Description: DynamoDB table name
    Value: !Ref TodosTable
    Export:
      Name: TodoTableName
```

### 2. Shared Utilities (src/utils/dynamodb.js)

```javascript
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME;

// Create item
exports.createItem = async (userId, todoId, data) => {
  const params = {
    TableName: TABLE_NAME,
    Item: {
      userId,
      todoId,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
  return dynamodb.put(params).promise();
};

// Get item
exports.getItem = async (userId, todoId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { userId, todoId }
  };
  const result = await dynamodb.get(params).promise();
  return result.Item;
};

// Query by partition key (all todos for user)
exports.queryByUser = async (userId) => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  };
  const result = await dynamodb.query(params).promise();
  return result.Items;
};

// Update item
exports.updateItem = async (userId, todoId, data) => {
  const updateExpressions = [];
  const expressionValues = {};

  Object.entries(data).forEach(([key, value]) => {
    updateExpressions.push(`${key} = :${key}`);
    expressionValues[`:${key}`] = value;
  });

  expressionValues[':now'] = new Date().toISOString();
  updateExpressions.push('updatedAt = :now');

  const params = {
    TableName: TABLE_NAME,
    Key: { userId, todoId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamodb.update(params).promise();
  return result.Attributes;
};

// Delete item
exports.deleteItem = async (userId, todoId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { userId, todoId }
  };
  return dynamodb.delete(params).promise();
};
```

### 3. Response Helper (src/utils/response.js)

```javascript
exports.success = (statusCode, data) => {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
};

exports.error = (statusCode, message) => {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
};
```

### 4. Handler: List Todos (src/handlers/getTodos.js)

```javascript
const { queryByUser } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    // In real app, get userId from auth context/claims
    const userId = event.requestContext?.authorizer?.claims?.sub || 'user-123';

    const todos = await queryByUser(userId);

    return success(200, {
      todos,
      count: todos.length
    });
  } catch (err) {
    console.error('Error listing todos:', err);
    return error(500, 'Failed to list todos');
  }
};
```

### 5. Handler: Create Todo (src/handlers/createTodo.js)

```javascript
const { createItem } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || 'user-123';
    const body = JSON.parse(event.body || '{}');

    // Validate
    if (!body.title) {
      return error(400, 'Title is required');
    }

    const todoId = `todo-${Date.now()}`;

    await createItem(userId, todoId, {
      title: body.title,
      description: body.description || '',
      completed: false
    });

    return success(201, {
      id: todoId,
      title: body.title,
      completed: false
    });
  } catch (err) {
    console.error('Error creating todo:', err);
    return error(500, 'Failed to create todo');
  }
};
```

### 6. Handler: Get Todo (src/handlers/getTodo.js)

```javascript
const { getItem } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || 'user-123';
    const todoId = event.pathParameters?.id;

    if (!todoId) {
      return error(400, 'Todo ID required');
    }

    const todo = await getItem(userId, todoId);

    if (!todo) {
      return error(404, 'Todo not found');
    }

    return success(200, todo);
  } catch (err) {
    console.error('Error getting todo:', err);
    return error(500, 'Failed to get todo');
  }
};
```

### 7. Handler: Update Todo (src/handlers/updateTodo.js)

```javascript
const { getItem, updateItem } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || 'user-123';
    const todoId = event.pathParameters?.id;
    const body = JSON.parse(event.body || '{}');

    if (!todoId) {
      return error(400, 'Todo ID required');
    }

    // Verify exists
    const existing = await getItem(userId, todoId);
    if (!existing) {
      return error(404, 'Todo not found');
    }

    const updated = await updateItem(userId, todoId, body);
    return success(200, updated);
  } catch (err) {
    console.error('Error updating todo:', err);
    return error(500, 'Failed to update todo');
  }
};
```

### 8. Handler: Delete Todo (src/handlers/deleteTodo.js)

```javascript
const { getItem, deleteItem } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || 'user-123';
    const todoId = event.pathParameters?.id;

    if (!todoId) {
      return error(400, 'Todo ID required');
    }

    // Verify exists
    const existing = await getItem(userId, todoId);
    if (!existing) {
      return error(404, 'Todo not found');
    }

    await deleteItem(userId, todoId);
    return success(204, null);
  } catch (err) {
    console.error('Error deleting todo:', err);
    return error(500, 'Failed to delete todo');
  }
};
```

## Deployment

```bash
# Build
sam build

# Deploy (first time)
sam deploy --guided

# After first deploy
sam deploy

# View logs
sam logs -n ListTodosFunction --tail

# Local testing
sam local start-api

# Test locally
curl http://localhost:3000/todos
```

## API Usage Examples

```bash
# List all todos
curl https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/todos

# Create todo
curl -X POST https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/todos \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Learn Lambda",
    "description": "Master serverless computing"
  }'

# Get specific todo
curl https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/todos/todo-1712873400123

# Update todo
curl -X PUT https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/todos/todo-1712873400123 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'

# Delete todo
curl -X DELETE https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/todos/todo-1712873400123
```

