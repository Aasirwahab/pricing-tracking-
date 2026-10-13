// Text generation through OpenRouter's OpenAI-compatible chat API. Any OpenRouter
// model id works, so models can be swapped (and benchmarked) without code changes.
import { logAiCall } from "./ai-log.js";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
// Cheap and good enough for short summaries (~$0.00006 per price insight)
export const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

export async function generateText({
  kind,
  system,
  prompt,
  model = DEFAULT_MODEL,
  maxTokens = 200,
}) {
  const started = Date.now();

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
      usage: { include: true },
      provider: { data_collection: "deny" },
    }),
  });

  if (!res.ok) {
    await logAiCall({ kind, model, latencyMs: Date.now() - started, ok: false });
    throw new Error(`LLM ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const latencyMs = Date.now() - started;
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";

  console.log(
    `LLM ${data.model}: ${latencyMs}ms, ${data.usage?.prompt_tokens}+${data.usage?.completion_tokens} tokens, $${data.usage?.cost ?? "?"}`
  );

  await logAiCall({
    kind,
    model: data.model ?? model,
    latencyMs,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    costUsd: data.usage?.cost,
    ok: text.length > 0,
  });

  return { text, model: data.model ?? model, usage: data.usage, latencyMs };
}
