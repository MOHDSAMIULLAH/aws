const { S3Client } = require('@aws-sdk/client-s3');
const { fromSSO } = require('@aws-sdk/credential-provider-sso');

const isProduction = process.env.NODE_ENV === 'production';

// Production (EC2): IAM Role attached to instance — no credentials needed.
// Development (local): SSO credentials via AWS profile.
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  ...(isProduction
    ? {}
    : {
        credentials: fromSSO({
          profile: process.env.AWS_PROFILE || 'PowerUserAccess-961014542396'
        })
      })
});

module.exports = s3Client;
