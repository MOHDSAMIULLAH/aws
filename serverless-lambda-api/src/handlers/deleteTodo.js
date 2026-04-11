const { getItem, deleteItem } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = 'user-123';
    const todoId = event.pathParameters?.id;

    if (!todoId) {
      return error(400, 'Todo ID required');
    }

    console.log(`Deleting todo: ${todoId}`);
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
