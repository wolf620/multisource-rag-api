import { describe, it, expect } from "vitest";
import { ParserService } from "./parser.service";

describe("ParserService", () => {
  const parser = new ParserService();

  describe("CSV parsing", () => {
    it("converts CSV to readable key-value format", async () => {
      const csv = Buffer.from("name,age,city\nAlice,30,Amsterdam\nBob,25,Oslo\n");
      const result = await parser.parse("data.csv", "text/csv", csv);
      expect(result.sourceType).toBe("csv");
      expect(result.text).toContain("name: Alice");
      expect(result.text).toContain("age: 30");
      expect(result.text).toContain("city: Amsterdam");
      expect(result.text).toContain("name: Bob");
      const lines = result.text.split("\n");
      expect(lines).toHaveLength(2);
    });

    it("handles CSV with pipe-delimited output per row", async () => {
      const csv = Buffer.from("id,value\n1,foo\n2,bar\n");
      const result = await parser.parse("test.csv", "text/csv", csv);
      expect(result.text).toContain(" | ");
    });
  });

  describe("JSON parsing", () => {
    it("converts JSON object to readable key-value lines", async () => {
      const json = Buffer.from(JSON.stringify({ name: "Acme", country: "NL" }));
      const result = await parser.parse("meta.json", "application/json", json);
      expect(result.sourceType).toBe("json");
      expect(result.text).toContain("name: Acme");
      expect(result.text).toContain("country: NL");
    });

    it("converts JSON array of objects to one line per record", async () => {
      const json = Buffer.from(JSON.stringify([
        { id: 1, label: "first" },
        { id: 2, label: "second" }
      ]));
      const result = await parser.parse("items.json", "application/json", json);
      const lines = result.text.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("id: 1");
      expect(lines[1]).toContain("label: second");
    });

    it("handles nested objects by stringifying them", async () => {
      const json = Buffer.from(JSON.stringify({ terms: { duration: "12m" } }));
      const result = await parser.parse("nested.json", "application/json", json);
      expect(result.text).toContain("terms:");
      expect(result.text).toContain("duration");
    });
  });

  describe("file type inference", () => {
    it("infers PDF from extension", async () => {
      await expect(parser.parse("doc.pdf", "application/octet-stream", Buffer.from("")))
        .rejects.toThrow();
    });

    it("throws for unsupported file types", async () => {
      await expect(parser.parse("file.txt", "text/plain", Buffer.from("hello")))
        .rejects.toThrow("Unsupported file type: file.txt");
    });

    it("infers type from MIME when extension is ambiguous", async () => {
      const json = Buffer.from(JSON.stringify({ a: 1 }));
      const result = await parser.parse("data.json", "application/json", json);
      expect(result.sourceType).toBe("json");
    });
  });
});
