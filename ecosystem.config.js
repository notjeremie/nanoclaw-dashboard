module.exports = {
  apps: [{
    name: 'nanoclaw-dashboard',
    script: 'server.js',
    cwd: '/root/nanoclaw-dashboard',
    env: { NODE_ENV: 'production' },
    restart_delay: 5000,
    max_restarts: 10
  }]
};
