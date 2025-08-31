import { Request, Response, Router } from 'express';
import Joi from 'joi';
import { SessionManager } from '../services/SessionManager';
import { validateRequest, authenticate, rateLimit } from '../middleware';
import { config } from '../config/config';
import { ApiResponse, SessionConfig, ErrorCodes } from '@setter-baileys/types';
import { logger } from '../utils/logger';

export class SessionController {
  public router: Router;

  constructor(private sessionManager: SessionManager) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const rateLimitMiddleware = rateLimit(config.rateLimiting.windowMs, config.rateLimiting.max);

    // Create new session
    this.router.post('/',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.createSessionSchema),
      this.createSession.bind(this)
    );

    // Get session status
    this.router.get('/:sessionId/status',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.sessionIdSchema),
      this.getSessionStatus.bind(this)
    );

    // Connect session
    this.router.post('/:sessionId/connect',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.sessionIdSchema),
      this.connectSession.bind(this)
    );

    // Disconnect session
    this.router.post('/:sessionId/disconnect',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.sessionIdSchema),
      this.disconnectSession.bind(this)
    );

    // Delete session
    this.router.delete('/:sessionId',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.sessionIdSchema),
      this.deleteSession.bind(this)
    );

    // Get QR code
    this.router.get('/:sessionId/qr',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.sessionIdSchema),
      this.getQRCode.bind(this)
    );

    // Get pairing code
    this.router.get('/:sessionId/pairing-code',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.sessionIdSchema),
      this.getPairingCode.bind(this)
    );

    // Get user sessions
    this.router.get('/',
      rateLimitMiddleware,
      authenticate,
      this.getUserSessions.bind(this)
    );

    // Send message via session
    this.router.post('/:sessionId/send-message',
      rateLimitMiddleware,
      authenticate,
      validateRequest(this.sendMessageSchema),
      this.sendMessage.bind(this)
    );
  }

  private get createSessionSchema(): Joi.ObjectSchema {
    return Joi.object({
      body: Joi.object({
        sessionName: Joi.string().alphanum().min(3).max(50).required(),
        phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).optional(),
        webhookUrl: Joi.string().uri().optional(),
        qrTimeout: Joi.number().min(30000).max(300000).optional(),
        reconnectAttempts: Joi.number().min(1).max(10).optional()
      }).required()
    });
  }

  private get sessionIdSchema(): Joi.ObjectSchema {
    return Joi.object({
      params: Joi.object({
        sessionId: Joi.string().uuid().required()
      }).required()
    });
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

  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId!;
      const sessionConfig: SessionConfig = req.body;

      logger.info(`Creating session for user ${userId}:`, sessionConfig);

      const session = await this.sessionManager.createSession(userId, sessionConfig);

      const response: ApiResponse = {
        success: true,
        data: session
      };

      res.status(201).json(response);
    } catch (error: any) {
      logger.error('Create session error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: error.message.includes('already exists') ? ErrorCodes.SESSION_ALREADY_EXISTS : ErrorCodes.INTERNAL_SERVER_ERROR,
          message: error.message,
          timestamp: new Date()
        }
      };

      const statusCode = error.message.includes('already exists') ? 409 : 500;
      res.status(statusCode).json(response);
    }
  }

  async getSessionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.userId!;

      const session = await this.sessionManager.getSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'Session not found',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: {
          sessionId: session.id,
          status: session.status,
          phoneNumber: session.phoneNumber,
          sessionName: session.sessionName,
          lastSeen: session.lastSeen,
          createdAt: session.createdAt
        }
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Get session status error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          timestamp: new Date()
        }
      };

      res.status(500).json(response);
    }
  }

  async connectSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.userId!;

      const session = await this.sessionManager.getSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'Session not found',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      logger.info(`Connecting session ${sessionId} for user ${userId}`);

      const authData = await this.sessionManager.connectSession(sessionId);

      const response: ApiResponse = {
        success: true,
        data: authData
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Connect session error:', error);
      
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

  async disconnectSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.userId!;

      const session = await this.sessionManager.getSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'Session not found',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      logger.info(`Disconnecting session ${sessionId} for user ${userId}`);

      await this.sessionManager.disconnectSession(sessionId);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Session disconnected successfully',
          sessionId
        }
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Disconnect session error:', error);
      
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

  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.userId!;

      const session = await this.sessionManager.getSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'Session not found',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      logger.info(`Deleting session ${sessionId} for user ${userId}`);

      await this.sessionManager.deleteSession(sessionId);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Session deleted successfully',
          sessionId
        }
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Delete session error:', error);
      
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

  async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.userId!;

      const session = await this.sessionManager.getSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'Session not found',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      const qrData = await this.sessionManager.getQRCode(sessionId);
      
      if (!qrData) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'QR code not available',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: qrData
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Get QR code error:', error);
      
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

  async getPairingCode(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.userId!;

      const session = await this.sessionManager.getSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'Session not found',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      const pairingData = await this.sessionManager.getPairingCode(sessionId);
      
      if (!pairingData) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'Pairing code not available',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: pairingData
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Get pairing code error:', error);
      
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

  async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId!;

      logger.info(`Getting sessions for user ${userId}`);

      const sessions = await this.sessionManager.getUserSessions(userId);

      const response: ApiResponse = {
        success: true,
        data: sessions,
        meta: {
          total: sessions.length
        }
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Get user sessions error:', error);
      
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

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { to, type, content } = req.body;
      const userId = req.user?.userId!;

      const session = await this.sessionManager.getSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: 'Session not found',
            timestamp: new Date()
          }
        };
        return res.status(404).json(response);
      }

      logger.info(`Sending message via session ${sessionId} to ${to}`);

      const socket = this.sessionManager.getSocket(sessionId);
      if (!socket) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.SESSION_DISCONNECTED,
            message: 'Session is not connected',
            timestamp: new Date()
          }
        };
        return res.status(400).json(response);
      }

      let messageId: string;
      
      // Send different types of messages
      if (type === 'text') {
        const result = await socket.sendMessage(`${to}@s.whatsapp.net`, { text: content.text });
        messageId = result.key.id!;
      } else if (type === 'image' && content.media) {
        const result = await socket.sendMessage(`${to}@s.whatsapp.net`, {
          image: { url: content.media.url },
          caption: content.media.caption
        });
        messageId = result.key.id!;
      } else if (type === 'document' && content.media) {
        const result = await socket.sendMessage(`${to}@s.whatsapp.net`, {
          document: { url: content.media.url },
          fileName: content.media.fileName || 'document'
        });
        messageId = result.key.id!;
      } else {
        throw new Error(`Message type ${type} not yet implemented`);
      }

      const response: ApiResponse = {
        success: true,
        data: {
          messageId,
          status: 'sent',
          timestamp: new Date()
        }
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Send message error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCodes.MESSAGE_SEND_FAILED,
          message: error.message,
          timestamp: new Date()
        }
      };

      res.status(500).json(response);
    }
  }
}