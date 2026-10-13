// Client for TypeSafe's Jev decision model via OpenRouter's Decisions API.
// The endpoint is under /api/alpha/, so keep every Jev call going through here.
// Docs: https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const JEV_MODEL = "typesafe/jev-1.13";

export async function decide(state, questions) {
  const started = Date.now();

  const res = await fetch(DECISIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state,
      questions,
      // Product data is public, but don't let providers keep it anyway
      provider: { data_collection: "deny" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Jev ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const latencyMs = Date.now() - started;

  console.log(
    `Jev ${data.model}: ${latencyMs}ms, ${data.usage.input_tokens} tokens, $${data.usage.cost ?? "?"}`
  );

  return {
    answers: data.answers,
    model: data.model,
    usage: data.usage,
    latencyMs,
  };
}
