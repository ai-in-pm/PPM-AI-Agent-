import winston from 'winston';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';
const logDir = process.env.LOG_DIR || './logs';

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ' ' + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: fileFormat,
  defaultMeta: {
    service: 'ip2m-api',
    version: process.env.npm_package_version || '0.1.0'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test'
    }),

    // File transport for errors
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true
    })
  ],

  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3
    })
  ],

  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3
    })
  ]
});

// Create audit logger for security events
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'ip2m-audit',
    type: 'security'
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'audit.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 20,
      tailable: true
    })
  ]
});

// Performance logger for monitoring
export const perfLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'ip2m-performance',
    type: 'metrics'
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'performance.log'),
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 10,
      tailable: true
    })
  ]
});

// Helper functions for structured logging
export function logAPIRequest(req: any, res: any, responseTime: number): void {
  perfLogger.info('API Request', {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    responseTime,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    contentLength: res.get('Content-Length')
  });
}

export function logSecurityEvent(event: string, details: any, req?: any): void {
  auditLogger.warn('Security Event', {
    event,
    details,
    ip: req?.ip,
    userAgent: req?.get('User-Agent'),
    userId: req?.user?.id,
    timestamp: new Date().toISOString()
  });
}

export function logDatabaseOperation(operation: string, table: string, duration: number, success: boolean): void {
  perfLogger.info('Database Operation', {
    operation,
    table,
    duration,
    success,
    timestamp: new Date().toISOString()
  });
}

export function logRAGOperation(operation: string, details: any, duration: number): void {
  perfLogger.info('RAG Operation', {
    operation,
    details,
    duration,
    timestamp: new Date().toISOString()
  });
}
