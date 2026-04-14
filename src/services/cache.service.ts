import { createHash } from "node:crypto";
import { createClient, RedisClientType } from "redis";
import { env } from "../config/env";

export class CacheService {
  private client: RedisClientType | null = null;
  private connected = false;

  async connect(): Promise<void> {
    try {
      this.client = createClient({ url: env.REDIS_URL });
      this.client.on("error", (err) => {
        if (this.connected) {
          this.connected = false;
          process.stderr.write(`[cache] redis connection lost: ${err.message}\n`);
        }
      });
      await this.client.connect();
      this.connected = true;
    } catch {
      this.connected = false;
      this.client = null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }

  private key(prefix: string, input: string): string {
    return `rag:${prefix}:${createHash("sha256").update(input).digest("hex").slice(0, 32)}`;
  }

  async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.connected || !this.client) return null;
    try {
      const raw = await this.client.get(this.key("emb", text));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async setEmbedding(text: string, embedding: number[]): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.set(this.key("emb", text), JSON.stringify(embedding), { EX: env.CACHE_TTL_SECONDS });
    } catch {}
  }

  async getSearchResult(query: string, embeddingFingerprint: string): Promise<string | null> {
    if (!this.connected || !this.client) return null;
    try {
      return await this.client.get(this.key("search", `${query}|${embeddingFingerprint}`));
    } catch {
      return null;
    }
  }

  async setSearchResult(query: string, embeddingFingerprint: string, result: string): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.set(this.key("search", `${query}|${embeddingFingerprint}`), result, { EX: env.CACHE_TTL_SECONDS });
    } catch {}
  }
}
