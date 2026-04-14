export type EvalCase = {
  id: string;
  query: string;
  expectedDocuments: string[];
  expectedKeywords: string[];
  groundTruth: string;
};

export const evalCases: EvalCase[] = [
  {
    id: "termination-period",
    query: "What is the termination notice period?",
    expectedDocuments: ["source_text.docx", "source_text.pdf", "legal_terms.json"],
    expectedKeywords: ["30 days", "written notice", "terminate"],
    groundTruth: "Either party may terminate the agreement by giving 30 days written notice."
  },
  {
    id: "governing-law",
    query: "What is the governing law?",
    expectedDocuments: ["source_text.docx", "source_text.pdf", "legal_terms.json"],
    expectedKeywords: ["dutch", "netherlands"],
    groundTruth: "The agreement is governed by Dutch law."
  },
  {
    id: "confidentiality-duration",
    query: "How long does the confidentiality obligation last?",
    expectedDocuments: ["source_text.docx", "source_text.pdf"],
    expectedKeywords: ["5 years", "confidential"],
    groundTruth: "All non-public information must be kept confidential for 5 years."
  },
  {
    id: "liability-cap",
    query: "What is the liability cap?",
    expectedDocuments: ["source_text.docx", "source_text.pdf"],
    expectedKeywords: ["12 months", "fees paid", "capped"],
    groundTruth: "Total liability is capped at fees paid in the previous 12 months."
  },
  {
    id: "payment-terms",
    query: "What are the payment terms?",
    expectedDocuments: ["legal_terms.json"],
    expectedKeywords: ["EUR", "5000", "monthly"],
    groundTruth: "Payment is 5000 EUR on a monthly cycle."
  },
  {
    id: "high-severity-cases",
    query: "Which cases have high severity?",
    expectedDocuments: ["case_matrix.csv"],
    expectedKeywords: ["C-1001", "C-1003", "high"],
    groundTruth: "Cases C-1001 (Data Processing Addendum Missing) and C-1003 (Jurisdiction Clause Ambiguous) are high severity."
  }
];

export type EvalResult = {
  caseId: string;
  query: string;
  precision: number;
  recall: number;
  keywordHitRate: number;
  answerRelevant: boolean;
  retrievedDocuments: string[];
  answer: string;
};

export function computeMetrics(input: {
  evalCase: EvalCase;
  retrievedDocuments: string[];
  answer: string;
}): EvalResult {
  const { evalCase, retrievedDocuments, answer } = input;

  const relevantRetrieved = retrievedDocuments.filter((d) =>
    evalCase.expectedDocuments.some((e) => d.toLowerCase().includes(e.toLowerCase()))
  );
  const precision = retrievedDocuments.length > 0
    ? relevantRetrieved.length / retrievedDocuments.length
    : 0;
  const recall = evalCase.expectedDocuments.length > 0
    ? relevantRetrieved.length / evalCase.expectedDocuments.length
    : 0;

  const lowerAnswer = answer.toLowerCase();
  const keywordHits = evalCase.expectedKeywords.filter((kw) => lowerAnswer.includes(kw.toLowerCase()));
  const keywordHitRate = evalCase.expectedKeywords.length > 0
    ? keywordHits.length / evalCase.expectedKeywords.length
    : 0;

  const answerRelevant = keywordHitRate >= 0.5;

  return {
    caseId: evalCase.id,
    query: evalCase.query,
    precision,
    recall,
    keywordHitRate,
    answerRelevant,
    retrievedDocuments,
    answer
  };
}

export function summarizeResults(results: EvalResult[]): {
  totalCases: number;
  avgPrecision: number;
  avgRecall: number;
  avgKeywordHitRate: number;
  relevantAnswers: number;
  results: EvalResult[];
} {
  const avgPrecision = results.reduce((s, r) => s + r.precision, 0) / results.length;
  const avgRecall = results.reduce((s, r) => s + r.recall, 0) / results.length;
  const avgKeywordHitRate = results.reduce((s, r) => s + r.keywordHitRate, 0) / results.length;
  const relevantAnswers = results.filter((r) => r.answerRelevant).length;

  return {
    totalCases: results.length,
    avgPrecision: Math.round(avgPrecision * 1000) / 1000,
    avgRecall: Math.round(avgRecall * 1000) / 1000,
    avgKeywordHitRate: Math.round(avgKeywordHitRate * 1000) / 1000,
    relevantAnswers,
    results
  };
}
