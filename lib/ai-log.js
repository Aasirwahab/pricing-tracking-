import { sql } from "./db.js";

// Records every model call (Jev or LLM) so cost, latency, and failure rate can be
// reported per feature. Never throws: logging must not break the feature itself.
export async function logAiCall({
  kind,
  model,
  latencyMs,
  inputTokens = null,
  outputTokens = null,
  costUsd = null,
  ok = true,
}) {
  try {
    await sql`
      insert into ai_calls (kind, model, latency_ms, input_tokens, output_tokens, cost_usd, ok)
      values (${kind}, ${model}, ${latencyMs}, ${inputTokens}, ${outputTokens}, ${costUsd}, ${ok})
    `;
  } catch (error) {
    console.error("AI call log failed:", error.message);
  }
}
