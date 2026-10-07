const Redis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URI || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  }
});

redis.on('connect', () => {
  console.log('Successfully connected to Redis cache client.');
});

redis.on('error', (err) => {
  console.warn('Redis connection warning/error:', err.message);
});

module.exports = redis;
