import { evalCases, computeMetrics, summarizeResults, EvalResult } from "./suite";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function run() {
  const results: EvalResult[] = [];

  for (const evalCase of evalCases) {
    const response = await fetch(`${BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: evalCase.query })
    });

    const data = await response.json() as {
      answer: string;
      sources: Array<{ documentName: string }>;
    };

    const retrievedDocuments = data.sources.map((s) => s.documentName);
    const result = computeMetrics({
      evalCase,
      retrievedDocuments,
      answer: data.answer
    });

    results.push(result);
    console.log(`[${result.answerRelevant ? "PASS" : "FAIL"}] ${evalCase.id}: P=${result.precision.toFixed(2)} R=${result.recall.toFixed(2)} KW=${result.keywordHitRate.toFixed(2)}`);
  }

  const summary = summarizeResults(results);
  console.log("\n=== Evaluation Summary ===");
  console.log(`Total cases:        ${summary.totalCases}`);
  console.log(`Avg Precision:      ${summary.avgPrecision}`);
  console.log(`Avg Recall:         ${summary.avgRecall}`);
  console.log(`Avg Keyword Hit:    ${summary.avgKeywordHitRate}`);
  console.log(`Relevant Answers:   ${summary.relevantAnswers}/${summary.totalCases}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
