import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/config';
import { logger } from './utils/logger';
import { MessageService } from './services/MessageService';
import { MessageController } from './controllers/MessageController';
import { Database } from './database/Database';
import { RedisClient } from './redis/RedisClient';
import { errorHandler, requestLogger } from './middleware';

class MessageGatewayApp {
  private app: express.Application;
  private database: Database;
  private redisClient: RedisClient;
  private messageService: MessageService;

  constructor() {
    this.app = express();
    this.database = new Database(config.database);
    this.redisClient = new RedisClient(config.redis);
    this.messageService = new MessageService(this.database, this.redisClient);
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use(requestLogger);
  }

  private setupRoutes(): void {
    const messageController = new MessageController(this.messageService);
    
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

    this.app.use('/api/v1/messages', messageController.router);
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
        logger.info(`Message Gateway Service started on port ${port}`);
      });
    } catch (error) {
      logger.error('Failed to start Message Gateway Service:', error);
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Message Gateway Service...');
    await this.database.disconnect();
    await this.redisClient.disconnect();
    await this.messageService.shutdown();
  }
}

const app = new MessageGatewayApp();

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