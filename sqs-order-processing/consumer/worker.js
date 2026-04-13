import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';
import { sqsClient } from '../shared/sqsClient.js';
import { processOrder } from './orderProcessor.js';
import 'dotenv/config';

const QUEUE_URL = process.env.SQS_QUEUE_URL;
const MAX_MESSAGES = 10;       // receive up to 10 per poll
const WAIT_TIME_SECONDS = 20;  // long polling — reduces empty responses + cost

async function deleteMessage(receiptHandle) {
  await sqsClient.send(new DeleteMessageCommand({
    QueueUrl: QUEUE_URL,
    ReceiptHandle: receiptHandle,
  }));
}

// Call this if processing might exceed the queue's visibility timeout
async function extendVisibility(receiptHandle, seconds) {
  await sqsClient.send(new ChangeMessageVisibilityCommand({
    QueueUrl: QUEUE_URL,
    ReceiptHandle: receiptHandle,
    VisibilityTimeout: seconds,
  }));
}

async function handleMessage(message) {
  const { Body, ReceiptHandle, MessageId, Attributes } = message;
  const receiveCount = parseInt(Attributes?.ApproximateReceiveCount || '1', 10);

  console.log(`\n[Worker] Processing message: ${MessageId} (attempt #${receiveCount})`);

  let order;
  try {
    order = JSON.parse(Body);
  } catch {
    // Malformed JSON will never succeed — delete immediately instead of retrying
    console.error(`[Worker] Invalid JSON in message ${MessageId}, deleting permanently`);
    await deleteMessage(ReceiptHandle);
    return;
  }

  try {
    await processOrder(order);

    // SUCCESS — must delete or message becomes visible again after timeout
    await deleteMessage(ReceiptHandle);
    console.log(`[Worker] ✅ Deleted after success: ${MessageId}`);
  } catch (err) {
    console.error(`[Worker] ❌ Failed for ${order.orderId}: ${err.message}`);
    console.log(`[Worker] Attempt ${receiveCount}/3. Message stays in queue for retry.`);
    // Do NOT delete — SQS will re-deliver after visibility timeout.
    // After maxReceiveCount (3) failures, SQS moves it to the DLQ automatically.
  }
}

async function poll() {
  console.log('[Worker] Starting SQS consumer worker...');
  console.log(`[Worker] Queue: ${QUEUE_URL}`);
  console.log('[Worker] Polling for messages (long poll: 20s)...\n');

  while (true) {
    try {
      const response = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: MAX_MESSAGES,
        WaitTimeSeconds: WAIT_TIME_SECONDS,
        AttributeNames: ['All'],           // includes ApproximateReceiveCount
        MessageAttributeNames: ['All'],    // includes custom attributes from producer
      }));

      const messages = response.Messages || [];

      if (messages.length === 0) {
        process.stdout.write('.');
        continue;
      }

      console.log(`\n[Worker] Received ${messages.length} message(s)`);

      // Process batch concurrently
      await Promise.all(messages.map(handleMessage));
    } catch (err) {
      console.error('[Worker] Poll error:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

process.on('SIGTERM', () => { console.log('\n[Worker] Shutting down...'); process.exit(0); });
process.on('SIGINT',  () => { console.log('\n[Worker] Shutting down...'); process.exit(0); });

poll();
