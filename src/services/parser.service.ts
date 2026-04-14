import pdf from "pdf-parse";
import mammoth from "mammoth";
import { parse as parseCsv } from "csv-parse/sync";
import { SupportedDocumentType } from "../types/domain";

export type ParsedDocument = {
  sourceType: SupportedDocumentType;
  text: string;
};

export class ParserService {
  async parse(filename: string, mimeType: string, buffer: Buffer): Promise<ParsedDocument> {
    const sourceType = this.inferType(filename, mimeType);

    if (sourceType === "pdf") {
      const result = await pdf(buffer);
      return { sourceType, text: result.text ?? "" };
    }

    if (sourceType === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      return { sourceType, text: result.value ?? "" };
    }

    if (sourceType === "csv") {
      return { sourceType, text: this.parseCsvToReadableText(buffer) };
    }

    return { sourceType, text: this.parseJsonToReadableText(buffer) };
  }

  private parseCsvToReadableText(buffer: Buffer): string {
    const records: Record<string, string>[] = parseCsv(buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true
    });
    return records
      .map((row) =>
        Object.entries(row)
          .map(([key, value]) => `${key}: ${value}`)
          .join(" | ")
      )
      .join("\n");
  }

  private parseJsonToReadableText(buffer: Buffer): string {
    const value = JSON.parse(buffer.toString("utf-8"));
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            return Object.entries(item)
              .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
              .join(" | ");
          }
          return String(item);
        })
        .join("\n");
    }
    if (typeof value === "object" && value !== null) {
      return Object.entries(value)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n");
    }
    return String(value);
  }

  private inferType(filename: string, mimeType: string): SupportedDocumentType {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".pdf") || mimeType.includes("pdf")) return "pdf";
    if (lower.endsWith(".docx") || mimeType.includes("wordprocessingml")) return "docx";
    if (lower.endsWith(".csv") || mimeType.includes("csv")) return "csv";
    if (lower.endsWith(".json") || mimeType.includes("json")) return "json";
    throw new Error(`Unsupported file type: ${filename}`);
  }
}
