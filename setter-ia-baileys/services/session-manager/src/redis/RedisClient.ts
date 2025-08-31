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

    this.client.on('connect', () => {
      logger.debug('Redis client connected');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      logger.info('Redis client ready');
    });

    this.client.on('end', () => {
      this.isConnected = false;
      logger.info('Redis client disconnected');
    });

    this.subscriber.on('error', (err) => {
      logger.error('Redis subscriber error:', err);
    });

    this.publisher.on('error', (err) => {
      logger.error('Redis publisher error:', err);
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

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      throw error;
    }
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      return await this.client.hSet(key, field, value);
    } catch (error) {
      logger.error(`Redis HSET error for key ${key}:`, error);
      throw error;
    }
  }

  async hget(key: string, field: string): Promise<string | undefined> {
    try {
      return await this.client.hGet(key, field);
    } catch (error) {
      logger.error(`Redis HGET error for key ${key}:`, error);
      throw error;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      logger.error(`Redis HGETALL error for key ${key}:`, error);
      throw error;
    }
  }

  async hdel(key: string, field: string): Promise<number> {
    try {
      return await this.client.hDel(key, field);
    } catch (error) {
      logger.error(`Redis HDEL error for key ${key}:`, error);
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

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      await this.subscriber.subscribe(channel, (message) => {
        callback(message);
      });
    } catch (error) {
      logger.error(`Redis SUBSCRIBE error for channel ${channel}:`, error);
      throw error;
    }
  }

  async unsubscribe(channel?: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      logger.error(`Redis UNSUBSCRIBE error for channel ${channel}:`, error);
      throw error;
    }
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    try {
      return await this.client.zAdd(key, { score, value: member });
    } catch (error) {
      logger.error(`Redis ZADD error for key ${key}:`, error);
      throw error;
    }
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.zRange(key, start, stop);
    } catch (error) {
      logger.error(`Redis ZRANGE error for key ${key}:`, error);
      throw error;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      logger.error(`Redis EXPIRE error for key ${key}:`, error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Redis TTL error for key ${key}:`, error);
      throw error;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  getClient(): Redis.RedisClientType {
    return this.client;
  }

  getSubscriber(): Redis.RedisClientType {
    return this.subscriber;
  }

  getPublisher(): Redis.RedisClientType {
    return this.publisher;
  }
}