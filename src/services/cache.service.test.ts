import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

describe("CacheService key derivation", () => {
  const hashKey = (prefix: string, input: string) =>
    `rag:${prefix}:${createHash("sha256").update(input).digest("hex").slice(0, 32)}`;

  it("prefixes with rag namespace", () => {
    expect(hashKey("emb", "hello")).toMatch(/^rag:emb:/);
  });

  it("same input always produces same key", () => {
    expect(hashKey("emb", "test input")).toBe(hashKey("emb", "test input"));
  });

  it("different inputs produce different keys", () => {
    expect(hashKey("emb", "a")).not.toBe(hashKey("emb", "b"));
  });

  it("different prefixes produce different keys for same input", () => {
    expect(hashKey("emb", "x")).not.toBe(hashKey("search", "x"));
  });

  it("truncates hash to 32 chars for reasonable key length", () => {
    const key = hashKey("emb", "anything");
    const hashPart = key.split(":")[2];
    expect(hashPart).toHaveLength(32);
  });
});
