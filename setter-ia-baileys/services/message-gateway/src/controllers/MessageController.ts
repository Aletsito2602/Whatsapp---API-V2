import { Request, Response, Router } from 'express';
import Joi from 'joi';
import { MessageService } from '../services/MessageService';
import { validateRequest, authenticate, rateLimit } from '../middleware';
import { config } from '../config/config';
import { ApiResponse, SendMessageRequest, ErrorCodes } from '@setter-baileys/types';
import { logger } from '../utils/logger';

export class MessageController {
  public router: Router;

  constructor(private messageService: MessageService) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const rateLimitMiddleware = rateLimit(config.rateLimiting.windowMs, config.rateLimiting.max);

    // Send message
    this.router.post('/:sessionId/send',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.sendMessageSchema),
      this.sendMessage.bind(this)
    );

    // Get message history
    this.router.get('/:sessionId/history',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.getHistorySchema),
      this.getMessageHistory.bind(this)
    );

    // Get specific message
    this.router.get('/:messageId',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.getMessageSchema),
      this.getMessage.bind(this)
    );
  }

  private get sendMessageSchema(): Joi.ObjectSchema {
    return Joi.object({
      params: Joi.object({
        sessionId: Joi.string().uuid().required()
      }).required(),
      body: Joi.object({
        to: Joi.string().pattern(/^\d{10,15}$/).required(),
        type: Joi.string().valid('text', 'image', 'audio', 'video', 'document').required(),
        content: Joi.object({
          text: Joi.when('..type', {
            is: 'text',
            then: Joi.string().max(4096).required(),
            otherwise: Joi.optional()
          }),
          media: Joi.when('..type', {
            is: Joi.string().valid('image', 'audio', 'video', 'document'),
            then: Joi.object({
              url: Joi.string().uri().required(),
              fileName: Joi.string().optional(),
              caption: Joi.string().max(1024).optional()
            }).required(),
            otherwise: Joi.optional()
          })
        }).required()
      }).required()
    });
  }

  private get getHistorySchema(): Joi.ObjectSchema {
    return Joi.object({
      params: Joi.object({
        sessionId: Joi.string().uuid().required()
      }).required(),
      query: Joi.object({
        limit: Joi.number().integer().min(1).max(100).default(50),
        offset: Joi.number().integer().min(0).default(0)
      }).optional()
    });
  }

  private get getMessageSchema(): Joi.ObjectSchema {
    return Joi.object({
      params: Joi.object({
        messageId: Joi.string().required()
      }).required()
    });
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const messageRequest: SendMessageRequest = req.body;

      logger.info(`Sending message via session ${sessionId}:`, {
        to: messageRequest.to,
        type: messageRequest.type
      });

      const result = await this.messageService.sendMessage(sessionId, messageRequest);

      const response: ApiResponse = {
        success: true,
        data: result
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Send message error:', error);
      
      let errorCode = ErrorCodes.INTERNAL_SERVER_ERROR;
      let statusCode = 500;

      if (error.message.includes('not found')) {
        errorCode = ErrorCodes.SESSION_NOT_FOUND;
        statusCode = 404;
      } else if (error.message.includes('not connected')) {
        errorCode = ErrorCodes.SESSION_DISCONNECTED;
        statusCode = 400;
      } else if (error.message.includes('Invalid message')) {
        errorCode = ErrorCodes.INVALID_MESSAGE_FORMAT;
        statusCode = 400;
      } else if (error.message.includes('service is unavailable')) {
        errorCode = ErrorCodes.SERVICE_UNAVAILABLE;
        statusCode = 503;
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: errorCode,
          message: error.message,
          timestamp: new Date()
        }
      };

      res.status(statusCode).json(response);
    }
  }

  async getMessageHistory(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      logger.info(`Getting message history for session ${sessionId}`);

      const messages = await this.messageService.getMessageHistory(
        sessionId, 
        Number(limit), 
        Number(offset)
      );

      const response: ApiResponse = {
        success: true,
        data: messages,
        meta: {
          limit: Number(limit),
          offset: Number(offset),
          total: messages.length
        }
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Get message history error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_SERVER_ERROR,
          message: error.message,
          timestamp: new Date()
        }
      };

      res.status(500).json(response);
    }
  }

  async getMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;

      logger.info(`Getting message: ${messageId}`);

      const message = await this.messageService.getMessageById(messageId);

      if (!message) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.MESSAGE_NOT_FOUND,
            message: 'Message not found',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: message
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Get message error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_SERVER_ERROR,
          message: error.message,
          timestamp: new Date()
        }
      };

      res.status(500).json(response);
    }
  }
}