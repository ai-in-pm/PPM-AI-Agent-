import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export interface APIError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  error: APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error
  logger.error('API Error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      })),
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Handle known API errors
  if (error.statusCode) {
    res.status(error.statusCode).json({
      error: error.name || 'API Error',
      message: error.message,
      code: error.code,
      details: error.details,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Handle specific error types
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.name === 'UnauthorizedError') {
    res.status(401).json({
      error: 'Unauthorized',
      message: error.message || 'Authentication required',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.name === 'ForbiddenError') {
    res.status(403).json({
      error: 'Forbidden',
      message: error.message || 'Access denied',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.name === 'NotFoundError') {
    res.status(404).json({
      error: 'Not Found',
      message: error.message || 'Resource not found',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.name === 'ConflictError') {
    res.status(409).json({
      error: 'Conflict',
      message: error.message || 'Resource conflict',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Handle database errors
  if (error.message.includes('SQLITE_CONSTRAINT')) {
    res.status(409).json({
      error: 'Database Constraint Error',
      message: 'The operation violates a database constraint',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.message.includes('SQLITE_BUSY')) {
    res.status(503).json({
      error: 'Service Temporarily Unavailable',
      message: 'Database is busy, please try again later',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Handle file upload errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: 'File Too Large',
      message: 'The uploaded file exceeds the maximum allowed size',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({
      error: 'Invalid File Upload',
      message: 'Unexpected file field or too many files',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Default to 500 Internal Server Error
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : error.message,
    timestamp: new Date().toISOString()
  });
}

// Custom error classes
export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class BadRequestError extends Error {
  statusCode = 400;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'BadRequestError';
  }
}
