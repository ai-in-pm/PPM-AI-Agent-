import { Ollama } from 'ollama';
import { z } from 'zod';

export interface OllamaConfig {
  baseUrl: string;
  generalModel: string;
  coderModel?: string;
  embeddingModel: string;
  rerankerModel?: string;
  temperature: number;
  topP: number;
  maxRetries: number;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  prompt: string;
}

export interface GenerationResult {
  response: string;
  model: string;
  done: boolean;
  context?: number[];
  totalDuration?: number;
  loadDuration?: number;
  promptEvalCount?: number;
  promptEvalDuration?: number;
  evalCount?: number;
  evalDuration?: number;
}

// Schema for evidence-traced responses
export const EvidenceTracedResponseSchema = z.object({
  claims: z.array(z.object({
    text: z.string(),
    evidencePointers: z.array(z.object({
      sourcePathOrUrl: z.string(),
      page: z.number().optional(),
      lineStart: z.number().optional(),
      lineEnd: z.number().optional(),
      snippet: z.string().optional()
    })),
    guidelineIds: z.array(z.string()),
    attributeIds: z.array(z.string()),
    confidence: z.number().min(0).max(1)
  })),
  summary: z.string(),
  overallConfidence: z.number().min(0).max(1),
  evidenceGaps: z.array(z.string()).optional()
});

export type EvidenceTracedResponse = z.infer<typeof EvidenceTracedResponseSchema>;

export class OllamaClient {
  private client: Ollama;
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
    this.client = new Ollama({ host: config.baseUrl });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch (error) {
      console.error('Ollama not available:', error);
      return false;
    }
  }

  async ensureModelsAvailable(): Promise<void> {
    const models = await this.client.list();
    const modelNames = models.models.map(m => m.name);

    const requiredModels = [
      this.config.generalModel,
      this.config.embeddingModel
    ];

    if (this.config.coderModel) {
      requiredModels.push(this.config.coderModel);
    }

    if (this.config.rerankerModel) {
      requiredModels.push(this.config.rerankerModel);
    }

    for (const model of requiredModels) {
      if (!modelNames.includes(model)) {
        console.log(`Pulling model: ${model}`);
        await this.client.pull({ model });
      }
    }
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      const response = await this.client.embeddings({
        model: this.config.embeddingModel,
        prompt: text
      });

      return {
        embedding: response.embedding,
        model: this.config.embeddingModel,
        prompt: text
      };
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    
    // Process in batches to avoid overwhelming Ollama
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.generateEmbedding(text));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  async generateResponse(
    prompt: string,
    context?: string,
    useCoderModel: boolean = false
  ): Promise<GenerationResult> {
    const model = useCoderModel && this.config.coderModel 
      ? this.config.coderModel 
      : this.config.generalModel;

    try {
      const response = await this.client.generate({
        model,
        prompt: context ? `Context: ${context}\n\nQuestion: ${prompt}` : prompt,
        options: {
          temperature: this.config.temperature,
          top_p: this.config.topP
        }
      });

      return {
        response: response.response,
        model,
        done: response.done,
        context: response.context,
        totalDuration: response.total_duration,
        loadDuration: response.load_duration,
        promptEvalCount: response.prompt_eval_count,
        promptEvalDuration: response.prompt_eval_duration,
        evalCount: response.eval_count,
        evalDuration: response.eval_duration
      };
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error(`Failed to generate response: ${error}`);
    }
  }

  async generateEvidenceTracedResponse(
    question: string,
    context: string,
    retries: number = 3
  ): Promise<EvidenceTracedResponse> {
    const systemPrompt = `You are an evidence-tracing IP2M assessment assistant. You must only produce claims that are directly supported by the provided context. If no solid evidence exists for a claim, do not make the claim.

CRITICAL REQUIREMENTS:
1. Every claim MUST include at least one evidence pointer with specific source information
2. Map claims to relevant EIA-748 guideline IDs and IP2M attributes when determinable
3. Provide confidence scores based on evidence quality and completeness
4. If insufficient evidence exists, respond with an empty claims array

Output MUST be valid JSON matching this exact schema:
{
  "claims": [
    {
      "text": "specific claim text",
      "evidencePointers": [
        {
          "sourcePathOrUrl": "exact file path or URL",
          "page": 15,
          "lineStart": 10,
          "lineEnd": 25,
          "snippet": "relevant quote from source"
        }
      ],
      "guidelineIds": ["EIA748-1", "EIA748-2"],
      "attributeIds": ["IP2M-A1", "IP2M-A2"],
      "confidence": 0.85
    }
  ],
  "summary": "overall summary of findings",
  "overallConfidence": 0.8,
  "evidenceGaps": ["areas where more evidence is needed"]
}`;

    const userPrompt = `Question: ${question}

Context:
${context}

Analyze the context and provide evidence-traced claims. Remember: NO CLAIMS WITHOUT EVIDENCE POINTERS.`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.client.generate({
          model: this.config.coderModel || this.config.generalModel,
          prompt: userPrompt,
          system: systemPrompt,
          options: {
            temperature: this.config.temperature,
            top_p: this.config.topP
          },
          format: 'json'
        });

        // Parse and validate the JSON response
        const parsed = JSON.parse(response.response);
        const validated = EvidenceTracedResponseSchema.parse(parsed);
        
        return validated;
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed:`, error);
        if (attempt === retries - 1) {
          // Return a no-claim response on final failure
          return {
            claims: [],
            summary: "Insufficient evidence to make reliable claims",
            overallConfidence: 0,
            evidenceGaps: ["Unable to process context or generate valid response"]
          };
        }
      }
    }

    // This should never be reached due to the return in the catch block
    throw new Error('All retry attempts failed');
  }

  async rerank(
    query: string,
    documents: Array<{ id: string; content: string; score?: number }>,
    topK: number = 6
  ): Promise<Array<{ id: string; content: string; score: number }>> {
    if (!this.config.rerankerModel) {
      // If no reranker available, return top documents by existing score
      return documents
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, topK)
        .map(doc => ({ ...doc, score: doc.score || 0 }));
    }

    try {
      // Use the reranker model to score relevance
      const rerankedDocs = [];
      
      for (const doc of documents) {
        const prompt = `Query: ${query}\nDocument: ${doc.content}\n\nRelevance score (0.0 to 1.0):`;
        
        const response = await this.client.generate({
          model: this.config.rerankerModel,
          prompt,
          options: {
            temperature: 0.1,
            top_p: 0.9
          }
        });

        // Extract numeric score from response
        const scoreMatch = response.response.match(/(\d+\.?\d*)/);
        const score = scoreMatch ? Math.min(1.0, Math.max(0.0, parseFloat(scoreMatch[1]))) : 0.5;
        
        rerankedDocs.push({
          id: doc.id,
          content: doc.content,
          score
        });
      }

      return rerankedDocs
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      console.error('Reranking failed, falling back to original scores:', error);
      return documents
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, topK)
        .map(doc => ({ ...doc, score: doc.score || 0 }));
    }
  }
}
