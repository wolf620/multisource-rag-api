export type SupportedDocumentType = "pdf" | "docx" | "csv" | "json";

export type ChunkRecord = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  vectorScore?: number;
  keywordScore?: number;
  fusedScore?: number;
};

export type ChatSource = {
  documentId: string;
  documentName: string;
  chunkId: string;
  chunkIndex: number;
  score: number;
  excerpt: string;
};
