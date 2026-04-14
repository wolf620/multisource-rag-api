import { describe, it, expect } from "vitest";
import { computeMetrics, summarizeResults, EvalCase } from "./suite";

describe("Evaluation metrics", () => {
  const sampleCase: EvalCase = {
    id: "test-1",
    query: "What is the termination period?",
    expectedDocuments: ["contract.pdf", "terms.json"],
    expectedKeywords: ["30 days", "written notice"],
    groundTruth: "30 days written notice"
  };

  it("computes perfect precision and recall when all docs retrieved", () => {
    const result = computeMetrics({
      evalCase: sampleCase,
      retrievedDocuments: ["contract.pdf", "terms.json"],
      answer: "The termination requires 30 days written notice."
    });
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.keywordHitRate).toBe(1);
    expect(result.answerRelevant).toBe(true);
  });

  it("computes partial precision when irrelevant docs included", () => {
    const result = computeMetrics({
      evalCase: sampleCase,
      retrievedDocuments: ["contract.pdf", "unrelated.csv", "other.docx"],
      answer: "30 days written notice is required."
    });
    expect(result.precision).toBeCloseTo(1 / 3, 2);
    expect(result.recall).toBe(0.5);
  });

  it("marks answer as irrelevant when keywords missing", () => {
    const result = computeMetrics({
      evalCase: sampleCase,
      retrievedDocuments: ["contract.pdf"],
      answer: "The contract has some conditions."
    });
    expect(result.keywordHitRate).toBe(0);
    expect(result.answerRelevant).toBe(false);
  });

  it("handles zero retrieved documents", () => {
    const result = computeMetrics({
      evalCase: sampleCase,
      retrievedDocuments: [],
      answer: "No documents found."
    });
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
  });
});

describe("summarizeResults", () => {
  it("computes averages across multiple results", () => {
    const results = [
      {
        caseId: "a", query: "q1", precision: 1, recall: 1,
        keywordHitRate: 1, answerRelevant: true,
        retrievedDocuments: ["doc.pdf"], answer: "answer"
      },
      {
        caseId: "b", query: "q2", precision: 0.5, recall: 0.5,
        keywordHitRate: 0.5, answerRelevant: true,
        retrievedDocuments: ["doc.pdf"], answer: "answer"
      }
    ];
    const summary = summarizeResults(results);
    expect(summary.totalCases).toBe(2);
    expect(summary.avgPrecision).toBe(0.75);
    expect(summary.avgRecall).toBe(0.75);
    expect(summary.relevantAnswers).toBe(2);
  });
});
