import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { BadRequestError } from '../middleware/error-handler.js';
import { logger, logRAGOperation } from '../utils/logger.js';

const router = Router();

// Query validation rules
const queryValidation = [
  body('question').trim().isLength({ min: 5, max: 1000 }).withMessage('Question must be 5-1000 characters'),
  body('scope').optional().isArray().withMessage('Scope must be an array of document IDs'),
  body('topK').optional().isInt({ min: 1, max: 50 }).withMessage('topK must be between 1 and 50'),
  body('rerankTopK').optional().isInt({ min: 1, max: 20 }).withMessage('rerankTopK must be between 1 and 20'),
  body('enableReranking').optional().isBoolean().withMessage('enableReranking must be a boolean')
];

// POST /api/rag/ask
router.post('/ask', queryValidation, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const { question, scope, topK, rerankTopK, enableReranking } = req.body;

  const startTime = Date.now();

  try {
    logger.info('RAG query initiated', {
      userId: authReq.user?.id,
      question: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
      scope: scope?.length || 0,
      topK,
      rerankTopK,
      enableReranking
    });

    const result = await authReq.context.rag.query(question, scope, {
      topK,
      rerankTopK,
      enableReranking
    });

    const processingTime = Date.now() - startTime;

    logRAGOperation('query', {
      question: question.substring(0, 100),
      claimsFound: result.response.claims.length,
      chunksRetrieved: result.retrievedChunks.length,
      chunksReranked: result.rerankedChunks?.length || 0,
      overallConfidence: result.response.overallConfidence
    }, processingTime);

    res.json({
      success: true,
      result: {
        response: result.response,
        retrievedChunks: result.retrievedChunks.map(chunk => ({
          id: chunk.chunk.id,
          content: chunk.chunk.content.substring(0, 500) + '...',
          score: chunk.score,
          metadata: {
            sourcePathOrUrl: chunk.chunk.metadata.sourcePathOrUrl,
            page: chunk.chunk.metadata.page,
            lineStart: chunk.chunk.metadata.lineStart,
            lineEnd: chunk.chunk.metadata.lineEnd
          }
        })),
        rerankedChunks: result.rerankedChunks?.map(chunk => ({
          id: chunk.chunk.id,
          score: chunk.score,
          metadata: {
            sourcePathOrUrl: chunk.chunk.metadata.sourcePathOrUrl,
            page: chunk.chunk.metadata.page
          }
        })),
        processingTime: result.processingTime
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('RAG query failed', {
      userId: authReq.user?.id,
      question: question.substring(0, 100),
      error: error.message
    });
    throw error;
  }
});

// GET /api/rag/stats
router.get('/stats', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const stats = await authReq.context.rag.getDocumentStats();

    res.json({
      success: true,
      stats: {
        documentCount: stats.documentCount,
        chunkCount: stats.chunkCount,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get RAG stats', {
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

// GET /api/rag/documents/:documentId/chunks
router.get('/documents/:documentId/chunks', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const { documentId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const chunks = await authReq.context.rag.getDocumentChunks(documentId);
    
    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedChunks = chunks.slice(startIndex, endIndex);

    res.json({
      success: true,
      chunks: paginatedChunks.map(chunk => ({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        metadata: chunk.metadata
      })),
      pagination: {
        page,
        limit,
        total: chunks.length,
        totalPages: Math.ceil(chunks.length / limit),
        hasNext: endIndex < chunks.length,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    logger.error('Failed to get document chunks', {
      userId: authReq.user?.id,
      documentId,
      error: error.message
    });
    throw error;
  }
});

// POST /api/rag/validate-evidence
router.post('/validate-evidence', [
  body('evidencePointers').isArray().withMessage('Evidence pointers must be an array'),
  body('evidencePointers.*.sourcePathOrUrl').notEmpty().withMessage('Source path or URL is required'),
  body('evidencePointers.*.snippet').optional().isString().withMessage('Snippet must be a string')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError('Validation failed', errors.array());
  }

  const authReq = req as AuthenticatedRequest;
  const { evidencePointers } = req.body;

  try {
    const validationResults = [];

    for (const pointer of evidencePointers) {
      const result = {
        sourcePathOrUrl: pointer.sourcePathOrUrl,
        valid: false,
        exists: false,
        accessible: false,
        snippet: pointer.snippet,
        issues: [] as string[]
      };

      // Check if document exists in the knowledge base
      try {
        const stats = await authReq.context.rag.getDocumentStats();
        // This is a simplified check - in a real implementation,
        // you'd want to check if the specific document exists
        result.exists = stats.documentCount > 0;
        result.accessible = result.exists;
        
        if (!result.exists) {
          result.issues.push('Document not found in knowledge base');
        }

        if (pointer.page && (!Number.isInteger(pointer.page) || pointer.page < 1)) {
          result.issues.push('Invalid page number');
        }

        if (pointer.lineStart && pointer.lineEnd && pointer.lineStart > pointer.lineEnd) {
          result.issues.push('Invalid line range');
        }

        result.valid = result.exists && result.issues.length === 0;
      } catch (error) {
        result.issues.push(`Validation error: ${error.message}`);
      }

      validationResults.push(result);
    }

    res.json({
      success: true,
      validationResults,
      summary: {
        total: validationResults.length,
        valid: validationResults.filter(r => r.valid).length,
        invalid: validationResults.filter(r => !r.valid).length
      }
    });
  } catch (error) {
    logger.error('Evidence validation failed', {
      userId: authReq.user?.id,
      error: error.message
    });
    throw error;
  }
});

// DELETE /api/rag/documents/:documentId
router.delete('/documents/:documentId', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { documentId } = req.params;

  // Only facilitators and admins can delete documents
  if (!['Facilitator', 'Admin'].includes(authReq.user!.role)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Only facilitators and admins can delete documents'
    });
    return;
  }

  try {
    await authReq.context.rag.deleteDocument(documentId);

    logger.info('Document deleted from knowledge base', {
      userId: authReq.user?.id,
      documentId
    });

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete document', {
      userId: authReq.user?.id,
      documentId,
      error: error.message
    });
    throw error;
  }
});

export default router;
