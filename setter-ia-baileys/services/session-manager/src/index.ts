import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/config';
import { logger } from './utils/logger';
import { SessionManager } from './services/SessionManager';
import { SessionController } from './controllers/SessionController';
import { Database } from './database/Database';
import { RedisClient } from './redis/RedisClient';
import { errorHandler, requestLogger } from './middleware';

class SessionManagerApp {
  private app: express.Application;
  private database: Database;
  private redisClient: RedisClient;
  private sessionManager: SessionManager;

  constructor() {
    this.app = express();
    this.database = new Database(config.database);
    this.redisClient = new RedisClient(config.redis);
    this.sessionManager = new SessionManager(this.database, this.redisClient);
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(requestLogger);
  }

  private setupRoutes(): void {
    const sessionController = new SessionController(this.sessionManager);
    
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: { status: 'healthy' },
          redis: { status: 'healthy' }
        }
      });
    });

    this.app.use('/api/v1/sessions', sessionController.router);
    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    try {
      await this.database.connect();
      await this.redisClient.connect();
      
      this.setupMiddleware();
      this.setupRoutes();

      const port = config.server.port;
      this.app.listen(port, () => {
        logger.info(`Session Manager Service started on port ${port}`);
      });
    } catch (error) {
      logger.error('Failed to start Session Manager Service:', error);
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Session Manager Service...');
    await this.database.disconnect();
    await this.redisClient.disconnect();
    await this.sessionManager.shutdown();
  }
}

const app = new SessionManagerApp();

process.on('SIGTERM', async () => {
  await app.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await app.shutdown();
  process.exit(0);
});

app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});