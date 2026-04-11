const { createItem } = require('../utils/dynamodb');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = 'user-123';
    const body = JSON.parse(event.body || '{}');

    if (!body.title) {
      return error(400, 'Title is required');
    }

    const todoId = `todo-${Date.now()}`;

    console.log(`Creating todo: ${todoId}`);
    await createItem(userId, todoId, {
      title: body.title,
      description: body.description || '',
      completed: false
    });

    return success(201, {
      id: todoId,
      title: body.title,
      description: body.description || '',
      completed: false
    });
  } catch (err) {
    console.error('Error creating todo:', err);
    return error(500, 'Failed to create todo');
  }
};
