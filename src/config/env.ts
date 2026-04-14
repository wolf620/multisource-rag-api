import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://redis:6379"),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  OPENAI_CHAT_MODEL: z.string().min(1).default("gpt-4o-mini"),
  CHUNK_SIZE: z.coerce.number().int().min(200).max(4000).default(900),
  CHUNK_OVERLAP: z.coerce.number().int().min(0).max(1000).default(180),
  TOP_K: z.coerce.number().int().min(1).max(20).default(8),
  RERANK_ENABLED: z.coerce.boolean().default(true),
  RERANK_TOP_N: z.coerce.number().int().min(1).max(10).default(4),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(3600),
  HYBRID_VECTOR_WEIGHT: z.coerce.number().min(0).max(1).default(0.7),
  HYBRID_KEYWORD_WEIGHT: z.coerce.number().min(0).max(1).default(0.3)
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
