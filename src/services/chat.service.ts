import { env } from "../config/env";
import { ChatRepository } from "../repositories/chat.repository";
import { DocumentRepository } from "../repositories/document.repository";
import { SessionRepository } from "../repositories/session.repository";
import { CacheService } from "./cache.service";
import { RerankerService } from "./reranker.service";
import { NotFoundError } from "../errors";
import { ChatSource, ChunkRecord } from "../types/domain";
import { LlmService } from "./llm.service";

type RetrievedChunk = ChunkRecord & { documentName: string; rerankScore?: number };

function toSources(chunks: RetrievedChunk[]): ChatSource[] {
  return chunks.map((row) => ({
    documentId: row.documentId,
    documentName: row.documentName,
    chunkId: row.id,
    chunkIndex: row.chunkIndex,
    score: row.rerankScore ?? row.fusedScore ?? 0,
    excerpt: row.content.slice(0, 320)
  }));
}

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((r, idx) => `[source_${idx + 1}] (${r.documentName})\n${r.content}`)
    .join("\n\n");
}

export class ChatService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly chatRepo: ChatRepository,
    private readonly docRepo: DocumentRepository,
    private readonly llm: LlmService,
    private readonly reranker: RerankerService,
    private readonly cache: CacheService
  ) {}

  private async retrieveAndRerank(query: string, embedding: number[]): Promise<RetrievedChunk[]> {
    const cacheKey = embedding.slice(0, 16).join(",");
    const cached = await this.cache.getSearchResult(query, cacheKey);

    let results: RetrievedChunk[];
    if (cached) {
      results = JSON.parse(cached);
    } else {
      results = await this.docRepo.hybridSearch({
        embedding,
        query,
        topK: env.TOP_K,
        vectorWeight: env.HYBRID_VECTOR_WEIGHT,
        keywordWeight: env.HYBRID_KEYWORD_WEIGHT
      });
      await this.cache.setSearchResult(query, cacheKey, JSON.stringify(results));
    }

    if (env.RERANK_ENABLED && results.length > env.RERANK_TOP_N) {
      results = await this.reranker.rerank(query, results, env.RERANK_TOP_N);
    }

    return results;
  }

  private buildHistoryTail(history: Array<{ userQuery: string; aiResponse: string }>): string {
    return history
      .slice(-4)
      .map((h) => `User: ${h.userQuery}\nAssistant: ${h.aiResponse}`)
      .join("\n");
  }

  async ask(input: { sessionId?: string; query: string }) {
    const sessionId = await this.sessionRepo.ensureSession(input.sessionId);
    const history = await this.chatRepo.getSessionHistory(sessionId);
    const rewrittenQuery = await this.llm.rewriteQuery(input.query, this.buildHistoryTail(history));
    const queryEmbedding = await this.llm.embed(rewrittenQuery);
    const results = await this.retrieveAndRerank(rewrittenQuery, queryEmbedding);

    let answer: string;
    let sources: ChatSource[] = [];

    if (results.length === 0) {
      answer = "No relevant documents were found to answer this question. Please ingest relevant documents first.";
    } else {
      answer = await this.llm.answer({ query: input.query, context: buildContext(results) });
      sources = toSources(results);
    }

    await this.chatRepo.addTurn({ sessionId, userQuery: input.query, aiResponse: answer, sources });
    return { sessionId, rewrittenQuery, answer, sources };
  }

  async askStream(input: { sessionId?: string; query: string }) {
    const sessionId = await this.sessionRepo.ensureSession(input.sessionId);
    const history = await this.chatRepo.getSessionHistory(sessionId);
    const rewrittenQuery = await this.llm.rewriteQuery(input.query, this.buildHistoryTail(history));
    const queryEmbedding = await this.llm.embed(rewrittenQuery);
    const results = await this.retrieveAndRerank(rewrittenQuery, queryEmbedding);

    const sources = toSources(results);
    const context = results.length > 0 ? buildContext(results) : "";
    const stream = context ? this.llm.answerStream({ query: input.query, context }) : null;

    return {
      sessionId,
      rewrittenQuery,
      sources,
      stream,
      persistTurn: (answer: string) =>
        this.chatRepo.addTurn({ sessionId, userQuery: input.query, aiResponse: answer, sources })
    };
  }

  async history(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundError("Session");
    const turns = await this.chatRepo.getSessionHistory(sessionId);
    return { sessionId, turns };
  }
}
