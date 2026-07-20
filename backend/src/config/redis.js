const { createClient } = require('redis');

const redisClient = createClient({
  socket: { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT) || 6379 }
});

redisClient.on('error', (err) => console.error('Redis error:', err));
redisClient.connect().catch(console.error);

module.exports = { redisClient };
