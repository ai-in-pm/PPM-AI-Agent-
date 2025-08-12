import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { UserSchema } from '@ip2m/core';
import { generateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { BadRequestError, UnauthorizedError, ConflictError } from '../middleware/error-handler.js';
import { logger, logSecurityEvent } from '../utils/logger.js';

const router = Router();

// Login validation rules
const loginValidation = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

// Registration validation rules
const registerValidation = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('fullName').trim().isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('role').optional().isIn(['Admin', 'Facilitator', 'Analyst', 'Viewer']).withMessage('Invalid role')
];

// POST /api/auth/login
router.post('/login', loginValidation, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const { username, password } = req.body;
  const context = (req as AuthenticatedRequest).context;

  try {
    // Get user by username
    const user = context.db.getUserByUsername(username);
    
    if (!user) {
      logSecurityEvent('login_failed', { username, reason: 'user_not_found' }, req);
      throw new UnauthorizedError('Invalid username or password');
    }

    // Check if user is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      logSecurityEvent('login_failed', { username, reason: 'account_locked' }, req);
      throw new UnauthorizedError('Account is temporarily locked');
    }

    // Check if user is active
    if (!user.isActive) {
      logSecurityEvent('login_failed', { username, reason: 'account_disabled' }, req);
      throw new UnauthorizedError('Account is disabled');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      // Increment failed login attempts
      const failedAttempts = user.failedLoginAttempts + 1;
      const maxAttempts = 5;
      
      let lockedUntil: Date | undefined;
      if (failedAttempts >= maxAttempts) {
        lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
      }

      // Update user with failed attempt
      context.db.updateUser(user.id, {
        failedLoginAttempts: failedAttempts,
        lockedUntil
      });

      logSecurityEvent('login_failed', { 
        username, 
        reason: 'invalid_password',
        failedAttempts,
        locked: !!lockedUntil
      }, req);

      throw new UnauthorizedError('Invalid username or password');
    }

    // Reset failed login attempts on successful login
    if (user.failedLoginAttempts > 0) {
      context.db.updateUser(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date()
      });
    }

    // Generate JWT token
    const token = generateToken(user, context.config.jwtSecret);

    // Store token in session
    (req.session as any).token = token;
    (req.session as any).userId = user.id;

    logger.info('User logged in successfully', { userId: user.id, username: user.username });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    throw error;
  }
});

// POST /api/auth/register
router.post('/register', registerValidation, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const { username, email, fullName, password, role = 'Analyst' } = req.body;
  const context = (req as AuthenticatedRequest).context;

  try {
    // Check if username already exists
    const existingUser = context.db.getUserByUsername(username);
    if (existingUser) {
      throw new ConflictError('Username already exists');
    }

    // Check if email already exists
    const existingEmail = context.db.getUserByEmail(email);
    if (existingEmail) {
      throw new ConflictError('Email already exists');
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userData = {
      username,
      email,
      fullName,
      role: role as any,
      isActive: true,
      passwordHash,
      failedLoginAttempts: 0
    };

    // Validate with Zod schema
    const validatedUser = UserSchema.omit({ 
      id: true, 
      createdAt: true, 
      updatedAt: true,
      lastLoginAt: true,
      lockedUntil: true
    }).parse(userData);

    const userId = context.db.createUser(validatedUser);

    logger.info('User registered successfully', { userId, username, email, role });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: userId,
        username,
        email,
        fullName,
        role
      }
    });
  } catch (error) {
    throw error;
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  const userId = (req.session as any)?.userId;
  
  req.session.destroy((err) => {
    if (err) {
      logger.error('Error destroying session:', err);
    }
  });

  if (userId) {
    logger.info('User logged out', { userId });
  }

  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  res.json({
    user: {
      id: authReq.user.id,
      username: authReq.user.username,
      email: authReq.user.email,
      fullName: authReq.user.fullName,
      role: authReq.user.role,
      lastLoginAt: authReq.user.lastLoginAt,
      createdAt: authReq.user.createdAt
    }
  });
});

// POST /api/auth/change-password
router.post('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain uppercase, lowercase, number, and special character')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { currentPassword, newPassword } = req.body;

  try {
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, authReq.user.passwordHash);
    if (!isValidPassword) {
      logSecurityEvent('password_change_failed', { 
        userId: authReq.user.id, 
        reason: 'invalid_current_password' 
      }, req);
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    authReq.context.db.updateUser(authReq.user.id, {
      passwordHash: newPasswordHash
    });

    logger.info('Password changed successfully', { userId: authReq.user.id });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    throw error;
  }
});

export default router;
