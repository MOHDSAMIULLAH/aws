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

// Query by user
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
