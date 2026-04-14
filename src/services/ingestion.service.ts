import { createHash } from "node:crypto";
import { ChunkingService } from "./chunking.service";
import { DocumentRepository } from "../repositories/document.repository";
import { JobRepository } from "../repositories/job.repository";
import { ParserService } from "./parser.service";
import { LlmService } from "./llm.service";
import { ValidationError } from "../errors";

type UploadFile = {
  filename: string;
  mimetype: string;
  data: Buffer;
};

export class IngestionService {
  constructor(
    private readonly parserService: ParserService,
    private readonly chunkingService: ChunkingService,
    private readonly llmService: LlmService,
    private readonly documentRepository: DocumentRepository,
    private readonly jobRepository: JobRepository
  ) {}

  async queueJob(files: UploadFile[]): Promise<string> {
    if (files.length === 0) {
      throw new ValidationError("At least one file must be uploaded");
    }
    const jobId = await this.jobRepository.createJob(files.length);
    void this.processJob(jobId, files);
    return jobId;
  }

  async getJobStatus(jobId: string) {
    return this.jobRepository.getJob(jobId);
  }

  private async processJob(jobId: string, files: UploadFile[]): Promise<void> {
    await this.jobRepository.setStatus(jobId, "processing");
    try {
      await this.documentRepository.withTransaction(async (client) => {
        for (const file of files) {
          const contentHash = createHash("sha256").update(file.data).digest("hex");

          const existing = await this.documentRepository.findByContentHash(contentHash);
          if (existing) continue;

          const parsed = await this.parserService.parse(file.filename, file.mimetype, file.data);

          const strategy = this.chunkingService.resolve(parsed.sourceType);
          const chunks = strategy.chunk(parsed.text);

          const documentId = await this.documentRepository.insertDocument(client, {
            jobId,
            filename: file.filename,
            mimeType: file.mimetype,
            sourceType: parsed.sourceType,
            contentHash
          });

          const chunkTexts = chunks.map((c) => c.content);
          const embeddings = await this.llmService.embedBatch(chunkTexts);

          const chunkRows = chunks.map((chunk, i) => ({
            documentId,
            chunkIndex: chunk.index,
            content: chunk.content,
            metadata: chunk.metadata,
            embedding: embeddings[i]
          }));

          await this.documentRepository.insertChunksBatch(client, chunkRows);
          await this.documentRepository.updateChunkCount(client, documentId, chunkRows.length);
        }
      });
      await this.jobRepository.setStatus(jobId, "completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ingestion failed";
      await this.jobRepository.setStatus(jobId, "failed", message);
    }
  }
}
