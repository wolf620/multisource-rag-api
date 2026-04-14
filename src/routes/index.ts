import { FastifyInstance } from "fastify";
import { chatRequestSchema, sessionParamsSchema } from "./schemas";
import { ChatService } from "../services/chat.service";
import { IngestionService } from "../services/ingestion.service";
import { NotFoundError, ValidationError } from "../errors";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".csv", ".json"];

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/json"
]);

export async function registerRoutes(
  app: FastifyInstance,
  services: { chatService: ChatService; ingestionService: IngestionService }
) {
  app.post("/ingest", async (request, reply) => {
    const files: Array<{ filename: string; mimetype: string; data: Buffer }> = [];
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type !== "file") continue;
      const ext = part.filename.toLowerCase().slice(part.filename.lastIndexOf("."));
      if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIMES.has(part.mimetype)) {
        throw new ValidationError(`Unsupported file: ${part.filename}`);
      }
      files.push({ filename: part.filename, mimetype: part.mimetype, data: await part.toBuffer() });
    }
    if (files.length === 0) {
      throw new ValidationError("At least one file must be uploaded");
    }
    const jobId = await services.ingestionService.queueJob(files);
    return reply.code(202).send({ job_id: jobId, status: "queued", file_count: files.length });
  });

  app.get("/ingest/:jobId", async (request) => {
    const { jobId } = request.params as { jobId: string };
    const job = await services.ingestionService.getJobStatus(jobId);
    if (!job) throw new NotFoundError("Ingestion job");
    return {
      job_id: job.id,
      status: job.status,
      file_count: job.fileCount,
      error: job.errorMessage,
      created_at: job.createdAt,
      updated_at: job.updatedAt
    };
  });

  app.post("/chat", async (request) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const result = await services.chatService.ask({
      sessionId: parsed.data.session_id,
      query: parsed.data.query
    });
    return {
      session_id: result.sessionId,
      rewritten_query: result.rewrittenQuery,
      answer: result.answer,
      sources: result.sources
    };
  });

  app.post("/chat/stream", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const { sessionId, rewrittenQuery, sources, stream, persistTurn } =
      await services.chatService.askStream({
        sessionId: parsed.data.session_id,
        query: parsed.data.query
      });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    const send = (payload: Record<string, unknown>) =>
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);

    send({ type: "metadata", session_id: sessionId, rewritten_query: rewrittenQuery, sources });

    if (!stream) {
      const fallback = "No relevant documents were found. Please ingest relevant documents first.";
      send({ type: "token", content: fallback });
      await persistTurn(fallback);
      send({ type: "done" });
      reply.raw.end();
      return reply;
    }

    let fullAnswer = "";
    const streamResponse = await stream;
    for await (const chunk of streamResponse) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullAnswer += delta;
        send({ type: "token", content: delta });
      }
    }

    await persistTurn(fullAnswer);
    send({ type: "done" });
    reply.raw.end();
    return reply;
  });

  app.get("/sessions/:id", async (request) => {
    const parsed = sessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError("Invalid session ID format");
    }
    return services.chatService.history(parsed.data.id);
  });
}
