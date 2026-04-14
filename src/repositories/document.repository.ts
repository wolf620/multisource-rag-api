import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { ChunkRecord, SupportedDocumentType } from "../types/domain";

type InsertDocumentInput = {
  jobId: string;
  filename: string;
  mimeType: string;
  sourceType: SupportedDocumentType;
  contentHash: string;
};

type InsertChunkInput = {
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
};

export class DocumentRepository {
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async insertDocument(client: PoolClient, input: InsertDocumentInput): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO documents (id, job_id, filename, mime_type, source_type, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, input.jobId, input.filename, input.mimeType, input.sourceType, input.contentHash]
    );
    return id;
  }

  async updateChunkCount(client: PoolClient, documentId: string, count: number): Promise<void> {
    await client.query(`UPDATE documents SET chunk_count = $2 WHERE id = $1`, [documentId, count]);
  }

  async insertChunksBatch(client: PoolClient, chunks: InsertChunkInput[]): Promise<void> {
    if (chunks.length === 0) return;

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const chunk of chunks) {
      placeholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}::jsonb, $${paramIdx + 5}::vector)`);
      values.push(
        randomUUID(),
        chunk.documentId,
        chunk.chunkIndex,
        chunk.content,
        JSON.stringify(chunk.metadata),
        `[${chunk.embedding.join(",")}]`
      );
      paramIdx += 6;
    }

    await client.query(
      `INSERT INTO chunks (id, document_id, chunk_index, content, metadata, embedding) VALUES ${placeholders.join(", ")}`,
      values
    );
  }

  async findByContentHash(contentHash: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT id FROM documents WHERE content_hash = $1 LIMIT 1`,
      [contentHash]
    );
    return result.rowCount ? result.rows[0].id : null;
  }

  async hybridSearch(params: {
    embedding: number[];
    query: string;
    topK: number;
    vectorWeight: number;
    keywordWeight: number;
  }): Promise<Array<ChunkRecord & { documentName: string }>> {
    const result = await pool.query(
      `
      WITH vector_matches AS (
        SELECT c.id, c.document_id, c.chunk_index, c.content, c.metadata,
               d.filename AS document_name,
               1 - (c.embedding <=> $1::vector) AS vector_score
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        ORDER BY c.embedding <=> $1::vector
        LIMIT $2
      ),
      keyword_matches AS (
        SELECT c.id, c.document_id, c.chunk_index, c.content, c.metadata,
               d.filename AS document_name,
               ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', $3)) AS keyword_score
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE to_tsvector('english', c.content) @@ plainto_tsquery('english', $3)
        ORDER BY keyword_score DESC
        LIMIT $2
      ),
      merged AS (
        SELECT COALESCE(v.id, k.id) AS id,
               COALESCE(v.document_id, k.document_id) AS document_id,
               COALESCE(v.chunk_index, k.chunk_index) AS chunk_index,
               COALESCE(v.content, k.content) AS content,
               COALESCE(v.metadata, k.metadata) AS metadata,
               COALESCE(v.document_name, k.document_name) AS document_name,
               COALESCE(v.vector_score, 0) AS vector_score,
               COALESCE(k.keyword_score, 0) AS keyword_score
        FROM vector_matches v
        FULL OUTER JOIN keyword_matches k ON v.id = k.id
      )
      SELECT *, ($4 * vector_score + $5 * keyword_score) AS fused_score
      FROM merged
      ORDER BY fused_score DESC
      LIMIT $2
      `,
      [
        `[${params.embedding.join(",")}]`,
        params.topK,
        params.query,
        params.vectorWeight,
        params.keywordWeight
      ]
    );

    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      metadata: row.metadata,
      documentName: row.document_name,
      vectorScore: Number(row.vector_score),
      keywordScore: Number(row.keyword_score),
      fusedScore: Number(row.fused_score)
    }));
  }
}
