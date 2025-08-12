import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import ConnectSQLite from 'connect-sqlite3';
import { IP2MDatabase } from '@ip2m/core';
import { RAGPipeline } from '@ip2m/rag';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { logger } from './utils/logger.js';

// Route imports
import authRoutes from './routes/auth.js';
import assessmentRoutes from './routes/assessments.js';
import ragRoutes from './routes/rag.js';
import ingestRoutes from './routes/ingest.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';

export interface AppConfig {
  port: number;
  host: string;
  jwtSecret: string;
  sessionSecret: string;
  dbPath: string;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export interface AppContext {
  db: IP2MDatabase;
  rag: RAGPipeline;
  config: AppConfig;
}

export function createApp(context: AppContext): express.Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false
  }));

  // CORS configuration
  app.use(cors({
    origin: context.config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: context.config.rateLimit.windowMs,
    max: context.config.rateLimit.max,
    message: {
      error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Body parsing and compression
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Session configuration
  const SQLiteStore = ConnectSQLite(session);
  app.use(session({
    store: new SQLiteStore({
      db: 'sessions.db',
      dir: './data/db'
    }),
    secret: context.config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
  }));

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id
    });
    next();
  });

  // Attach context to requests
  app.use((req, res, next) => {
    (req as any).context = context;
    next();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0'
    });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  
  // Protected routes (require authentication)
  app.use('/api/assessments', authMiddleware, auditMiddleware, assessmentRoutes);
  app.use('/api/rag', authMiddleware, auditMiddleware, ragRoutes);
  app.use('/api/ingest', authMiddleware, auditMiddleware, ingestRoutes);
  app.use('/api/reports', authMiddleware, auditMiddleware, reportRoutes);
  app.use('/api/admin', authMiddleware, auditMiddleware, adminRoutes);

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}

export async function startServer(context: AppContext): Promise<void> {
  const app = createApp(context);

  // Initialize RAG pipeline
  try {
    await context.rag.initialize();
    logger.info('RAG pipeline initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize RAG pipeline:', error);
    throw error;
  }

  // Start server
  const server = app.listen(context.config.port, context.config.host, () => {
    logger.info(`Server running on http://${context.config.host}:${context.config.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      context.db.close();
      context.rag.close();
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      context.db.close();
      context.rag.close();
      process.exit(0);
    });
  });
}
