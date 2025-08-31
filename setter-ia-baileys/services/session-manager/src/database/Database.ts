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

    this.pool.on('connect', () => {
      logger.debug('New database connection established');
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      logger.info('Database connected successfully');
      
      await this.createTables();
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

  private async createTables(): Promise<void> {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        profile JSONB,
        subscription JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        session_name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20),
        status VARCHAR(50) DEFAULT 'disconnected',
        auth_state JSONB,
        webhook_url VARCHAR(500),
        last_seen TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, session_name)
      );
    `;

    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
        message_id VARCHAR(255),
        direction VARCHAR(20) NOT NULL,
        from_number VARCHAR(20) NOT NULL,
        to_number VARCHAR(20) NOT NULL,
        message_type VARCHAR(50) NOT NULL,
        content JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        INDEX (session_id, created_at),
        INDEX (message_id)
      );
    `;

    const createWebhooksTable = `
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
        url VARCHAR(500) NOT NULL,
        secret VARCHAR(255),
        events TEXT[] NOT NULL,
        is_active BOOLEAN DEFAULT true,
        retry_attempts INTEGER DEFAULT 3,
        timeout INTEGER DEFAULT 30000,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    const createWebhookAttemptsTable = `
      CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
        payload JSONB NOT NULL,
        url VARCHAR(500) NOT NULL,
        attempt INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL,
        http_status INTEGER,
        error TEXT,
        response_time INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        INDEX (webhook_id, created_at)
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON whatsapp_sessions(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_messages_session_timestamp ON messages(session_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_webhook_attempts_status ON webhook_delivery_attempts(status, created_at);
    `;

    const createUpdatedAtTrigger = `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_sessions_updated_at ON whatsapp_sessions;
      CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON whatsapp_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
      CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    try {
      await this.query(createUsersTable);
      await this.query(createSessionsTable);
      await this.query(createMessagesTable);
      await this.query(createWebhooksTable);
      await this.query(createWebhookAttemptsTable);
      await this.query(createIndexes);
      await this.query(createUpdatedAtTrigger);
      
      logger.info('Database tables created/verified successfully');
    } catch (error) {
      logger.error('Failed to create database tables:', error);
      throw error;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}