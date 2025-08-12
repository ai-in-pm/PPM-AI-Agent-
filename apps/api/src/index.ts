import dotenv from 'dotenv';
import path from 'path';
import { IP2MDatabase } from '@ip2m/core';
import { RAGPipeline } from '@ip2m/rag';
import { startServer, AppConfig, AppContext } from './app.js';
import { logger } from './utils/logger.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function main() {
  try {
    // Configuration
    const config: AppConfig = {
      port: parseInt(process.env.API_PORT || '4317'),
      host: process.env.API_HOST || 'localhost',
      jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-change-in-production',
      sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
      dbPath: process.env.DB_PATH || './data/db/ip2m.sqlite',
      corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      }
    };

    // Validate required environment variables
    if (config.jwtSecret === 'your-jwt-secret-change-in-production') {
      logger.warn('Using default JWT secret - change this in production!');
    }

    // Initialize database
    logger.info('Initializing database...');
    const database = new IP2MDatabase({
      path: config.dbPath,
      enableWAL: true,
      enableForeignKeys: true,
      busyTimeout: 30000
    });

    // Initialize RAG pipeline
    logger.info('Initializing RAG pipeline...');
    const ragConfig = {
      ollama: {
        baseUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
        generalModel: process.env.OLLAMA_MODEL_GENERAL || 'llama3.1:8b',
        coderModel: process.env.OLLAMA_MODEL_CODER || 'qwen2.5-coder:7b',
        embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'bge-small-en',
        rerankerModel: process.env.OLLAMA_RERANKER_MODEL || 'bge-reranker-base',
        temperature: parseFloat(process.env.TEMPERATURE || '0.2'),
        topP: parseFloat(process.env.TOP_P || '0.8'),
        maxRetries: parseInt(process.env.MAX_RETRIES || '3')
      },
      vectorStore: {
        dbPath: process.env.VECTOR_DB_PATH || './data/db/vectors.sqlite',
        embeddingDimension: 384 // bge-small-en dimension
      },
      chunking: {
        chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
        chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
        preserveStructure: true,
        minChunkSize: 100
      },
      retrieval: {
        topK: parseInt(process.env.RETRIEVAL_TOP_K || '12'),
        rerankTopK: parseInt(process.env.RERANK_TOP_K || '6'),
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.1'),
        enableReranking: process.env.ENABLE_RERANKING !== 'false'
      }
    };

    const rag = new RAGPipeline(ragConfig);

    // Create application context
    const context: AppContext = {
      db: database,
      rag,
      config
    };

    // Create default admin user if none exists
    await createDefaultAdminUser(database);

    // Start server
    logger.info('Starting server...');
    await startServer(context);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function createDefaultAdminUser(db: IP2MDatabase): Promise<void> {
  try {
    // Check if any admin users exist
    const adminExists = db.getUserByUsername('admin');
    
    if (!adminExists) {
      logger.info('Creating default admin user...');
      
      const bcrypt = await import('bcryptjs');
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!';
      const passwordHash = await bcrypt.hash(defaultPassword, 12);

      const adminUser = {
        username: 'admin',
        email: 'admin@ip2m-copilot.local',
        fullName: 'System Administrator',
        role: 'Admin' as const,
        isActive: true,
        passwordHash,
        failedLoginAttempts: 0
      };

      const adminId = db.createUser(adminUser);
      
      logger.info('Default admin user created', { 
        userId: adminId, 
        username: 'admin',
        defaultPassword: defaultPassword === 'Admin123!' ? 'Admin123!' : '[custom]'
      });

      if (defaultPassword === 'Admin123!') {
        logger.warn('Using default admin password - change this immediately!');
      }
    }
  } catch (error) {
    logger.error('Failed to create default admin user:', error);
    throw error;
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  logger.error('Application startup failed:', error);
  process.exit(1);
});
