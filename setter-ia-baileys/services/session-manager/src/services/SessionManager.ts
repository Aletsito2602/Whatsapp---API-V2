import makeWASocket, { 
  ConnectionState, 
  DisconnectReason, 
  useMultiFileAuthState,
  WASocket,
  AuthenticationState,
  SignalDataTypeMap,
  proto
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import { logger } from '../utils/logger';
import { Database } from '../database/Database';
import { RedisClient } from '../redis/RedisClient';
import { 
  WhatsAppSession, 
  SessionStatus, 
  SessionConfig,
  SessionConnection,
  QRCodeData,
  PairingCodeData
} from '@setter-baileys/types';
import { config } from '../config/config';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

export class SessionManager {
  private sessions: Map<string, SessionConnection> = new Map();
  private authStates: Map<string, AuthenticationState> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private qrTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private database: Database,
    private redisClient: RedisClient
  ) {
    this.setupCleanupInterval();
  }

  async createSession(userId: string, sessionConfig: SessionConfig): Promise<WhatsAppSession> {
    try {
      const existingSession = await this.getSessionByName(userId, sessionConfig.sessionName);
      if (existingSession) {
        throw new Error(`Session ${sessionConfig.sessionName} already exists for user`);
      }

      const userSessions = await this.getUserSessions(userId);
      if (userSessions.length >= config.whatsapp.maxSessionsPerUser) {
        throw new Error(`Maximum sessions limit (${config.whatsapp.maxSessionsPerUser}) reached`);
      }

      const sessionId = uuidv4();
      const session: WhatsAppSession = {
        id: sessionId,
        userId,
        sessionName: sessionConfig.sessionName,
        phoneNumber: sessionConfig.phoneNumber,
        status: SessionStatus.DISCONNECTED,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.database.query(`
        INSERT INTO whatsapp_sessions (id, user_id, session_name, phone_number, status, webhook_url)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        sessionId,
        userId,
        sessionConfig.sessionName,
        sessionConfig.phoneNumber,
        SessionStatus.DISCONNECTED,
        sessionConfig.webhookUrl
      ]);

      logger.info(`Session created: ${sessionId} for user ${userId}`);
      return session;

    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  async connectSession(sessionId: string): Promise<QRCodeData | PairingCodeData> {
    try {
      const session = await this.getSessionById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (this.sessions.has(sessionId)) {
        throw new Error(`Session ${sessionId} is already connecting or connected`);
      }

      await this.updateSessionStatus(sessionId, SessionStatus.CONNECTING);

      const authDir = path.join(process.cwd(), 'sessions', sessionId);
      await fs.mkdir(authDir, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      this.authStates.set(sessionId, state);

      const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ sessionId }),
        browser: ['Setter-Baileys', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async (key) => {
          return { conversation: 'Hello' };
        }
      });

      const connection: SessionConnection = {
        id: sessionId,
        socket,
        state: socket.ws?.readyState || 0,
        lastActivity: new Date()
      };

      this.sessions.set(sessionId, connection);
      this.setupSocketHandlers(sessionId, socket, saveCreds);

      if (session.phoneNumber) {
        const pairingCode = await socket.requestPairingCode(session.phoneNumber);
        const pairingData: PairingCodeData = {
          sessionId,
          code: pairingCode,
          phoneNumber: session.phoneNumber,
          expiresAt: new Date(Date.now() + config.whatsapp.qrTimeout)
        };

        await this.redisClient.set(
          `pairing_code:${sessionId}`,
          JSON.stringify(pairingData),
          Math.floor(config.whatsapp.qrTimeout / 1000)
        );

        return pairingData;
      } else {
        return new Promise((resolve) => {
          const qrHandler = (qr: string) => {
            this.handleQRCode(sessionId, qr).then(resolve);
            socket.ev.off('connection.update', connectionHandler);
          };

          const connectionHandler = (update: Partial<ConnectionState>) => {
            if (update.qr) {
              qrHandler(update.qr);
            }
          };

          socket.ev.on('connection.update', connectionHandler);
        });
      }

    } catch (error) {
      logger.error(`Failed to connect session ${sessionId}:`, error);
      await this.updateSessionStatus(sessionId, SessionStatus.ERROR);
      throw error;
    }
  }

  private async handleQRCode(sessionId: string, qr: string): Promise<QRCodeData> {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(qr);
      const qrData: QRCodeData = {
        sessionId,
        qrCode: qrCodeDataURL,
        expiresAt: new Date(Date.now() + config.whatsapp.qrTimeout)
      };

      await this.redisClient.set(
        `qr_code:${sessionId}`,
        JSON.stringify(qrData),
        Math.floor(config.whatsapp.qrTimeout / 1000)
      );

      if (this.qrTimeouts.has(sessionId)) {
        clearTimeout(this.qrTimeouts.get(sessionId)!);
      }

      const timeout = setTimeout(() => {
        this.handleQRTimeout(sessionId);
      }, config.whatsapp.qrTimeout);

      this.qrTimeouts.set(sessionId, timeout);

      logger.info(`QR code generated for session ${sessionId}`);
      return qrData;

    } catch (error) {
      logger.error(`Failed to generate QR code for session ${sessionId}:`, error);
      throw error;
    }
  }

  private async handleQRTimeout(sessionId: string): Promise<void> {
    logger.warn(`QR code timeout for session ${sessionId}`);
    await this.disconnectSession(sessionId);
    await this.redisClient.del(`qr_code:${sessionId}`);
    this.qrTimeouts.delete(sessionId);
  }

  private setupSocketHandlers(sessionId: string, socket: WASocket, saveCreds: () => Promise<void>): void {
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      logger.debug(`Connection update for session ${sessionId}:`, { connection, lastDisconnect: lastDisconnect?.error });

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          await this.handleReconnection(sessionId);
        } else {
          await this.updateSessionStatus(sessionId, SessionStatus.DISCONNECTED);
          this.sessions.delete(sessionId);
          this.reconnectAttempts.delete(sessionId);
          logger.info(`Session ${sessionId} logged out`);
        }
      } else if (connection === 'open') {
        await this.updateSessionStatus(sessionId, SessionStatus.CONNECTED);
        this.reconnectAttempts.delete(sessionId);
        
        if (this.qrTimeouts.has(sessionId)) {
          clearTimeout(this.qrTimeouts.get(sessionId)!);
          this.qrTimeouts.delete(sessionId);
        }
        
        await this.redisClient.del(`qr_code:${sessionId}`);
        await this.redisClient.del(`pairing_code:${sessionId}`);
        
        logger.info(`Session ${sessionId} connected successfully`);
        
        const phoneNumber = socket.user?.id.split(':')[0];
        if (phoneNumber) {
          await this.updateSessionPhoneNumber(sessionId, phoneNumber);
        }
      }

      if (connection) {
        const sessionConnection = this.sessions.get(sessionId);
        if (sessionConnection) {
          sessionConnection.state = connection === 'open' ? 1 : 0;
          sessionConnection.lastActivity = new Date();
        }
      }
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('messages.upsert', async (m) => {
      logger.debug(`Messages received in session ${sessionId}:`, m.messages.length);
    });

    socket.ev.on('messaging-history.set', async () => {
      logger.debug(`Message history set for session ${sessionId}`);
    });
  }

  private async handleReconnection(sessionId: string): Promise<void> {
    const currentAttempts = this.reconnectAttempts.get(sessionId) || 0;
    
    if (currentAttempts >= config.whatsapp.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts reached for session ${sessionId}`);
      await this.updateSessionStatus(sessionId, SessionStatus.ERROR);
      this.sessions.delete(sessionId);
      this.reconnectAttempts.delete(sessionId);
      return;
    }

    this.reconnectAttempts.set(sessionId, currentAttempts + 1);
    
    logger.info(`Reconnecting session ${sessionId}, attempt ${currentAttempts + 1}`);
    
    setTimeout(async () => {
      try {
        await this.connectSession(sessionId);
      } catch (error) {
        logger.error(`Reconnection failed for session ${sessionId}:`, error);
      }
    }, config.whatsapp.reconnectDelay);
  }

  async disconnectSession(sessionId: string): Promise<void> {
    try {
      const connection = this.sessions.get(sessionId);
      if (connection?.socket) {
        await connection.socket.logout();
        connection.socket.end();
      }
      
      this.sessions.delete(sessionId);
      this.authStates.delete(sessionId);
      this.reconnectAttempts.delete(sessionId);
      
      if (this.qrTimeouts.has(sessionId)) {
        clearTimeout(this.qrTimeouts.get(sessionId)!);
        this.qrTimeouts.delete(sessionId);
      }
      
      await this.updateSessionStatus(sessionId, SessionStatus.DISCONNECTED);
      await this.redisClient.del(`qr_code:${sessionId}`);
      await this.redisClient.del(`pairing_code:${sessionId}`);
      
      logger.info(`Session ${sessionId} disconnected`);
    } catch (error) {
      logger.error(`Failed to disconnect session ${sessionId}:`, error);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.disconnectSession(sessionId);
      
      await this.database.query('DELETE FROM whatsapp_sessions WHERE id = $1', [sessionId]);
      
      const authDir = path.join(process.cwd(), 'sessions', sessionId);
      try {
        await fs.rm(authDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn(`Failed to remove auth directory for session ${sessionId}:`, error);
      }
      
      logger.info(`Session ${sessionId} deleted`);
    } catch (error) {
      logger.error(`Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  async getSessionById(sessionId: string): Promise<WhatsAppSession | null> {
    try {
      const result = await this.database.query<WhatsAppSession>(`
        SELECT * FROM whatsapp_sessions WHERE id = $1
      `, [sessionId]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Failed to get session ${sessionId}:`, error);
      return null;
    }
  }

  async getSessionByName(userId: string, sessionName: string): Promise<WhatsAppSession | null> {
    try {
      const result = await this.database.query<WhatsAppSession>(`
        SELECT * FROM whatsapp_sessions WHERE user_id = $1 AND session_name = $2
      `, [userId, sessionName]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Failed to get session by name ${sessionName}:`, error);
      return null;
    }
  }

  async getUserSessions(userId: string): Promise<WhatsAppSession[]> {
    try {
      const result = await this.database.query<WhatsAppSession>(`
        SELECT * FROM whatsapp_sessions WHERE user_id = $1 ORDER BY created_at DESC
      `, [userId]);
      
      return result.rows;
    } catch (error) {
      logger.error(`Failed to get sessions for user ${userId}:`, error);
      return [];
    }
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
    const session = await this.getSessionById(sessionId);
    return session?.status || null;
  }

  async getQRCode(sessionId: string): Promise<QRCodeData | null> {
    try {
      const qrData = await this.redisClient.get(`qr_code:${sessionId}`);
      return qrData ? JSON.parse(qrData) : null;
    } catch (error) {
      logger.error(`Failed to get QR code for session ${sessionId}:`, error);
      return null;
    }
  }

  async getPairingCode(sessionId: string): Promise<PairingCodeData | null> {
    try {
      const pairingData = await this.redisClient.get(`pairing_code:${sessionId}`);
      return pairingData ? JSON.parse(pairingData) : null;
    } catch (error) {
      logger.error(`Failed to get pairing code for session ${sessionId}:`, error);
      return null;
    }
  }

  getSocket(sessionId: string): WASocket | null {
    const connection = this.sessions.get(sessionId);
    return connection?.socket || null;
  }

  private async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    try {
      await this.database.query(`
        UPDATE whatsapp_sessions 
        SET status = $1, last_seen = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [status, sessionId]);
    } catch (error) {
      logger.error(`Failed to update session status for ${sessionId}:`, error);
    }
  }

  private async updateSessionPhoneNumber(sessionId: string, phoneNumber: string): Promise<void> {
    try {
      await this.database.query(`
        UPDATE whatsapp_sessions 
        SET phone_number = $1, updated_at = NOW()
        WHERE id = $2
      `, [phoneNumber, sessionId]);
    } catch (error) {
      logger.error(`Failed to update phone number for session ${sessionId}:`, error);
    }
  }

  private setupCleanupInterval(): void {
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 60000); // Run every minute
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const inactiveThreshold = Date.now() - config.whatsapp.sessionTimeout;
    
    for (const [sessionId, connection] of this.sessions) {
      if (connection.lastActivity.getTime() < inactiveThreshold) {
        logger.warn(`Cleaning up inactive session: ${sessionId}`);
        await this.disconnectSession(sessionId);
      }
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Session Manager...');
    
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.disconnectSession(id)));
    
    for (const timeout of this.qrTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    this.sessions.clear();
    this.authStates.clear();
    this.reconnectAttempts.clear();
    this.qrTimeouts.clear();
    
    logger.info('Session Manager shutdown complete');
  }
}