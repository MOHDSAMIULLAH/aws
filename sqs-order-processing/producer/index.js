import express from 'express';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient } from '../shared/sqsClient.js';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const app = express();
app.use(express.json());

/**
 * POST /order
 * Body: { userId, item, quantity }
 *
 * Creates an order and sends it to SQS for async processing.
 * Returns immediately to the user — no waiting for processing.
 */
app.post('/order', async (req, res) => {
  const { userId, item, quantity } = req.body;

  if (!userId || !item || !quantity) {
    return res.status(400).json({
      error: 'Missing required fields: userId, item, quantity',
    });
  }

  const order = {
    orderId: randomUUID(),
    userId,
    item,
    quantity: Number(quantity),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  try {
    const command = new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(order),
      MessageAttributes: {
        userId: { DataType: 'String', StringValue: userId },
        source: { DataType: 'String', StringValue: 'order-api' },
      },
      DelaySeconds: 0,
    });

    const result = await sqsClient.send(command);

    console.log(`[Producer] Order queued: ${order.orderId} | MessageId: ${result.MessageId}`);

    return res.status(202).json({
      message: 'Order received and queued for processing',
      orderId: order.orderId,
      status: 'QUEUED',
      sqsMessageId: result.MessageId,
    });
  } catch (err) {
    console.error('[Producer] Failed to send to SQS:', err.message);
    return res.status(500).json({ error: 'Failed to queue order. Please try again.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT || 3000, () => {
  console.log(`[Producer] API running on port ${process.env.PORT || 3000}`);
});
