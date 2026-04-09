module.exports = {
  apps: [{
    name: 'rds-crud-api',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: '/home/ubuntu/.pm2/logs/rds-crud-api-error.log',
    out_file:   '/home/ubuntu/.pm2/logs/rds-crud-api-out.log',
    time: true,
  }],
};
