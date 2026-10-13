import { createHash } from "node:crypto";
import { sql } from "./db.js";
import { DEFAULT_MODEL, generateText } from "./llm.js";
import { insightFacts, templateSummary, usesOnlyKnownNumbers } from "./analysis.js";

const SYSTEM_PROMPT = `You write a short shopping insight for a price tracker.
Rules:
- Use ONLY the facts given. Do not add any number, price, percentage, or date that is not in the facts.
- Do not predict future prices.
- 1 or 2 sentences, under 45 words, plain friendly English, no emojis, no markdown.
- Lead with whether now is a good time to buy, then the most useful detail.`;

// Returns a plain-language summary of a pricing analysis. The LLM only rephrases the
// computed facts; results are cached by the facts, so it runs again only when they change.
export async function getInsight(analysis) {
  const facts = insightFacts(analysis);
  const fallback = { summary: templateSummary(analysis, facts), source: "template" };

  if (!process.env.OPENROUTER_API_KEY) return fallback;

  const inputHash = createHash("sha256")
    .update(JSON.stringify({ facts, model: DEFAULT_MODEL, prompt: SYSTEM_PROMPT }))
    .digest("hex");

  const [cached] = await sql`
    select summary, model from price_insights where input_hash = ${inputHash}
  `;
  if (cached) return { summary: cached.summary, source: "ai", model: cached.model };

  try {
    const { text, model } = await generateText({
      kind: "price_insight",
      system: SYSTEM_PROMPT,
      prompt: `Facts:\n${JSON.stringify(facts, null, 2)}`,
      maxTokens: 120,
    });

    if (!text || !usesOnlyKnownNumbers(text, facts)) {
      console.warn("Price insight rejected (empty or unknown numbers):", text);
      return fallback;
    }

    await sql`
      insert into price_insights (input_hash, summary, model)
      values (${inputHash}, ${text}, ${model})
      on conflict (input_hash) do nothing
    `;
    return { summary: text, source: "ai", model };
  } catch (error) {
    console.error("Price insight failed:", error.message);
    return fallback;
  }
}
