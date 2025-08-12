import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '@ip2m/core';
import { AppContext } from '../app.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
  context: AppContext;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided'
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, authReq.context.config.jwtSecret) as JWTPayload;
    
    // Get user from database to ensure they still exist and are active
    const user = authReq.context.db.getUserById(decoded.userId);
    
    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found'
      });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User account is disabled'
      });
      return;
    }

    // Check if user is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User account is temporarily locked'
      });
      return;
    }

    authReq.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired'
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error verifying token'
    });
  }
}

export function requireRole(roles: UserRole | UserRole[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
      });
      return;
    }

    next();
  };
}

export function requireFacilitatorOrAdmin(req: Request, res: Response, next: NextFunction): void {
  return requireRole(['Facilitator', 'Admin'])(req, res, next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  return requireRole('Admin')(req, res, next);
}

function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check session
  if (req.session && (req.session as any).token) {
    return (req.session as any).token;
  }

  // Check cookie (if using cookie-based auth)
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

export function generateToken(user: User, jwtSecret: string): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId: user.id,
    username: user.username,
    role: user.role
  };

  return jwt.sign(payload, jwtSecret, {
    expiresIn: '8h',
    issuer: 'ip2m-metrr-copilot',
    audience: 'ip2m-users'
  });
}

export function verifyToken(token: string, jwtSecret: string): JWTPayload | null {
  try {
    return jwt.verify(token, jwtSecret) as JWTPayload;
  } catch (error) {
    return null;
  }
}
