import { Router, Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';
import { AuthenticatedRequest, requireAdmin } from '../middleware/auth.js';
import { BadRequestError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All admin routes require admin role
router.use(requireAdmin);

// GET /api/admin/users
router.get('/users', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('role').optional().isIn(['Admin', 'Facilitator', 'Analyst', 'Viewer']).withMessage('Invalid role filter'),
  query('active').optional().isBoolean().withMessage('Active must be a boolean')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    // This would be implemented in the database class
    const users = authReq.context.db.getUsers({
      page,
      limit,
      role: req.query.role as any,
      active: req.query.active ? req.query.active === 'true' : undefined
    });

    res.json({
      success: true,
      users: users.items.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        failedLoginAttempts: user.failedLoginAttempts
      })),
      pagination: {
        page,
        limit,
        total: users.total,
        totalPages: Math.ceil(users.total / limit)
      }
    });
  } catch (error) {
    logger.error('Failed to get users', {
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

// GET /api/admin/audit
router.get('/audit', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('userId').optional().isUUID().withMessage('Invalid user ID'),
  query('action').optional().isString().withMessage('Action must be a string'),
  query('startDate').optional().isISO8601().withMessage('Start date must be ISO 8601 format'),
  query('endDate').optional().isISO8601().withMessage('End date must be ISO 8601 format')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  try {
    const auditLogs = authReq.context.db.getAuditLogs({
      page,
      limit,
      userId: req.query.userId as string,
      action: req.query.action as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined
    });

    res.json({
      success: true,
      auditLogs: auditLogs.items,
      pagination: {
        page,
        limit,
        total: auditLogs.total,
        totalPages: Math.ceil(auditLogs.total / limit)
      }
    });
  } catch (error) {
    logger.error('Failed to get audit logs', {
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

// GET /api/admin/system-stats
router.get('/system-stats', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const ragStats = await authReq.context.rag.getDocumentStats();
    const userStats = authReq.context.db.getUserStats();
    const assessmentStats = authReq.context.db.getAssessmentStats();

    res.json({
      success: true,
      stats: {
        users: userStats,
        assessments: assessmentStats,
        documents: ragStats,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get system stats', {
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

// POST /api/admin/users/:id/toggle-active
router.post('/users/:id/toggle-active', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;

  try {
    const user = authReq.context.db.getUserById(id);
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    // Prevent deactivating the last admin
    if (user.role === 'Admin' && user.isActive) {
      const adminCount = authReq.context.db.getActiveAdminCount();
      if (adminCount <= 1) {
        throw new BadRequestError('Cannot deactivate the last admin user');
      }
    }

    authReq.context.db.updateUser(id, { isActive: !user.isActive });

    logger.info('User status toggled', {
      adminId: authReq.user?.id,
      targetUserId: id,
      newStatus: !user.isActive
    });

    res.json({
      success: true,
      message: `User ${!user.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    throw error;
  }
});

export default router;
