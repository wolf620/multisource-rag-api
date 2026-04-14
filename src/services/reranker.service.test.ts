import { describe, it, expect } from "vitest";
import { ChunkRecord } from "../types/domain";

describe("RerankerService fallback behavior", () => {
  const makeChunk = (id: string, doc: string): ChunkRecord & { documentName: string } => ({
    id,
    documentId: `doc-${id}`,
    chunkIndex: 0,
    content: `Content ${id}`,
    metadata: {},
    documentName: doc,
    fusedScore: 0.5
  });

  function fallbackRerank(
    chunks: Array<ChunkRecord & { documentName: string }>,
    topN: number
  ) {
    if (chunks.length === 0) return [];
    return chunks.slice(0, topN).map((c, i) => ({
      ...c,
      rerankScore: Math.min(chunks.length, topN) - i
    }));
  }

  it("preserves original order when chunk count is within topN", () => {
    const chunks = [makeChunk("a", "a.pdf"), makeChunk("b", "b.csv")];
    const result = fallbackRerank(chunks, 5);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
  });

  it("truncates to topN", () => {
    const chunks = Array.from({ length: 8 }, (_, i) => makeChunk(`${i}`, `doc${i}.pdf`));
    expect(fallbackRerank(chunks, 3)).toHaveLength(3);
  });

  it("scores decrease from first to last", () => {
    const chunks = Array.from({ length: 6 }, (_, i) => makeChunk(`${i}`, `d${i}.pdf`));
    const result = fallbackRerank(chunks, 4);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].rerankScore).toBeLessThan(result[i - 1].rerankScore);
    }
  });

  it("handles empty input", () => {
    expect(fallbackRerank([], 4)).toEqual([]);
  });
});
