import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { EvidencePointer } from '@ip2m/core';

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: {
    sourceKind: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'text' | 'url';
    sourcePathOrUrl: string;
    page?: number;
    lineStart?: number;
    lineEnd?: number;
    section?: string;
    table?: string;
    fileHash: string;
    chunkSize: number;
    totalChunks: number;
  };
  embedding?: number[];
}

export interface ProcessingResult {
  documentId: string;
  chunks: DocumentChunk[];
  metadata: {
    fileName: string;
    fileSize: number;
    fileHash: string;
    mimeType: string;
    pageCount?: number;
    wordCount: number;
    processedAt: Date;
  };
}

export interface ChunkingConfig {
  chunkSize: number;
  chunkOverlap: number;
  preserveStructure: boolean;
  minChunkSize: number;
}

export class DocumentProcessor {
  private config: ChunkingConfig;

  constructor(config: ChunkingConfig = {
    chunkSize: 1000,
    chunkOverlap: 200,
    preserveStructure: true,
    minChunkSize: 100
  }) {
    this.config = config;
  }

  async processFile(filePath: string): Promise<ProcessingResult> {
    const stats = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();

    let content: string;
    let pageCount: number | undefined;
    let mimeType: string;

    switch (extension) {
      case '.pdf':
        const pdfResult = await this.processPDF(buffer);
        content = pdfResult.content;
        pageCount = pdfResult.pageCount;
        mimeType = 'application/pdf';
        break;
      
      case '.docx':
        content = await this.processDOCX(buffer);
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      
      case '.xlsx':
        content = await this.processXLSX(buffer);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      
      case '.csv':
        content = buffer.toString('utf-8');
        mimeType = 'text/csv';
        break;
      
      case '.txt':
        content = buffer.toString('utf-8');
        mimeType = 'text/plain';
        break;
      
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }

    const documentId = crypto.randomUUID();
    const chunks = this.chunkText(content, {
      documentId,
      sourceKind: this.getSourceKind(extension),
      sourcePathOrUrl: filePath,
      fileHash,
      pageCount
    });

    const wordCount = content.split(/\s+/).length;

    return {
      documentId,
      chunks,
      metadata: {
        fileName,
        fileSize: stats.size,
        fileHash,
        mimeType,
        pageCount,
        wordCount,
        processedAt: new Date()
      }
    };
  }

  private async processPDF(buffer: Buffer): Promise<{ content: string; pageCount: number }> {
    try {
      const data = await pdfParse(buffer);
      return {
        content: data.text,
        pageCount: data.numpages
      };
    } catch (error) {
      throw new Error(`Failed to process PDF: ${error}`);
    }
  }

  private async processDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`Failed to process DOCX: ${error}`);
    }
  }

  private async processXLSX(buffer: Buffer): Promise<string> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      
      let content = '';
      workbook.eachSheet((worksheet, sheetId) => {
        content += `\n--- Sheet: ${worksheet.name} ---\n`;
        
        worksheet.eachRow((row, rowNumber) => {
          const rowValues: string[] = [];
          row.eachCell((cell, colNumber) => {
            rowValues.push(cell.text || '');
          });
          content += rowValues.join('\t') + '\n';
        });
      });
      
      return content;
    } catch (error) {
      throw new Error(`Failed to process XLSX: ${error}`);
    }
  }

  private getSourceKind(extension: string): 'pdf' | 'docx' | 'xlsx' | 'csv' | 'text' {
    switch (extension) {
      case '.pdf': return 'pdf';
      case '.docx': return 'docx';
      case '.xlsx': return 'xlsx';
      case '.csv': return 'csv';
      default: return 'text';
    }
  }

  private chunkText(
    text: string,
    baseMetadata: {
      documentId: string;
      sourceKind: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'text';
      sourcePathOrUrl: string;
      fileHash: string;
      pageCount?: number;
    }
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const sentences = this.splitIntoSentences(text);
    
    let currentChunk = '';
    let currentChunkIndex = 0;
    let currentLineStart = 1;
    let currentLineEnd = 1;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
      
      if (potentialChunk.length > this.config.chunkSize && currentChunk.length > this.config.minChunkSize) {
        // Create chunk from current content
        chunks.push(this.createChunk(
          currentChunk,
          currentChunkIndex,
          baseMetadata,
          currentLineStart,
          currentLineEnd
        ));
        
        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk);
        currentChunk = overlapText + (overlapText ? ' ' : '') + sentence;
        currentChunkIndex++;
        currentLineStart = currentLineEnd - this.estimateLines(overlapText);
      } else {
        currentChunk = potentialChunk;
      }
      
      currentLineEnd += this.estimateLines(sentence);
    }

    // Add final chunk if it has content
    if (currentChunk.length >= this.config.minChunkSize) {
      chunks.push(this.createChunk(
        currentChunk,
        currentChunkIndex,
        baseMetadata,
        currentLineStart,
        currentLineEnd
      ));
    }

    // Update total chunks count in all chunks
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - could be enhanced with more sophisticated NLP
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private getOverlapText(text: string): string {
    const words = text.split(/\s+/);
    const overlapWords = Math.floor(words.length * (this.config.chunkOverlap / this.config.chunkSize));
    return words.slice(-overlapWords).join(' ');
  }

  private estimateLines(text: string): number {
    // Rough estimation: assume 80 characters per line
    return Math.ceil(text.length / 80);
  }

  private createChunk(
    content: string,
    chunkIndex: number,
    baseMetadata: {
      documentId: string;
      sourceKind: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'text';
      sourcePathOrUrl: string;
      fileHash: string;
      pageCount?: number;
    },
    lineStart: number,
    lineEnd: number
  ): DocumentChunk {
    return {
      id: crypto.randomUUID(),
      documentId: baseMetadata.documentId,
      chunkIndex,
      content,
      metadata: {
        sourceKind: baseMetadata.sourceKind,
        sourcePathOrUrl: baseMetadata.sourcePathOrUrl,
        lineStart,
        lineEnd,
        fileHash: baseMetadata.fileHash,
        chunkSize: content.length,
        totalChunks: 0 // Will be updated later
      }
    };
  }

  async processURL(url: string, content: string): Promise<ProcessingResult> {
    const documentId = crypto.randomUUID();
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    
    const chunks = this.chunkText(content, {
      documentId,
      sourceKind: 'text',
      sourcePathOrUrl: url,
      fileHash
    });

    const wordCount = content.split(/\s+/).length;

    return {
      documentId,
      chunks,
      metadata: {
        fileName: new URL(url).pathname.split('/').pop() || 'web-content',
        fileSize: Buffer.byteLength(content, 'utf8'),
        fileHash,
        mimeType: 'text/html',
        wordCount,
        processedAt: new Date()
      }
    };
  }

  createEvidencePointer(
    chunk: DocumentChunk,
    snippet: string,
    confidence: number
  ): Omit<EvidencePointer, 'id'> {
    return {
      sourceKind: chunk.metadata.sourceKind,
      sourcePathOrUrl: chunk.metadata.sourcePathOrUrl,
      locationHint: {
        page: chunk.metadata.page,
        lineStart: chunk.metadata.lineStart,
        lineEnd: chunk.metadata.lineEnd,
        section: chunk.metadata.section,
        table: chunk.metadata.table
      },
      snippet,
      confidence,
      extractedAt: new Date(),
      fileHash: chunk.metadata.fileHash,
      metadata: {
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        documentId: chunk.documentId
      }
    };
  }
}
