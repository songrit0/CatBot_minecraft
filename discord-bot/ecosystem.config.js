module.exports = {
  apps: [{
    name: 'catbot-minecraft',
    script: 'bot.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
    },
    // Auto restart
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
    // Logs
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    merge_logs: true,
  }],
};
