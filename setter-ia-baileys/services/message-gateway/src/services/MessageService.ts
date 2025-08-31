import axios from 'axios';
import { Database } from '../database/Database';
import { RedisClient } from '../redis/RedisClient';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { 
  SendMessageRequest, 
  SendMessageResponse,
  Message,
  MessageStatus,
  MessageDirection,
  ApiResponse
} from '@setter-baileys/types';
import { v4 as uuidv4 } from 'uuid';

export class MessageService {
  constructor(
    private database: Database,
    private redisClient: RedisClient
  ) {}

  async sendMessage(sessionId: string, messageRequest: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      logger.info(`Sending message via session ${sessionId}:`, {
        to: messageRequest.to,
        type: messageRequest.type
      });

      // First, check if session exists and is connected
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.status !== 'connected') {
        throw new Error(`Session ${sessionId} is not connected. Current status: ${session.status}`);
      }

      // Send message via Session Manager
      const response = await this.forwardToSessionManager(sessionId, messageRequest);
      
      // Store message in database
      const message: Partial<Message> = {
        id: uuidv4(),
        sessionId,
        messageId: response.messageId,
        direction: MessageDirection.OUTBOUND,
        fromNumber: session.phoneNumber || 'unknown',
        toNumber: messageRequest.to,
        messageType: messageRequest.type,
        content: messageRequest.content,
        status: MessageStatus.SENT,
        timestamp: new Date(),
        createdAt: new Date()
      };

      await this.saveMessage(message);

      return response;
    } catch (error) {
      logger.error(`Failed to send message via session ${sessionId}:`, error);
      throw error;
    }
  }

  private async forwardToSessionManager(sessionId: string, messageRequest: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      const url = `${config.sessionManager.url}/api/v1/sessions/${sessionId}/send-message`;
      
      const response = await axios.post(url, messageRequest, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to send message');
      }

      return response.data.data;
    } catch (error: any) {
      logger.error('Session Manager API error:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      if (error.response?.status === 404) {
        throw new Error('Session not found or not connected');
      } else if (error.response?.status === 400) {
        throw new Error('Invalid message format');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Session Manager service is unavailable');
      }
      
      throw error;
    }
  }

  private async getSession(sessionId: string): Promise<any> {
    try {
      const result = await this.database.query(`
        SELECT id, phone_number, status 
        FROM whatsapp_sessions 
        WHERE id = $1
      `, [sessionId]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Failed to get session ${sessionId}:`, error);
      return null;
    }
  }

  private async saveMessage(message: Partial<Message>): Promise<void> {
    try {
      await this.database.query(`
        INSERT INTO messages (
          id, session_id, message_id, direction, from_number, to_number, 
          message_type, content, status, timestamp, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        message.id,
        message.sessionId,
        message.messageId,
        message.direction,
        message.fromNumber,
        message.toNumber,
        message.messageType,
        JSON.stringify(message.content),
        message.status,
        message.timestamp,
        message.createdAt
      ]);

      logger.debug(`Message saved to database: ${message.id}`);
    } catch (error) {
      logger.error('Failed to save message to database:', error);
      // Don't throw here to avoid failing the message send
    }
  }

  async getMessageHistory(sessionId: string, limit: number = 50, offset: number = 0): Promise<Message[]> {
    try {
      const result = await this.database.query<Message>(`
        SELECT * FROM messages 
        WHERE session_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2 OFFSET $3
      `, [sessionId, limit, offset]);
      
      return result.rows.map(row => ({
        ...row,
        content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content
      }));
    } catch (error) {
      logger.error(`Failed to get message history for session ${sessionId}:`, error);
      throw error;
    }
  }

  async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void> {
    try {
      await this.database.query(`
        UPDATE messages 
        SET status = $1 
        WHERE message_id = $2
      `, [status, messageId]);

      logger.debug(`Message status updated: ${messageId} -> ${status}`);
    } catch (error) {
      logger.error(`Failed to update message status for ${messageId}:`, error);
      throw error;
    }
  }

  async getMessageById(messageId: string): Promise<Message | null> {
    try {
      const result = await this.database.query<Message>(`
        SELECT * FROM messages WHERE message_id = $1
      `, [messageId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const message = result.rows[0];
      return {
        ...message,
        content: typeof message.content === 'string' ? JSON.parse(message.content) : message.content
      };
    } catch (error) {
      logger.error(`Failed to get message ${messageId}:`, error);
      return null;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Message Service...');
    // Cleanup any resources if needed
  }
}