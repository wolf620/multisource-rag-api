import Fastify, { FastifyError } from "fastify";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import { registerRoutes } from "./routes";
import { ParserService } from "./services/parser.service";
import { ChunkingService } from "./services/chunking.service";
import { LlmService } from "./services/llm.service";
import { CacheService } from "./services/cache.service";
import { RerankerService } from "./services/reranker.service";
import { DocumentRepository } from "./repositories/document.repository";
import { JobRepository } from "./repositories/job.repository";
import { IngestionService } from "./services/ingestion.service";
import { SessionRepository } from "./repositories/session.repository";
import { ChatRepository } from "./repositories/chat.repository";
import { ChatService } from "./services/chat.service";
import { AppError } from "./errors";
import { pool } from "./db/pool";
import { schemaSql } from "./db/schema";

export async function buildApp() {
  await pool.query(schemaSql);

  const cache = new CacheService();
  await cache.connect();

  const app = Fastify({ logger: true });

  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
  await app.register(sensible);

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }

    if ("validation" in error && error.message) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", message: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: "An unexpected error occurred" });
  });

  const llm = new LlmService(cache);
  const reranker = new RerankerService();
  const docRepo = new DocumentRepository();
  const jobRepo = new JobRepository();
  const sessionRepo = new SessionRepository();
  const chatRepo = new ChatRepository();

  const ingestionService = new IngestionService(
    new ParserService(),
    new ChunkingService(),
    llm,
    docRepo,
    jobRepo
  );

  const chatService = new ChatService(sessionRepo, chatRepo, docRepo, llm, reranker, cache);

  await registerRoutes(app, { chatService, ingestionService });

  app.get("/health", async () => ({ status: "ok" }));

  app.addHook("onClose", async () => {
    await cache.disconnect();
  });

  return app;
}
