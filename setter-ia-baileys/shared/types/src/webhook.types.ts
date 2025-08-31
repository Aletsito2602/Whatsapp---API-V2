export interface WebhookConfig {
  id: string;
  userId: string;
  sessionId?: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  isActive: boolean;
  retryAttempts: number;
  timeout: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum WebhookEvent {
  MESSAGE_RECEIVED = 'message.received',
  MESSAGE_SENT = 'message.sent',
  MESSAGE_STATUS_UPDATE = 'message.status.update',
  SESSION_CONNECTED = 'session.connected',
  SESSION_DISCONNECTED = 'session.disconnected',
  SESSION_QR_UPDATE = 'session.qr.update',
  CONTACT_UPDATE = 'contact.update',
  GROUP_UPDATE = 'group.update'
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: Date;
  sessionId: string;
  data: any;
}

export interface MessageReceivedPayload {
  event: WebhookEvent.MESSAGE_RECEIVED;
  timestamp: Date;
  sessionId: string;
  data: {
    messageId: string;
    from: string;
    to: string;
    type: string;
    content: any;
    timestamp: Date;
  };
}

export interface MessageStatusPayload {
  event: WebhookEvent.MESSAGE_STATUS_UPDATE;
  timestamp: Date;
  sessionId: string;
  data: {
    messageId: string;
    status: string;
    timestamp: Date;
  };
}

export interface SessionStatusPayload {
  event: WebhookEvent.SESSION_CONNECTED | WebhookEvent.SESSION_DISCONNECTED;
  timestamp: Date;
  sessionId: string;
  data: {
    status: string;
    phoneNumber?: string;
  };
}

export interface QRUpdatePayload {
  event: WebhookEvent.SESSION_QR_UPDATE;
  timestamp: Date;
  sessionId: string;
  data: {
    qrCode: string;
    expiresAt: Date;
  };
}

export interface WebhookDeliveryAttempt {
  id: string;
  webhookId: string;
  payload: WebhookPayload;
  url: string;
  attempt: number;
  status: WebhookDeliveryStatus;
  httpStatus?: number;
  error?: string;
  responseTime?: number;
  createdAt: Date;
  completedAt?: Date;
}

export enum WebhookDeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRYING = 'retrying'
}