module.exports = {
  apps: [
    {
      name: 'quantum-quant-bot',
      script: 'dist/server.cjs',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
