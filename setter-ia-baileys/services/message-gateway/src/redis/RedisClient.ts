import Redis from 'redis';
import { logger } from '../utils/logger';
import { RedisConnection } from '@setter-baileys/types';

export class RedisClient {
  private client: Redis.RedisClientType;
  private subscriber: Redis.RedisClientType;
  private publisher: Redis.RedisClientType;
  private isConnected = false;

  constructor(private config: RedisConnection) {
    const redisConfig = {
      socket: {
        host: config.host,
        port: config.port
      },
      password: config.password,
      database: config.database || 0,
      retry_delay: 1000,
      max_attempts: config.maxRetries || 3
    };

    this.client = Redis.createClient(redisConfig);
    this.subscriber = Redis.createClient(redisConfig);
    this.publisher = Redis.createClient(redisConfig);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      logger.info('Redis client ready');
    });

    this.client.on('end', () => {
      this.isConnected = false;
      logger.info('Redis client disconnected');
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);
      
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.client.quit(),
        this.subscriber.quit(),
        this.publisher.quit()
      ]);
      
      this.isConnected = false;
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      throw error;
    }
  }

  async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.publisher.publish(channel, message);
    } catch (error) {
      logger.error(`Redis PUBLISH error for channel ${channel}:`, error);
      throw error;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}