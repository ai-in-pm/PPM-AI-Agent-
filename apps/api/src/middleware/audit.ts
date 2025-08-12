import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  
  // Store original res.json to intercept responses
  const originalJson = res.json;
  let responseBody: any;
  let statusCode = 200;

  res.json = function(body: any) {
    responseBody = body;
    statusCode = res.statusCode;
    return originalJson.call(this, body);
  };

  // Store original res.status to track status codes
  const originalStatus = res.status;
  res.status = function(code: number) {
    statusCode = code;
    return originalStatus.call(this, code);
  };

  // Continue with request processing
  next();

  // Log audit trail after response is sent
  res.on('finish', () => {
    if (authReq.user) {
      const auditData = {
        userId: authReq.user.id,
        action: `${req.method} ${req.route?.path || req.path}`,
        resourceType: extractResourceType(req.path),
        resourceId: extractResourceId(req),
        details: {
          method: req.method,
          path: req.path,
          query: req.query,
          params: req.params,
          statusCode,
          userAgent: req.get('User-Agent'),
          responseTime: Date.now() - (req as any).startTime
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: statusCode < 400
      };

      // Don't log sensitive data
      if (req.path.includes('/auth/login') || req.path.includes('/auth/register')) {
        delete auditData.details.query;
      }

      try {
        authReq.context.db.logAudit(auditData);
      } catch (error) {
        console.error('Failed to log audit trail:', error);
      }
    }
  });

  // Track request start time
  (req as any).startTime = Date.now();
}

function extractResourceType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  
  if (segments.length >= 2 && segments[0] === 'api') {
    return segments[1]; // e.g., 'assessments', 'rag', 'ingest'
  }
  
  return 'unknown';
}

function extractResourceId(req: Request): string | undefined {
  // Try to extract ID from params
  if (req.params.id) {
    return req.params.id;
  }
  
  if (req.params.assessmentId) {
    return req.params.assessmentId;
  }
  
  if (req.params.documentId) {
    return req.params.documentId;
  }
  
  // Try to extract from body for POST requests
  if (req.method === 'POST' && req.body && req.body.id) {
    return req.body.id;
  }
  
  return undefined;
}
