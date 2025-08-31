import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  server: {
    port: parseInt(process.env.MESSAGE_GATEWAY_PORT || '3002'),
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
  
  sessionManager: {
    url: process.env.SESSION_MANAGER_URL || 'http://localhost:3001'
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
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.API_RATE_LIMIT || '1000')
  },
  
  media: {
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
    allowedTypes: [
      'image/jpeg',
      'image/png', 
      'image/webp',
      'video/mp4',
      'audio/mpeg',
      'audio/ogg',
      'application/pdf',
      'text/plain'
    ]
  }
};