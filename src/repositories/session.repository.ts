import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";

export class SessionRepository {
  async create(): Promise<string> {
    const id = randomUUID();
    await pool.query(`INSERT INTO sessions (id) VALUES ($1)`, [id]);
    return id;
  }

  async findById(sessionId: string): Promise<{ id: string; createdAt: string } | null> {
    const result = await pool.query(
      `SELECT id, created_at FROM sessions WHERE id = $1`,
      [sessionId]
    );
    if (result.rowCount === 0) return null;
    return { id: result.rows[0].id, createdAt: result.rows[0].created_at };
  }

  async touch(sessionId: string): Promise<void> {
    await pool.query(`UPDATE sessions SET updated_at = NOW() WHERE id = $1`, [sessionId]);
  }

  async ensureSession(sessionId?: string): Promise<string> {
    if (sessionId) {
      const existing = await this.findById(sessionId);
      if (existing) {
        await this.touch(sessionId);
        return sessionId;
      }
    }
    return this.create();
  }
}
