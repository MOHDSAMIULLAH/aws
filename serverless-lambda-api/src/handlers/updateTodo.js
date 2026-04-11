const { getItem, updateItem } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = 'user-123';
    const todoId = event.pathParameters?.id;
    const body = JSON.parse(event.body || '{}');

    if (!todoId) {
      return error(400, 'Todo ID required');
    }

    console.log(`Updating todo: ${todoId}`);
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
