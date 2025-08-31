import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  server: {
    port: parseInt(process.env.SESSION_MANAGER_PORT || '3001'),
    host: process.env.HOST || '0.0.0.0'
  },
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/setter_baileys',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'setter_baileys',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20')
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    database: parseInt(process.env.REDIS_DB || '0'),
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3')
  },
  
  whatsapp: {
    sessionTimeout: parseInt(process.env.WHATSAPP_SESSION_TIMEOUT || '300000'),
    maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || '5'),
    reconnectDelay: parseInt(process.env.WHATSAPP_RECONNECT_DELAY || '5000'),
    qrTimeout: parseInt(process.env.WHATSAPP_QR_TIMEOUT || '60000'),
    maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || '5')
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  },
  
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    apiKeyHeader: 'X-API-Key'
  },
  
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.API_RATE_LIMIT || '1000')
  }
};