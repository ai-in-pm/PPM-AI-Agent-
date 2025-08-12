/**
 * IP2M METRR Copilot Document Indexer
 * 
 * This module provides document ingestion and indexing capabilities
 * for the IP2M METRR assessment system.
 */

import { DocumentProcessor } from './processors/DocumentProcessor.js';
import { VectorStore } from '@ip2m/rag';
import { logger } from './utils/logger.js';

export interface IndexerConfig {
  corpusPath: string;
  vectorStorePath: string;
  chunkSize: number;
  chunkOverlap: number;
  supportedFormats: string[];
}

export class DocumentIndexer {
  private processor: DocumentProcessor;
  private vectorStore: VectorStore;
  private config: IndexerConfig;

  constructor(config: IndexerConfig) {
    this.config = config;
    this.processor = new DocumentProcessor(config);
    this.vectorStore = new VectorStore({
      dbPath: config.vectorStorePath,
      embeddingDimension: 384
    });
  }

  async indexDocument(filePath: string): Promise<void> {
    try {
      logger.info(`Starting indexing for: ${filePath}`);
      
      const chunks = await this.processor.processDocument(filePath);
      await this.vectorStore.addChunks(chunks);
      
      logger.info(`Successfully indexed ${chunks.length} chunks from ${filePath}`);
    } catch (error) {
      logger.error(`Failed to index document ${filePath}:`, error);
      throw error;
    }
  }

  async indexDirectory(directoryPath: string): Promise<void> {
    // Implementation for batch directory indexing
    logger.info(`Indexing directory: ${directoryPath}`);
    // TODO: Implement directory traversal and batch processing
  }
}

export * from './processors/DocumentProcessor.js';
export * from './utils/logger.js';
