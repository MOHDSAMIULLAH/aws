const { getItem } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = 'user-123';
    const todoId = event.pathParameters?.id;

    if (!todoId) {
      return error(400, 'Todo ID required');
    }

    console.log(`Getting todo: ${todoId}`);
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
