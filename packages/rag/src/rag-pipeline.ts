import { OllamaClient, OllamaConfig, EvidenceTracedResponse } from './ollama-client.js';
import { DocumentProcessor, DocumentChunk, ProcessingResult } from './document-processor.js';
import { VectorStore, VectorStoreConfig, VectorSearchResult } from './vector-store.js';
import { EvidencePointer } from '@ip2m/core';

export interface RAGConfig {
  ollama: OllamaConfig;
  vectorStore: VectorStoreConfig;
  chunking: {
    chunkSize: number;
    chunkOverlap: number;
    preserveStructure: boolean;
    minChunkSize: number;
  };
  retrieval: {
    topK: number;
    rerankTopK: number;
    confidenceThreshold: number;
    enableReranking: boolean;
  };
}

export interface RAGQueryResult {
  response: EvidenceTracedResponse;
  retrievedChunks: VectorSearchResult[];
  rerankedChunks?: VectorSearchResult[];
  processingTime: {
    retrieval: number;
    reranking?: number;
    generation: number;
    total: number;
  };
}

export interface IngestionResult {
  documentId: string;
  chunksProcessed: number;
  embeddingsGenerated: number;
  processingTime: number;
  metadata: ProcessingResult['metadata'];
}

export class RAGPipeline {
  private ollama: OllamaClient;
  private processor: DocumentProcessor;
  private vectorStore: VectorStore;
  private config: RAGConfig;

  constructor(config: RAGConfig) {
    this.config = config;
    this.ollama = new OllamaClient(config.ollama);
    this.processor = new DocumentProcessor(config.chunking);
    this.vectorStore = new VectorStore(config.vectorStore);
  }

  async initialize(): Promise<void> {
    const isOllamaAvailable = await this.ollama.isAvailable();
    if (!isOllamaAvailable) {
      throw new Error('Ollama is not available. Please ensure Ollama is running.');
    }

    await this.ollama.ensureModelsAvailable();
    console.log('RAG Pipeline initialized successfully');
  }

  async ingestFile(filePath: string): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      // Process the document
      const processingResult = await this.processor.processFile(filePath);
      
      // Generate embeddings for all chunks
      const chunks = processingResult.chunks;
      const texts = chunks.map(chunk => chunk.content);
      
      console.log(`Generating embeddings for ${chunks.length} chunks...`);
      const embeddings = await this.ollama.generateEmbeddings(texts);
      
      // Add embeddings to chunks
      for (let i = 0; i < chunks.length; i++) {
        chunks[i].embedding = embeddings[i].embedding;
      }

      // Store in vector database
      await this.vectorStore.addChunks(chunks);

      const processingTime = Date.now() - startTime;

