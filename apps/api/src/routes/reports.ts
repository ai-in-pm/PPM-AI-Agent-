import { Router, Request, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// GET /api/reports/assessments/:id/executive-summary
router.get('/assessments/:id/executive-summary', [
  param('id').isUUID().withMessage('Invalid assessment ID'),
  query('format').optional().isIn(['pdf', 'docx']).withMessage('Format must be pdf or docx')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const format = req.query.format as string || 'pdf';

  try {
    const assessment = authReq.context.db.getAssessmentById(id);
    
    if (!assessment) {
      throw new NotFoundError('Assessment not found');
    }

    // Check access permissions
    const hasAccess = 
      authReq.user!.role === 'Admin' ||
      assessment.facilitatorId === authReq.user!.id ||
      assessment.teamMembers.includes(authReq.user!.id);

    if (!hasAccess) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this assessment'
      });
      return;
    }

    // Generate executive summary report
    const reportData = {
      assessment,
      generatedAt: new Date(),
      generatedBy: authReq.user!.fullName,
      reportType: 'executive-summary'
    };

    // This would be implemented in the reporters package
    const reportBuffer = await generateExecutiveSummary(reportData, format);

    const filename = `${assessment.name}_executive_summary_${new Date().toISOString().split('T')[0]}.${format}`;
    
    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(reportBuffer);

    logger.info('Executive summary generated', {
      assessmentId: id,
      format,
      userId: authReq.user?.id
    });
  } catch (error) {
    logger.error('Failed to generate executive summary', {
      assessmentId: id,
      format,
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

// GET /api/reports/assessments/:id/detailed-findings
router.get('/assessments/:id/detailed-findings', [
  param('id').isUUID().withMessage('Invalid assessment ID'),
  query('format').optional().isIn(['pdf', 'docx']).withMessage('Format must be pdf or docx')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const format = req.query.format as string || 'pdf';

  try {
    const assessment = authReq.context.db.getAssessmentById(id);
    
    if (!assessment) {
      throw new NotFoundError('Assessment not found');
    }

    // Check access permissions
    const hasAccess = 
      authReq.user!.role === 'Admin' ||
      assessment.facilitatorId === authReq.user!.id ||
      assessment.teamMembers.includes(authReq.user!.id);

    if (!hasAccess) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this assessment'
      });
      return;
    }

    const reportData = {
      assessment,
      generatedAt: new Date(),
      generatedBy: authReq.user!.fullName,
      reportType: 'detailed-findings'
    };

    const reportBuffer = await generateDetailedFindings(reportData, format);

    const filename = `${assessment.name}_detailed_findings_${new Date().toISOString().split('T')[0]}.${format}`;
    
    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(reportBuffer);

    logger.info('Detailed findings report generated', {
      assessmentId: id,
      format,
      userId: authReq.user?.id
    });
  } catch (error) {
    logger.error('Failed to generate detailed findings report', {
      assessmentId: id,
      format,
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

// GET /api/reports/assessments/:id/cap-register
router.get('/assessments/:id/cap-register', [
  param('id').isUUID().withMessage('Invalid assessment ID'),
  query('format').optional().isIn(['pdf', 'docx', 'xlsx']).withMessage('Format must be pdf, docx, or xlsx')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const format = req.query.format as string || 'xlsx';

  try {
    const assessment = authReq.context.db.getAssessmentById(id);
    
    if (!assessment) {
      throw new NotFoundError('Assessment not found');
    }

    // Check access permissions
    const hasAccess = 
      authReq.user!.role === 'Admin' ||
      assessment.facilitatorId === authReq.user!.id ||
      assessment.teamMembers.includes(authReq.user!.id);

    if (!hasAccess) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this assessment'
      });
      return;
    }

    const reportData = {
      assessment,
      generatedAt: new Date(),
      generatedBy: authReq.user!.fullName,
      reportType: 'cap-register'
    };

    const reportBuffer = await generateCAPRegister(reportData, format);

    const filename = `${assessment.name}_cap_register_${new Date().toISOString().split('T')[0]}.${format}`;
    
    let contentType: string;
    switch (format) {
      case 'pdf':
        contentType = 'application/pdf';
        break;
      case 'docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xlsx':
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      default:
        contentType = 'application/octet-stream';
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(reportBuffer);

    logger.info('CAP register generated', {
      assessmentId: id,
      format,
      userId: authReq.user?.id
    });
  } catch (error) {
    logger.error('Failed to generate CAP register', {
      assessmentId: id,
      format,
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

// Placeholder functions for report generation
// These would be implemented in the reporters package
async function generateExecutiveSummary(data: any, format: string): Promise<Buffer> {
  // Placeholder implementation
  const content = `Executive Summary for ${data.assessment.name}\n\nGenerated on: ${data.generatedAt}\nGenerated by: ${data.generatedBy}`;
  return Buffer.from(content, 'utf-8');
}

async function generateDetailedFindings(data: any, format: string): Promise<Buffer> {
  // Placeholder implementation
  const content = `Detailed Findings for ${data.assessment.name}\n\nGenerated on: ${data.generatedAt}\nGenerated by: ${data.generatedBy}`;
  return Buffer.from(content, 'utf-8');
}

async function generateCAPRegister(data: any, format: string): Promise<Buffer> {
  // Placeholder implementation
  const content = `CAP Register for ${data.assessment.name}\n\nGenerated on: ${data.generatedAt}\nGenerated by: ${data.generatedBy}`;
  return Buffer.from(content, 'utf-8');
}

export default router;
