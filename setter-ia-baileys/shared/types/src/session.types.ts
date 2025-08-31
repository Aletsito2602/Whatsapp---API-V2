import { ConnectionState } from '@whiskeysockets/baileys';

export interface WhatsAppSession {
  id: string;
  userId: string;
  sessionName: string;
  phoneNumber?: string;
  status: SessionStatus;
  authState?: any;
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum SessionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting', 
  CONNECTED = 'connected',
  ERROR = 'error',
  PAIRING = 'pairing'
}

export interface SessionConfig {
  sessionName: string;
  phoneNumber?: string;
  webhookUrl?: string;
  qrTimeout?: number;
  reconnectAttempts?: number;
}

export interface SessionConnection {
  id: string;
  socket: any;
  state: ConnectionState;
  qrCode?: string;
  pairingCode?: string;
  lastActivity: Date;
}

export interface QRCodeData {
  sessionId: string;
  qrCode: string;
  expiresAt: Date;
}

export interface PairingCodeData {
  sessionId: string;
  code: string;
  phoneNumber: string;
  expiresAt: Date;
}