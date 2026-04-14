import { env } from "../config/env";
import { SupportedDocumentType } from "../types/domain";

export type TextChunk = {
  index: number;
  content: string;
  metadata: Record<string, unknown>;
};

export interface ChunkingStrategy {
  chunk(text: string): TextChunk[];
}

export class UnstructuredChunkingStrategy implements ChunkingStrategy {
  constructor(
    private readonly maxSize: number,
    private readonly overlap: number
  ) {}

  chunk(text: string): TextChunk[] {
    const normalized = text.replace(/\r/g, "").trim();
    if (!normalized) return [];

    const paragraphs = normalized.split(/\n{2,}/);
    const rawChunks: string[] = [];
    let buffer = "";

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      const combined = buffer ? `${buffer}\n\n${trimmed}` : trimmed;
      if (combined.length > this.maxSize && buffer.length > 0) {
        rawChunks.push(buffer.trim());
        buffer = trimmed;
      } else {
        buffer = combined;
      }
    }
    if (buffer.trim()) {
      rawChunks.push(buffer.trim());
    }

    const results: TextChunk[] = [];
    let idx = 0;
    for (const raw of rawChunks) {
      if (raw.length <= this.maxSize * 1.3) {
        results.push({ index: idx++, content: raw, metadata: { strategy: "paragraph" } });
        continue;
      }
      let start = 0;
      while (start < raw.length) {
        const end = Math.min(start + this.maxSize, raw.length);
        const slice = raw.slice(start, end).trim();
        if (slice) {
          results.push({ index: idx++, content: slice, metadata: { strategy: "window" } });
        }
        if (end >= raw.length) break;
        start = Math.max(0, end - this.overlap);
      }
    }

    if (results.length > 1) {
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1].content;
        const overlapSnippet = prev.slice(-this.overlap);
        if (!results[i].content.startsWith(overlapSnippet) && results[i].metadata.strategy === "paragraph") {
          results[i] = {
            ...results[i],
            content: `${overlapSnippet}\n\n${results[i].content}`.slice(0, this.maxSize * 1.3)
          };
        }
      }
    }

    return results;
  }
}

export class StructuredChunkingStrategy implements ChunkingStrategy {
  constructor(private readonly maxSize: number) {}

  chunk(text: string): TextChunk[] {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const results: TextChunk[] = [];
    let buffer = "";
    let recordStart = 0;
    let idx = 0;

    for (let i = 0; i < lines.length; i++) {
      const combined = buffer ? `${buffer}\n${lines[i]}` : lines[i];
      if (combined.length > this.maxSize && buffer.length > 0) {
        results.push({
          index: idx++,
          content: buffer.trim(),
          metadata: { strategy: "record_group", recordRange: [recordStart, i - 1] }
        });
        buffer = lines[i];
        recordStart = i;
      } else {
        buffer = combined;
      }
    }
    if (buffer.trim()) {
      results.push({
        index: idx++,
        content: buffer.trim(),
        metadata: { strategy: "record_group", recordRange: [recordStart, lines.length - 1] }
      });
    }

    return results;
  }
}

export class ChunkingService {
  private readonly unstructured: UnstructuredChunkingStrategy;
  private readonly structured: StructuredChunkingStrategy;

  constructor() {
    this.unstructured = new UnstructuredChunkingStrategy(env.CHUNK_SIZE, env.CHUNK_OVERLAP);
    this.structured = new StructuredChunkingStrategy(env.CHUNK_SIZE);
  }

  resolve(sourceType: SupportedDocumentType): ChunkingStrategy {
    if (sourceType === "csv" || sourceType === "json") {
      return this.structured;
    }
    return this.unstructured;
  }
}
