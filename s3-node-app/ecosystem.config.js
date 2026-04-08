module.exports = {
  apps: [
    {
      name: 'zeenat-s3-api',
      script: 'index.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/pm2/zeenat-s3-error.log',
      out_file: '/var/log/pm2/zeenat-s3-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '500M'
    }
  ]
};
