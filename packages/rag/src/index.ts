// Main RAG Pipeline
export * from './rag-pipeline.js';

// Ollama Integration
export * from './ollama-client.js';

// Document Processing
export * from './document-processor.js';

// Vector Store
export * from './vector-store.js';

// Re-export key types for convenience
export type {
  RAGConfig,
  RAGQueryResult,
  IngestionResult
} from './rag-pipeline.js';

export type {
  OllamaConfig,
  EvidenceTracedResponse,
  EmbeddingResult,
  GenerationResult
} from './ollama-client.js';

export type {
  DocumentChunk,
  ProcessingResult,
  ChunkingConfig
} from './document-processor.js';

export type {
  VectorStoreConfig,
  SearchResult,
  VectorDocument
} from './vector-store.js';
