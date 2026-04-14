import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { ChatSource } from "../types/domain";

export class ChatRepository {
  async addTurn(input: {
    sessionId: string;
    userQuery: string;
    aiResponse: string;
    sources: ChatSource[];
  }): Promise<void> {
    await pool.query(
      `INSERT INTO chat_history (id, session_id, user_query, ai_response, sources)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [randomUUID(), input.sessionId, input.userQuery, input.aiResponse, JSON.stringify(input.sources)]
    );
  }

  async getSessionHistory(sessionId: string): Promise<
    Array<{
      userQuery: string;
      aiResponse: string;
      sources: ChatSource[];
      createdAt: string;
    }>
  > {
    const result = await pool.query(
      `SELECT user_query, ai_response, sources, created_at
       FROM chat_history
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );
    return result.rows.map((row) => ({
      userQuery: row.user_query,
      aiResponse: row.ai_response,
      sources: row.sources,
      createdAt: row.created_at
    }));
  }
}
