import { logger } from '../utils/logger';

// Redis en memoria simple para desarrollo
export class MemoryRedis {
  private storage = new Map<string, string>();

  async connect(): Promise<void> {
    logger.info('Memory Redis connected');
  }

  async disconnect(): Promise<void> {
    logger.info('Memory Redis disconnected');
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.storage.set(key, value);
    
    // Simulador de TTL
    if (ttlSeconds) {
      setTimeout(() => {
        this.storage.delete(key);
      }, ttlSeconds * 1000);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  async del(key: string): Promise<number> {
    const existed = this.storage.has(key);
    this.storage.delete(key);
    return existed ? 1 : 0;
  }

  async publish(channel: string, message: string): Promise<number> {
    logger.debug(`Published to ${channel}: ${message}`);
    return 1;
  }

  get connected(): boolean {
    return true;
  }
}