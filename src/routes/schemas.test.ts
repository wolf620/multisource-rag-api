import { describe, it, expect } from "vitest";
import { chatRequestSchema, sessionParamsSchema } from "./schemas";

describe("chatRequestSchema", () => {
  it("passes with query only", () => {
    expect(chatRequestSchema.safeParse({ query: "What is X?" }).success).toBe(true);
  });

  it("passes with query + valid session_id", () => {
    const r = chatRequestSchema.safeParse({
      query: "termination clause?",
      session_id: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(r.success).toBe(true);
  });

  it("rejects short queries", () => {
    expect(chatRequestSchema.safeParse({ query: "ab" }).success).toBe(false);
  });

  it("rejects bad session_id format", () => {
    expect(chatRequestSchema.safeParse({ query: "valid", session_id: "nope" }).success).toBe(false);
  });

  it("rejects missing query", () => {
    expect(chatRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("sessionParamsSchema", () => {
  it("accepts UUID", () => {
    expect(sessionParamsSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
  });

  it("rejects non-UUID", () => {
    expect(sessionParamsSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});