      return {
        documentId: processingResult.documentId,
        chunksProcessed: chunks.length,
        embeddingsGenerated: embeddings.length,
        processingTime,
        metadata: processingResult.metadata
      };
    } catch (error) {
      console.error('Error ingesting file:', error);
      throw new Error(`Failed to ingest file ${filePath}: ${error}`);
    }
  }

  async ingestURL(url: string, content: string): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      const processingResult = await this.processor.processURL(url, content);
      
      const chunks = processingResult.chunks;
      const texts = chunks.map(chunk => chunk.content);
      
      console.log(`Generating embeddings for ${chunks.length} chunks from URL...`);
      const embeddings = await this.ollama.generateEmbeddings(texts);
      
      for (let i = 0; i < chunks.length; i++) {
        chunks[i].embedding = embeddings[i].embedding;
      }

      await this.vectorStore.addChunks(chunks);

      const processingTime = Date.now() - startTime;

      return {
        documentId: processingResult.documentId,
        chunksProcessed: chunks.length,
        embeddingsGenerated: embeddings.length,
        processingTime,
        metadata: processingResult.metadata
      };
    } catch (error) {
      console.error('Error ingesting URL:', error);
      throw new Error(`Failed to ingest URL ${url}: ${error}`);
    }
  }

  async query(
    question: string,
    scope?: string[],
    options?: {
      topK?: number;
      rerankTopK?: number;
      enableReranking?: boolean;
    }
  ): Promise<RAGQueryResult> {
    const startTime = Date.now();
    const retrievalStart = Date.now();

    try {
      // Generate query embedding
      const queryEmbedding = await this.ollama.generateEmbedding(question);
      
      // Retrieve relevant chunks
      const topK = options?.topK || this.config.retrieval.topK;
      const retrievedChunks = await this.vectorStore.searchSimilar(
        queryEmbedding.embedding,
        topK,
        scope
      );

      const retrievalTime = Date.now() - retrievalStart;

      // Filter by confidence threshold
      const filteredChunks = retrievedChunks.filter(
        result => result.score >= this.config.retrieval.confidenceThreshold
      );

      if (filteredChunks.length === 0) {
        return {
          response: {
            claims: [],
            summary: "No relevant evidence found for the query",
            overallConfidence: 0,
            evidenceGaps: ["Insufficient relevant documents in knowledge base"]
          },
          retrievedChunks: [],
          processingTime: {
            retrieval: retrievalTime,
            generation: 0,
            total: Date.now() - startTime
          }
        };
      }

      // Reranking (optional)
      let rerankedChunks: VectorSearchResult[] | undefined;
      let rerankingTime: number | undefined;

      const enableReranking = options?.enableReranking ?? this.config.retrieval.enableReranking;
      if (enableReranking) {
        const rerankStart = Date.now();
        const rerankTopK = options?.rerankTopK || this.config.retrieval.rerankTopK;
        
        const documentsToRerank = filteredChunks.map(result => ({
          id: result.chunk.id,
          content: result.chunk.content,
          score: result.score
        }));

        const rerankedDocs = await this.ollama.rerank(question, documentsToRerank, rerankTopK);
        
        rerankedChunks = rerankedDocs.map(doc => {
          const originalChunk = filteredChunks.find(c => c.chunk.id === doc.id)!;
          return {
            ...originalChunk,
            score: doc.score
          };
        });

        rerankingTime = Date.now() - rerankStart;
      }

      // Prepare context for generation
      const contextChunks = rerankedChunks || filteredChunks;
      const context = this.buildContext(contextChunks);

      // Generate evidence-traced response
      const generationStart = Date.now();
      const response = await this.ollama.generateEvidenceTracedResponse(question, context);
      const generationTime = Date.now() - generationStart;

      // Enhance evidence pointers with chunk metadata
      this.enhanceEvidencePointers(response, contextChunks);

      return {
        response,
        retrievedChunks: filteredChunks,
        rerankedChunks,
        processingTime: {
          retrieval: retrievalTime,
          reranking: rerankingTime,
          generation: generationTime,
          total: Date.now() - startTime
        }
      };
    } catch (error) {
      console.error('Error processing query:', error);
      throw new Error(`Failed to process query: ${error}`);
    }
  }

  private buildContext(chunks: VectorSearchResult[]): string {
    return chunks
      .map((result, index) => {
        const chunk = result.chunk;
        const metadata = chunk.metadata;
        
        return `[Source ${index + 1}] ${metadata.sourcePathOrUrl}${metadata.page ? ` (Page ${metadata.page})` : ''}${metadata.lineStart ? ` (Lines ${metadata.lineStart}-${metadata.lineEnd})` : ''}
Score: ${result.score.toFixed(3)}
Content: ${chunk.content}
---`;
      })
      .join('\n\n');
  }

  private enhanceEvidencePointers(
    response: EvidenceTracedResponse,
    contextChunks: VectorSearchResult[]
  ): void {
    for (const claim of response.claims) {
      for (const evidencePointer of claim.evidencePointers) {
        // Find matching chunk based on source path
        const matchingChunk = contextChunks.find(
          result => result.chunk.metadata.sourcePathOrUrl === evidencePointer.sourcePathOrUrl
        );

        if (matchingChunk) {
          const chunk = matchingChunk.chunk;
          const metadata = chunk.metadata;

          // Enhance with more precise location information
          if (!evidencePointer.page && metadata.page) {
            evidencePointer.page = metadata.page;
          }
          if (!evidencePointer.lineStart && metadata.lineStart) {
            evidencePointer.lineStart = metadata.lineStart;
            evidencePointer.lineEnd = metadata.lineEnd;
          }

          // Add snippet if not present
          if (!evidencePointer.snippet && chunk.content) {
            evidencePointer.snippet = chunk.content.substring(0, 200) + '...';
          }
        }
      }
    }
  }

  async getDocumentStats(): Promise<{
    documentCount: number;
    chunkCount: number;
  }> {
    const documentCount = await this.vectorStore.getDocumentCount();
    const chunkCount = await this.vectorStore.getChunkCount();
    
    return { documentCount, chunkCount };
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.vectorStore.deleteDocument(documentId);
  }

  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    return await this.vectorStore.getChunksByDocumentId(documentId);
  }

  close(): void {
    this.vectorStore.close();
  }
}
