import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { AssessmentSchema, AssessmentState, ASSESSMENT_STATES } from '@ip2m/core';
import { AuthenticatedRequest, requireFacilitatorOrAdmin } from '../middleware/auth.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Assessment creation validation
const createAssessmentValidation = [
  body('name').trim().isLength({ min: 3, max: 200 }).withMessage('Name must be 3-200 characters'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be 10-2000 characters'),
  body('organizationName').trim().isLength({ min: 2, max: 200 }).withMessage('Organization name must be 2-200 characters'),
  body('contractNumber').optional().trim().isLength({ max: 100 }).withMessage('Contract number must be less than 100 characters'),
  body('assessmentType').isIn(['initial', 'surveillance', 'closeout']).withMessage('Invalid assessment type'),
  body('facilitatorId').isUUID().withMessage('Valid facilitator ID is required'),
  body('teamMembers').isArray().withMessage('Team members must be an array'),
  body('scopeDocuments').optional().isArray().withMessage('Scope documents must be an array')
];

// State transition validation
const stateTransitionValidation = [
  body('newState').isIn(ASSESSMENT_STATES).withMessage('Invalid assessment state'),
  body('approvalNotes').optional().trim().isLength({ max: 1000 }).withMessage('Approval notes must be less than 1000 characters')
];

// POST /api/assessments
router.post('/', createAssessmentValidation, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  
  // Only facilitators and admins can create assessments
  if (!['Facilitator', 'Admin'].includes(authReq.user!.role)) {
    throw new ForbiddenError('Only facilitators and admins can create assessments');
  }

  const {
    name,
    description,
    organizationName,
    contractNumber,
    assessmentType,
    facilitatorId,
    teamMembers,
    scopeDocuments
  } = req.body;

  try {
    // Verify facilitator exists
    const facilitator = authReq.context.db.getUserById(facilitatorId);
    if (!facilitator || !['Facilitator', 'Admin'].includes(facilitator.role)) {
      throw new BadRequestError('Invalid facilitator ID');
    }

    // Verify team members exist
    for (const memberId of teamMembers) {
      const member = authReq.context.db.getUserById(memberId);
      if (!member) {
        throw new BadRequestError(`Team member ${memberId} not found`);
      }
    }

    const assessmentData = {
      name,
      description,
      organizationName,
      contractNumber,
      assessmentType,
      state: 'SCOPING' as AssessmentState,
      createdBy: authReq.user!.id,
      facilitatorId,
      teamMembers,
      scopeDocuments: scopeDocuments || []
    };

    const assessmentId = authReq.context.db.createAssessment(assessmentData);

    logger.info('Assessment created', {
      assessmentId,
      name,
      organizationName,
      createdBy: authReq.user!.id,
      facilitatorId
    });

    res.status(201).json({
      success: true,
      message: 'Assessment created successfully',
      assessment: {
        id: assessmentId,
        ...assessmentData,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    throw error;
  }
});

// GET /api/assessments
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('state').optional().isIn(ASSESSMENT_STATES).withMessage('Invalid state filter'),
  query('facilitatorId').optional().isUUID().withMessage('Invalid facilitator ID')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const state = req.query.state as AssessmentState;
  const facilitatorId = req.query.facilitatorId as string;

  try {
    // Get assessments based on user role and filters
    const assessments = authReq.context.db.getAssessments({
      page,
      limit,
      state,
      facilitatorId,
      userId: authReq.user!.role === 'Viewer' ? authReq.user!.id : undefined
    });

    res.json({
      success: true,
      assessments: assessments.items,
      pagination: {
        page,
        limit,
        total: assessments.total,
        totalPages: Math.ceil(assessments.total / limit),
        hasNext: page * limit < assessments.total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    throw error;
  }
});

// GET /api/assessments/:id
router.get('/:id', [
  param('id').isUUID().withMessage('Invalid assessment ID')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;

  try {
    const assessment = authReq.context.db.getAssessmentById(id);
    
    if (!assessment) {
      throw new NotFoundError('Assessment not found');
    }

    // Check access permissions
    const hasAccess = 
      authReq.user!.role === 'Admin' ||
      assessment.facilitatorId === authReq.user!.id ||
      assessment.teamMembers.includes(authReq.user!.id) ||
      assessment.createdBy === authReq.user!.id;

    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this assessment');
    }

    res.json({
      success: true,
      assessment
    });
  } catch (error) {
    throw error;
  }
});

// POST /api/assessments/:id/advance
router.post('/:id/advance', [
  param('id').isUUID().withMessage('Invalid assessment ID'),
  ...stateTransitionValidation
], requireFacilitatorOrAdmin, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { newState, approvalNotes } = req.body;

  try {
    const assessment = authReq.context.db.getAssessmentById(id);
    
    if (!assessment) {
      throw new NotFoundError('Assessment not found');
    }

    // Check if user can advance this assessment
    const canAdvance = 
      authReq.user!.role === 'Admin' ||
      assessment.facilitatorId === authReq.user!.id;

    if (!canAdvance) {
      throw new ForbiddenError('Only the facilitator or admin can advance assessment state');
    }

    // Validate state transition
    const validTransitions = getValidStateTransitions(assessment.state);
    if (!validTransitions.includes(newState)) {
      throw new BadRequestError(`Cannot transition from ${assessment.state} to ${newState}`);
    }

    // Perform state-specific validations
    await validateStateTransition(assessment, newState, authReq.context);

    // Update assessment state
    authReq.context.db.updateAssessmentState(id, newState, authReq.user!.id);

    logger.info('Assessment state advanced', {
      assessmentId: id,
      fromState: assessment.state,
      toState: newState,
      approvedBy: authReq.user!.id,
      approvalNotes
    });

    res.json({
      success: true,
      message: `Assessment advanced to ${newState}`,
      assessment: {
        ...assessment,
        state: newState,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    throw error;
  }
});

// Helper function to get valid state transitions
function getValidStateTransitions(currentState: AssessmentState): AssessmentState[] {
  const transitions: Record<AssessmentState, AssessmentState[]> = {
    'SCOPING': ['EVIDENCE_COLLECTION', 'CANCELLED'],
    'EVIDENCE_COLLECTION': ['INTERVIEWS', 'SCOPING', 'CANCELLED'],
    'INTERVIEWS': ['DRAFT_SCORING', 'EVIDENCE_COLLECTION', 'CANCELLED'],
    'DRAFT_SCORING': ['HIL_REVIEW', 'INTERVIEWS', 'CANCELLED'],
    'HIL_REVIEW': ['REMEDIATION_PLAN', 'DRAFT_SCORING', 'CANCELLED'],
    'REMEDIATION_PLAN': ['FINAL_REPORT', 'HIL_REVIEW', 'CANCELLED'],
    'FINAL_REPORT': ['COMPLETED', 'REMEDIATION_PLAN', 'CANCELLED'],
    'COMPLETED': ['CANCELLED'], // Only allow cancellation of completed assessments
    'CANCELLED': [] // No transitions from cancelled state
  };

  return transitions[currentState] || [];
}

// Helper function to validate state transitions
async function validateStateTransition(
  assessment: any,
  newState: AssessmentState,
  context: any
): Promise<void> {
  switch (newState) {
    case 'EVIDENCE_COLLECTION':
      // Ensure scope is properly defined
      if (!assessment.scopeDocuments || assessment.scopeDocuments.length === 0) {
        throw new BadRequestError('Cannot advance to evidence collection without scope documents');
      }
      break;

    case 'INTERVIEWS':
      // Ensure some evidence has been collected
      const stats = await context.rag.getDocumentStats();
      if (stats.documentCount === 0) {
        throw new BadRequestError('Cannot advance to interviews without evidence documents');
      }
      break;

    case 'DRAFT_SCORING':
      // Ensure interviews are documented (simplified check)
      if (assessment.findings.length === 0) {
        throw new BadRequestError('Cannot advance to scoring without documented findings');
      }
      break;

    case 'HIL_REVIEW':
      // Ensure scorecard is populated
      if (assessment.scorecard.length === 0) {
        throw new BadRequestError('Cannot advance to review without draft scores');
      }
      break;

    case 'REMEDIATION_PLAN':
      // Ensure scores are approved
      const unapprovedScores = assessment.scorecard.filter((entry: any) => entry.status !== 'approved');
      if (unapprovedScores.length > 0) {
        throw new BadRequestError('Cannot advance to remediation planning with unapproved scores');
      }
      break;

    case 'FINAL_REPORT':
      // Ensure action items are defined
      if (assessment.actionItems.length === 0) {
        throw new BadRequestError('Cannot advance to final report without action items');
      }
      break;

    case 'COMPLETED':
      // Ensure all action items are addressed
      const pendingActions = assessment.actionItems.filter((item: any) => 
        !['completed', 'cancelled'].includes(item.status)
      );
      if (pendingActions.length > 0) {
        throw new BadRequestError('Cannot complete assessment with pending action items');
      }
      break;
  }
}

export default router;
