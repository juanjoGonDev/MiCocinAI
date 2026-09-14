import pino from 'pino';
import { config } from '../config/app.config.js';

// Create pino logger
export const logger = pino({
  level: config.server.env === 'production' ? 'info' : 'debug',
  transport: config.server.env !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
});

export default logger;
