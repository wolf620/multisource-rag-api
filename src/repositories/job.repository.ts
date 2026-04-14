import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export class JobRepository {
  async createJob(fileCount: number): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO ingestion_jobs (id, status, file_count) VALUES ($1, 'queued', $2)`,
      [id, fileCount]
    );
    return id;
  }

  async setStatus(jobId: string, status: JobStatus, errorMessage?: string): Promise<void> {
    await pool.query(
      `UPDATE ingestion_jobs SET status = $2, updated_at = NOW(), error_message = $3 WHERE id = $1`,
      [jobId, status, errorMessage ?? null]
    );
  }

  async getJob(jobId: string): Promise<{
    id: string;
    status: JobStatus;
    fileCount: number;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  } | null> {
    const result = await pool.query(
      `SELECT id, status, file_count, error_message, created_at, updated_at
       FROM ingestion_jobs WHERE id = $1`,
      [jobId]
    );
    if (result.rowCount === 0) return null;
    return {
      id: result.rows[0].id,
      status: result.rows[0].status,
      fileCount: result.rows[0].file_count,
      errorMessage: result.rows[0].error_message,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    };
  }
}
