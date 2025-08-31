export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  requestId?: string;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AuthContext {
  userId: string;
  apiKey: string;
  permissions: string[];
}

export enum ErrorCodes {
  // Authentication errors
  INVALID_API_KEY = 'INVALID_API_KEY',
  EXPIRED_API_KEY = 'EXPIRED_API_KEY',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_DISCONNECTED = 'SESSION_DISCONNECTED',
  SESSION_LIMIT_EXCEEDED = 'SESSION_LIMIT_EXCEEDED',
  
  // Message errors
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  INVALID_MESSAGE_FORMAT = 'INVALID_MESSAGE_FORMAT',
  MESSAGE_QUOTA_EXCEEDED = 'MESSAGE_QUOTA_EXCEEDED',
  
  // Webhook errors
  WEBHOOK_DELIVERY_FAILED = 'WEBHOOK_DELIVERY_FAILED',
  INVALID_WEBHOOK_URL = 'INVALID_WEBHOOK_URL',
  
  // General errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  version: string;
  services: Record<string, ServiceHealth>;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  lastChecked: Date;
  error?: string;
}