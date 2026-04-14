import OpenAI from "openai";
import { env } from "../config/env";
import { CacheService } from "./cache.service";

const EMBED_BATCH_LIMIT = 96;

const SYSTEM_PROMPT = `You are a precise legal-tech knowledge assistant. Answer the user question strictly based on the provided context. Reference source numbers like [source_1] when citing information. If the context does not contain enough information to answer, state that clearly.`;

export class LlmService {
  private readonly client: OpenAI;
  private readonly cache: CacheService;

  constructor(cache: CacheService) {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.cache = cache;
  }

  async embed(text: string): Promise<number[]> {
    const cached = await this.cache.getEmbedding(text);
    if (cached) return cached;

    const result = await this.client.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: text
    });
    const embedding = result.data[0].embedding;
    await this.cache.setEmbedding(text, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cached = await this.cache.getEmbedding(texts[i]);
      if (cached) {
        embeddings[i] = cached;
      } else {
        uncachedIndices.push(i);
      }
    }

    for (let offset = 0; offset < uncachedIndices.length; offset += EMBED_BATCH_LIMIT) {
      const batchIndices = uncachedIndices.slice(offset, offset + EMBED_BATCH_LIMIT);
      const batchTexts = batchIndices.map((i) => texts[i]);
      const result = await this.client.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: batchTexts
      });
      for (const item of result.data) {
        const originalIndex = batchIndices[item.index];
        embeddings[originalIndex] = item.embedding;
        await this.cache.setEmbedding(texts[originalIndex], item.embedding);
      }
    }

    return embeddings as number[][];
  }

  async rewriteQuery(query: string, conversationTail: string): Promise<string> {
    if (!conversationTail.trim()) return query;

    const result = await this.client.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "You are a query rewriter. Given a conversation history and a follow-up question, rewrite the follow-up into a standalone search query. Return ONLY the rewritten query, nothing else."
        },
        { role: "user", content: `Conversation:\n${conversationTail}\n\nFollow-up question: ${query}` }
      ]
    });
    return (result.choices[0]?.message?.content || query).trim();
  }

  async answer(input: { query: string; context: string }): Promise<string> {
    const result = await this.client.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Context:\n${input.context}\n\nQuestion: ${input.query}` }
      ]
    });
    return (result.choices[0]?.message?.content || "").trim();
  }

  answerStream(input: { query: string; context: string }) {
    return this.client.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      temperature: 0.1,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Context:\n${input.context}\n\nQuestion: ${input.query}` }
      ]
    });
  }
}
