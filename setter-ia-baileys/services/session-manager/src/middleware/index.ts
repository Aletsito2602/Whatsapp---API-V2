import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiResponse, ErrorCodes } from '@setter-baileys/types';
import Joi from 'joi';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Request error:', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    body: req.body
  });

  const response: ApiResponse = {
    success: false,
    error: {
      code: error.code || ErrorCodes.INTERNAL_SERVER_ERROR,
      message: error.message || 'Internal server error',
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string
    }
  };

  const statusCode = getStatusCode(error.code || ErrorCodes.INTERNAL_SERVER_ERROR);
  res.status(statusCode).json(response);
};

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate({
      body: req.body,
      query: req.query,
      params: req.params
    }, { 
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const validationError = {
        code: ErrorCodes.VALIDATION_ERROR,
        message: error.details[0].message,
        details: error.details
      };
      
      return next(validationError);
    }

    next();
  };
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return next({
        code: ErrorCodes.INVALID_API_KEY,
        message: 'API key is required'
      });
    }

    req.user = {
      userId: 'extracted-from-api-key',
      apiKey,
      permissions: []
    };

    next();
  } catch (error) {
    next({
      code: ErrorCodes.INVALID_API_KEY,
      message: 'Invalid API key'
    });
  }
};

export const rateLimit = (windowMs: number, max: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetTime = windowStart + windowMs;
    
    if (!requests.has(key) || requests.get(key)!.resetTime <= now) {
      requests.set(key, { count: 1, resetTime });
      return next();
    }
    
    const current = requests.get(key)!;
    
    if (current.count >= max) {
      res.set({
        'X-RateLimit-Limit': max.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(resetTime).toISOString(),
        'Retry-After': Math.ceil((resetTime - now) / 1000).toString()
      });
      
      return next({
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit exceeded'
      });
    }
    
    current.count++;
    requests.set(key, current);
    
    res.set({
      'X-RateLimit-Limit': max.toString(),
      'X-RateLimit-Remaining': (max - current.count).toString(),
      'X-RateLimit-Reset': new Date(resetTime).toISOString()
    });
    
    next();
  };
};

function getStatusCode(errorCode: string): number {
  switch (errorCode) {
    case ErrorCodes.INVALID_API_KEY:
    case ErrorCodes.EXPIRED_API_KEY:
      return 401;
    case ErrorCodes.INSUFFICIENT_PERMISSIONS:
      return 403;
    case ErrorCodes.SESSION_NOT_FOUND:
      return 404;
    case ErrorCodes.VALIDATION_ERROR:
    case ErrorCodes.INVALID_MESSAGE_FORMAT:
      return 400;
    case ErrorCodes.SESSION_ALREADY_EXISTS:
      return 409;
    case ErrorCodes.RATE_LIMIT_EXCEEDED:
      return 429;
    case ErrorCodes.SERVICE_UNAVAILABLE:
      return 503;
    default:
      return 500;
  }
}