import { describe, it, expect } from "vitest";
import { UnstructuredChunkingStrategy, StructuredChunkingStrategy } from "./chunking.service";

describe("UnstructuredChunkingStrategy", () => {
  const strategy = new UnstructuredChunkingStrategy(200, 40);

  it("returns empty array for empty input", () => {
    expect(strategy.chunk("")).toEqual([]);
    expect(strategy.chunk("   ")).toEqual([]);
  });

  it("returns single chunk for short text", () => {
    const result = strategy.chunk("Hello world. This is a short paragraph.");
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(0);
    expect(result[0].content).toBe("Hello world. This is a short paragraph.");
  });

  it("splits on paragraph boundaries when text exceeds maxSize", () => {
    const para1 = "A".repeat(120);
    const para2 = "B".repeat(120);
    const text = `${para1}\n\n${para2}`;
    const result = strategy.chunk(text);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].content).toContain("A");
    expect(result[1].content).toContain("B");
  });

  it("falls back to window splitting for oversized single paragraph", () => {
    const text = "X".repeat(600);
    const result = strategy.chunk(text);
    expect(result.length).toBeGreaterThan(1);
    expect(result.some((c) => c.metadata.strategy === "window")).toBe(true);
  });

  it("assigns sequential indices", () => {
    const text = Array.from({ length: 5 }, (_, i) => `Paragraph ${i} ${"word ".repeat(30)}`).join("\n\n");
    const result = strategy.chunk(text);
    result.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });
});

describe("StructuredChunkingStrategy", () => {
  const strategy = new StructuredChunkingStrategy(200);

  it("returns empty array for empty input", () => {
    expect(strategy.chunk("")).toEqual([]);
    expect(strategy.chunk("  \n  \n  ")).toEqual([]);
  });

  it("groups records into single chunk when under maxSize", () => {
    const text = "name: Alice | age: 30\nname: Bob | age: 25";
    const result = strategy.chunk(text);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("Alice");
    expect(result[0].content).toContain("Bob");
    expect(result[0].metadata.strategy).toBe("record_group");
  });

  it("splits records into multiple chunks when exceeding maxSize", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `id: ${i} | data: ${"x".repeat(40)}`);
    const text = lines.join("\n");
    const result = strategy.chunk(text);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.content.length).toBeLessThanOrEqual(250);
    }
  });

  it("preserves record boundaries (no mid-record splits)", () => {
    const lines = ["name: Alice | role: Engineer", "name: Bob | role: Designer", "name: Carol | role: Manager"];
    const text = lines.join("\n");
    const result = strategy.chunk(text);
    for (const chunk of result) {
      const chunkLines = chunk.content.split("\n");
      for (const line of chunkLines) {
        expect(lines).toContain(line.trim());
      }
    }
  });

  it("tracks record ranges in metadata", () => {
    const text = "row1\nrow2\nrow3";
    const result = strategy.chunk(text);
    expect(result[0].metadata.recordRange).toEqual([0, 2]);
  });
});
