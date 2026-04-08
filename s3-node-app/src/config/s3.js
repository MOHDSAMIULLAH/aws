const { S3Client } = require('@aws-sdk/client-s3');

// No credentials needed when running on EC2 with IAM Role attached.
// SDK automatically picks up credentials from the instance metadata.
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1'
});

module.exports = s3Client;
