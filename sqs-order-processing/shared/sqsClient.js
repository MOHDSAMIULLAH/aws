import { SQSClient } from '@aws-sdk/client-sqs';
import 'dotenv/config';

// AWS SDK v3 — creates a single reusable SQS client
// Credentials are picked up automatically from:
// 1. Environment variables (AWS_ACCESS_KEY_ID etc.)
// 2. ~/.aws/credentials (if using aws configure)
// 3. IAM role (when running on EC2/Lambda)
export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'ap-south-1',
});
