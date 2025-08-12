import Database from 'better-sqlite3';
import { DocumentChunk } from './document-processor.js';

export interface VectorSearchResult {
  chunk: DocumentChunk;
  score: number;
  distance: number;
}

export interface VectorStoreConfig {
  dbPath: string;
  embeddingDimension: number;
  enableWAL?: boolean;
}

export class VectorStore {
  private db: Database.Database;
  private config: VectorStoreConfig;

  constructor(config: VectorStoreConfig) {
    this.config = config;
    this.db = new Database(config.dbPath);
    
    if (config.enableWAL !== false) {
      this.db.pragma('journal_mode = WAL');
    }
    
    this.initializeTables();
    this.loadVectorExtension();
  }

  private initializeTables(): void {
    // Create embeddings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_embeddings (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_document_id ON document_embeddings(document_id);
      CREATE INDEX IF NOT EXISTS idx_chunk_index ON document_embeddings(document_id, chunk_index);
    `);
  }

  private loadVectorExtension(): void {
    try {
      // Try to load sqlite-vec extension for better vector search
      this.db.loadExtension('vec0');
      
      // Create vector table if extension is available
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
          id TEXT PRIMARY KEY,
          embedding float[${this.config.embeddingDimension}]
        )
      `);
    } catch (error) {
      console.warn('sqlite-vec not available, falling back to basic similarity search');
    }
  }

  async addChunks(chunks: DocumentChunk[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO document_embeddings 
      (id, document_id, chunk_index, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertVecStmt = this.db.prepare(`
      INSERT OR REPLACE INTO vec_embeddings (id, embedding) VALUES (?, ?)
    `).bind();

    const transaction = this.db.transaction((chunks: DocumentChunk[]) => {
      for (const chunk of chunks) {
        const embeddingBlob = chunk.embedding 
          ? Buffer.from(new Float32Array(chunk.embedding).buffer)
          : null;

        insertStmt.run(
          chunk.id,
          chunk.documentId,
          chunk.chunkIndex,
          chunk.content,
          embeddingBlob,
          JSON.stringify(chunk.metadata)
        );

        // Also insert into vector table if available and embedding exists
        if (chunk.embedding) {
          try {
            insertVecStmt.run(chunk.id, JSON.stringify(chunk.embedding));
          } catch (error) {
            // Vector table might not be available
          }
        }
      }
    });

    transaction(chunks);
  }

  async searchSimilar(
    queryEmbedding: number[],
    topK: number = 10,
    documentIds?: string[]
  ): Promise<VectorSearchResult[]> {
    // Try vector search first if available
    try {
      return await this.vectorSearch(queryEmbedding, topK, documentIds);
    } catch (error) {
      console.warn('Vector search failed, falling back to cosine similarity:', error);
      return await this.cosineSimilaritySearch(queryEmbedding, topK, documentIds);
    }
  }

  private async vectorSearch(
    queryEmbedding: number[],
    topK: number,
    documentIds?: string[]
  ): Promise<VectorSearchResult[]> {
    let query = `
      SELECT 
        de.id, de.document_id, de.chunk_index, de.content, de.embedding, de.metadata,
        vec.distance
      FROM vec_embeddings vec
      JOIN document_embeddings de ON vec.id = de.id
    `;
    
    const params: any[] = [JSON.stringify(queryEmbedding), topK];
    
    if (documentIds && documentIds.length > 0) {
      query += ` WHERE de.document_id IN (${documentIds.map(() => '?').join(',')})`;
      params.push(...documentIds);
    }
    
    query += `
      WHERE vec.embedding MATCH ?
      ORDER BY vec.distance
      LIMIT ?
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      chunk: this.rowToChunk(row),
      score: 1 - row.distance, // Convert distance to similarity score
      distance: row.distance
    }));
  }

  private async cosineSimilaritySearch(
    queryEmbedding: number[],
    topK: number,
    documentIds?: string[]
  ): Promise<VectorSearchResult[]> {
    let query = `
      SELECT id, document_id, chunk_index, content, embedding, metadata
      FROM document_embeddings
      WHERE embedding IS NOT NULL
    `;
    
    const params: any[] = [];
    
    if (documentIds && documentIds.length > 0) {
      query += ` AND document_id IN (${documentIds.map(() => '?').join(',')})`;
      params.push(...documentIds);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    const results: VectorSearchResult[] = [];

    for (const row of rows) {
      if (!row.embedding) continue;
      
      const embedding = Array.from(new Float32Array(row.embedding));
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      const distance = 1 - similarity;

      results.push({
        chunk: this.rowToChunk(row),
        score: similarity,
        distance: distance
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private rowToChunk(row: any): DocumentChunk {
    return {
      id: row.id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding)) : undefined
    };
  }

  async getChunkById(id: string): Promise<DocumentChunk | null> {
    const stmt = this.db.prepare(`
      SELECT id, document_id, chunk_index, content, embedding, metadata
      FROM document_embeddings
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    return row ? this.rowToChunk(row) : null;
  }

  async getChunksByDocumentId(documentId: string): Promise<DocumentChunk[]> {
    const stmt = this.db.prepare(`
      SELECT id, document_id, chunk_index, content, embedding, metadata
      FROM document_embeddings
      WHERE document_id = ?
      ORDER BY chunk_index
    `);

    const rows = stmt.all(documentId) as any[];
    return rows.map(row => this.rowToChunk(row));
  }

  async deleteDocument(documentId: string): Promise<void> {
    const deleteEmbeddings = this.db.prepare(`
      DELETE FROM document_embeddings WHERE document_id = ?
    `);

    const deleteVec = this.db.prepare(`
      DELETE FROM vec_embeddings 
      WHERE id IN (
        SELECT id FROM document_embeddings WHERE document_id = ?
      )
    `);

    const transaction = this.db.transaction((documentId: string) => {
      deleteEmbeddings.run(documentId);
      try {
        deleteVec.run(documentId);
      } catch (error) {
        // Vector table might not be available
      }
    });

    transaction(documentId);
  }

  async getDocumentCount(): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(DISTINCT document_id) as count FROM document_embeddings
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async getChunkCount(): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM document_embeddings
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  close(): void {
    this.db.close();
  }
}
