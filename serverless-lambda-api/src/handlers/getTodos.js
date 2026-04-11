const { queryByUser } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    // In real app, get userId from auth context
    const userId = 'user-123';

    console.log(`Listing todos for user: ${userId}`);
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
