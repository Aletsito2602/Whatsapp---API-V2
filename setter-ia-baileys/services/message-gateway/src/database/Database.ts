// Reuse the same Database class from session-manager
import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../utils/logger';
import { DatabaseConnection, QueryResult as CustomQueryResult, Transaction } from '@setter-baileys/types';
import { v4 as uuidv4 } from 'uuid';

export class Database {
  private pool: Pool;
  private isConnected = false;

  constructor(private config: DatabaseConnection) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    this.pool.on('error', (err) => {
      logger.error('Database pool error:', err);
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<CustomQueryResult<T>> {
    const start = Date.now();
    
    try {
      const result: QueryResult<T> = await this.pool.query(sql, params);
      const duration = Date.now() - start;
      
      if (duration > 1000) {
        logger.warn('Slow query detected', { 
          sql: sql.substring(0, 100) + '...', 
          duration,
          params: params.length 
        });
      }

      return {
        rows: result.rows,
        count: result.rowCount || 0,
        affectedRows: result.rowCount || 0
      };
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query error', { 
        sql: sql.substring(0, 100) + '...', 
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async transaction(): Promise<Transaction> {
    const client = await this.pool.connect();
    const transactionId = uuidv4();
    
    await client.query('BEGIN');
    
    return {
      id: transactionId,
      
      async query<T>(sql: string, params: any[] = []): Promise<CustomQueryResult<T>> {
        try {
          const result: QueryResult<T> = await client.query(sql, params);
          return {
            rows: result.rows,
            count: result.rowCount || 0,
            affectedRows: result.rowCount || 0
          };
        } catch (error) {
          logger.error('Transaction query error:', error);
          throw error;
        }
      },
      
      async commit(): Promise<void> {
        try {
          await client.query('COMMIT');
          client.release();
          logger.debug(`Transaction ${transactionId} committed`);
        } catch (error) {
          client.release();
          logger.error(`Transaction ${transactionId} commit failed:`, error);
          throw error;
        }
      },
      
      async rollback(): Promise<void> {
        try {
          await client.query('ROLLBACK');
          client.release();
          logger.debug(`Transaction ${transactionId} rolled back`);
        } catch (error) {
          client.release();
          logger.error(`Transaction ${transactionId} rollback failed:`, error);
          throw error;
        }
      }
    };
  }

  get connected(): boolean {
    return this.isConnected;
  }
}