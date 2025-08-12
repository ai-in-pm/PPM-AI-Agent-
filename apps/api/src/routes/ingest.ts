import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { body, validationResult } from 'express-validator';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { BadRequestError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'data', 'corpus', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${timestamp}_${sanitizedName}${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['.pdf', '.docx', '.xlsx', '.csv', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} not supported. Allowed types: ${allowedTypes.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10 // Maximum 10 files per request
  }
});

// POST /api/ingest/file
router.post('/file', upload.single('file'), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  // Only facilitators and admins can ingest files
  if (!['Facilitator', 'Admin'].includes(authReq.user!.role)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Only facilitators and admins can ingest documents'
    });
    return;
  }

  if (!req.file) {
    throw new BadRequestError('No file uploaded');
  }

  const startTime = Date.now();

  try {
    logger.info('File ingestion started', {
      userId: authReq.user?.id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });

    const result = await authReq.context.rag.ingestFile(req.file.path);

    const processingTime = Date.now() - startTime;

    logger.info('File ingestion completed', {
      userId: authReq.user?.id,
      documentId: result.documentId,
      fileName: req.file.originalname,
      chunksProcessed: result.chunksProcessed,
      embeddingsGenerated: result.embeddingsGenerated,
      processingTime
    });

    res.json({
      success: true,
      message: 'File ingested successfully',
      result: {
        documentId: result.documentId,
        fileName: req.file.originalname,
        chunksProcessed: result.chunksProcessed,
        embeddingsGenerated: result.embeddingsGenerated,
        processingTime: result.processingTime,
        metadata: result.metadata
      }
    });
  } catch (error) {
    logger.error('File ingestion failed', {
      userId: authReq.user?.id,
      fileName: req.file.originalname,
      error: error.message
    });

    // Clean up uploaded file on error
    try {
      await fs.unlink(req.file.path);
    } catch (unlinkError) {
      logger.error('Failed to clean up uploaded file', { path: req.file.path });
    }

    throw error;
  }
});

// POST /api/ingest/files (multiple files)
router.post('/files', upload.array('files', 10), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!['Facilitator', 'Admin'].includes(authReq.user!.role)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Only facilitators and admins can ingest documents'
    });
    return;
  }

  const files = req.files as Express.Multer.File[];
  
  if (!files || files.length === 0) {
    throw new BadRequestError('No files uploaded');
  }

  const startTime = Date.now();
  const results = [];
  const errors = [];

  try {
    logger.info('Batch file ingestion started', {
      userId: authReq.user?.id,
      fileCount: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0)
    });

    // Process files sequentially to avoid overwhelming the system
    for (const file of files) {
      try {
        const result = await authReq.context.rag.ingestFile(file.path);
        
        results.push({
          fileName: file.originalname,
          documentId: result.documentId,
          chunksProcessed: result.chunksProcessed,
          embeddingsGenerated: result.embeddingsGenerated,
          processingTime: result.processingTime,
          success: true
        });

        logger.info('File processed in batch', {
          fileName: file.originalname,
          documentId: result.documentId
        });
      } catch (error) {
        errors.push({
          fileName: file.originalname,
          error: error.message,
          success: false
        });

        logger.error('File failed in batch', {
          fileName: file.originalname,
          error: error.message
        });

        // Clean up failed file
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          logger.error('Failed to clean up file', { path: file.path });
        }
      }
    }

    const totalProcessingTime = Date.now() - startTime;

    logger.info('Batch file ingestion completed', {
      userId: authReq.user?.id,
      totalFiles: files.length,
      successful: results.length,
      failed: errors.length,
      totalProcessingTime
    });

    res.json({
      success: true,
      message: `Processed ${results.length} of ${files.length} files successfully`,
      results,
      errors,
      summary: {
        totalFiles: files.length,
        successful: results.length,
        failed: errors.length,
        totalChunks: results.reduce((sum, r) => sum + r.chunksProcessed, 0),
        totalEmbeddings: results.reduce((sum, r) => sum + r.embeddingsGenerated, 0),
        totalProcessingTime
      }
    });
  } catch (error) {
    logger.error('Batch file ingestion failed', {
      userId: authReq.user?.id,
      error: error.message
    });

    // Clean up all uploaded files on critical error
    for (const file of files) {
      try {
        await fs.unlink(file.path);
      } catch (unlinkError) {
        logger.error('Failed to clean up file', { path: file.path });
      }
    }

    throw error;
  }
});

// POST /api/ingest/url
router.post('/url', [
  body('url').isURL().withMessage('Valid URL is required'),
  body('content').trim().isLength({ min: 10 }).withMessage('Content must be at least 10 characters'),
  body('title').optional().trim().isLength({ max: 200 }).withMessage('Title must be less than 200 characters')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  
  if (!['Facilitator', 'Admin'].includes(authReq.user!.role)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Only facilitators and admins can ingest content'
    });
    return;
  }

  const { url, content, title } = req.body;
  const startTime = Date.now();

  try {
    logger.info('URL content ingestion started', {
      userId: authReq.user?.id,
      url,
      contentLength: content.length,
      title
    });

    const result = await authReq.context.rag.ingestURL(url, content);

    const processingTime = Date.now() - startTime;

    logger.info('URL content ingestion completed', {
      userId: authReq.user?.id,
      documentId: result.documentId,
      url,
      chunksProcessed: result.chunksProcessed,
      embeddingsGenerated: result.embeddingsGenerated,
      processingTime
    });

    res.json({
      success: true,
      message: 'URL content ingested successfully',
      result: {
        documentId: result.documentId,
        url,
        title,
        chunksProcessed: result.chunksProcessed,
        embeddingsGenerated: result.embeddingsGenerated,
        processingTime: result.processingTime,
        metadata: result.metadata
      }
    });
  } catch (error) {
    logger.error('URL content ingestion failed', {
      userId: authReq.user?.id,
      url,
      error: error.message
    });
    throw error;
  }
});

// GET /api/ingest/status
router.get('/status', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const stats = await authReq.context.rag.getDocumentStats();
    
    // Get recent ingestion activity from audit logs
    // This is a simplified version - in production you'd want more sophisticated tracking
    
    res.json({
      success: true,
      status: {
        documentsIngested: stats.documentCount,
        chunksProcessed: stats.chunkCount,
        lastUpdated: new Date().toISOString(),
        systemStatus: 'operational'
      }
    });
  } catch (error) {
    logger.error('Failed to get ingestion status', {
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

export default router;
