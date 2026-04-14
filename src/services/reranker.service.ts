import OpenAI from "openai";
import { env } from "../config/env";
import { ChunkRecord } from "../types/domain";

type RankedChunk = ChunkRecord & { documentName: string; rerankScore: number };

export class RerankerService {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async rerank(
    query: string,
    chunks: Array<ChunkRecord & { documentName: string }>,
    topN: number
  ): Promise<RankedChunk[]> {
    if (chunks.length === 0) return [];
    if (chunks.length <= topN) {
      return chunks.map((c, i) => ({ ...c, rerankScore: chunks.length - i }));
    }

    const numbered = chunks.map((c, i) => `[${i}] ${c.content.slice(0, 400)}`).join("\n\n");

    const resp = await this.client.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a relevance judge. Given a query and numbered passages, return ONLY a JSON array of the indices of the ${topN} most relevant passages in order of relevance. Example: [2,0,5,1]. No explanation.`
        },
        { role: "user", content: `Query: ${query}\n\nPassages:\n${numbered}` }
      ]
    });

    const raw = resp.choices[0]?.message?.content || "";
    let indices: number[];
    try {
      const match = raw.match(/\[[\d,\s]+\]/);
      indices = match ? JSON.parse(match[0]) : [];
    } catch {
      indices = [];
    }

    const valid = indices
      .filter((i) => Number.isInteger(i) && i >= 0 && i < chunks.length)
      .slice(0, topN);

    if (valid.length === 0) {
      return chunks.slice(0, topN).map((c, i) => ({ ...c, rerankScore: topN - i }));
    }

    return valid.map((idx, rank) => ({ ...chunks[idx], rerankScore: topN - rank }));
  }
}
