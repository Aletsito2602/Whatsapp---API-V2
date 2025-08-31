import pino from 'pino';
import { config } from '../config/config';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: config.logging.level,
  transport: isProduction 
    ? undefined 
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      },
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'session-manager',
    version: process.env.npm_package_version || '1.0.0'
  }
});