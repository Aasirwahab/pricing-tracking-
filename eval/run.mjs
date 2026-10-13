// Step 3 of the matching eval: compare methods on the labeled pairs and write
// eval/results.md + eval/data/results.json.
//
// Question per pair: is the candidate listing exactly the same product as the
// tracked product (same model, variant, color, capacity)?
//
// Methods:
//   token-jaccard   word-overlap similarity           (threshold tuned, see below)
//   model-number    model-code rule (e.g. A159W-N1)    (no tuning)
//   embeddings      cosine similarity, openai/text-embedding-3-small (threshold tuned)
//   llm-judge       Gemini 2.5 Flash-Lite answers YES/NO (no tuning)
//   jev             TypeSafe Jev noul probability, 0.5  (no tuning)
//
// Tuned thresholds use leave-one-product-out: for each product, the threshold is
// chosen on the other 7 products and applied to the held-out one, so no method is
// scored on data it was tuned on.
//
// Usage (from the project root): node --env-file=.env.local eval/run.mjs
import { readFile, writeFile } from "node:fs/promises";
import { decide, JEV_MODEL } from "../lib/jev.js";
import { generateText, DEFAULT_MODEL } from "../lib/llm.js";

const data = (f) => new URL(`./data/${f}`, import.meta.url);
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

const SAME_RULE =
  "Same brand, model and variant (color, size, capacity). Regional, retailer or packaging suffixes on the same model number and different listing wording do not make it a different product. A different model number, variant, color, storage or capacity, an accessory or part, or a bundle/multi-pack is NOT the same product.";

// ---------- data ----------
const pairs = JSON.parse(await readFile(data("pairs.json"), "utf8"));
const labels = JSON.parse(await readFile(data("labels.json"), "utf8"));
const labeled = pairs
  .filter((p) => labels[p.id] && typeof labels[p.id].same === "boolean")
  .map((p) => ({ ...p, same: labels[p.id].same }));
const products = [...new Set(labeled.map((p) => p.productId))];
console.log(`${labeled.length} labeled pairs across ${products.length} products (${labeled.filter((p) => p.same).length} same, ${labeled.filter((p) => !p.same).length} not same)`);

// ---------- methods ----------
const tokens = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
function tokenJaccard(p) {
  const a = tokens(p.productName), b = tokens(p.candidate);
  const inter = [...a].filter((t) => b.has(t)).length;
  return inter / (a.size + b.size - inter);
}

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// Model-like codes: tokens with both letters and digits (A159W-N1, SRPD55, WH-1000XM5, 128GB).
const modelCodes = (s) => s.split(/\s+/).map(squash).filter((t) => /[a-z]/.test(t) && /\d/.test(t) && t.length >= 3);
function modelNumber(p) {
  const codes = modelCodes(p.productName);
  if (codes.length === 0) return tokenJaccard(p) >= 0.5 ? 1 : 0;
  const text = squash(p.candidate);
  return codes.every((c) => text.includes(c)) ? 1 : 0;
}

async function embeddingScores(items) {
  const texts = [...new Set(items.flatMap((p) => [p.productName, p.candidate]))];
  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const vec = new Map(texts.map((t, i) => [t, json.data[i].embedding]));
  const cos = (a, b) => {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
    return d / Math.sqrt(na * nb);
  };
  return {
    scores: items.map((p) => cos(vec.get(p.productName), vec.get(p.candidate))),
    cost: json.usage?.cost ?? 0,
    ms: Date.now() - started,
    calls: 1,
  };
}

async function llmScores(items) {
  let cost = 0, ms = 0;
  const scores = new Array(items.length);
  const queue = items.map((p, i) => [p, i]);
  const worker = async () => {
    while (queue.length) {
      const [p, i] = queue.shift();
      const { text, usage, latencyMs } = await generateText({
        kind: "eval_llm",
        system: `You decide if a shop listing is exactly the same product as a tracked product. ${SAME_RULE} Answer with exactly one word: YES or NO.`,
        prompt: `Tracked product: ${p.productName}\nListing: ${p.candidate}`,
        maxTokens: 3,
      });
      scores[i] = /^\s*yes/i.test(text) ? 1 : 0;
      cost += usage?.cost ?? 0;
      ms += latencyMs;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { scores, cost, ms, calls: items.length };
}

// Jev is called the way production calls it: one request per product, one question per candidate.
async function jevScores(items) {
  let cost = 0, ms = 0, calls = 0;
  const scores = new Array(items.length);
  for (const productId of products) {
    const idx = items.map((p, i) => [p, i]).filter(([p]) => p.productId === productId);
    const { answers, usage, latencyMs } = await decide(
      { tracked_product: idx[0][0].productName, candidates: idx.map(([p], k) => ({ id: `c${k}`, name: p.candidate })) },
      Object.fromEntries(idx.map((_, k) => [`c${k}`, {
        type: "noul",
        instructions: `Is candidate c${k} exactly the same product as the tracked product?`,
        criteria: { true: "Exactly the same product and variant (regional/packaging suffixes allowed).", false: SAME_RULE },
      }])),
      "eval_jev"
    );
    idx.forEach(([, i], k) => (scores[i] = answers[`c${k}`].noul));
    cost += usage.cost ?? 0; ms += latencyMs; calls++;
  }
  return { scores, cost, ms, calls };
}

// ---------- metrics ----------
function confusion(items, preds) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  items.forEach((p, i) => (preds[i] ? (p.same ? tp++ : fp++) : (p.same ? fn++ : tn++)));
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    accuracy: (tp + tn) / items.length, precision, recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    tp, fp, tn, fn,
  };
}

// Probability that a random "same" pair scores higher than a random "not same" pair.
function auc(items, scores) {
  const pos = scores.filter((_, i) => items[i].same), neg = scores.filter((_, i) => !items[i].same);
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return pos.length && neg.length ? wins / (pos.length * neg.length) : null;
}

const brier = (items, probs) => probs.reduce((s, p, i) => s + (p - (items[i].same ? 1 : 0)) ** 2, 0) / items.length;

function calibration(items, probs, bins = 5) {
  return Array.from({ length: bins }, (_, b) => {
    const lo = b / bins, hi = (b + 1) / bins;
    const inBin = probs.map((p, i) => [p, items[i].same]).filter(([p]) => p >= lo && (p < hi || (b === bins - 1 && p <= hi)));
    return {
      range: `${lo.toFixed(1)}-${hi.toFixed(1)}`,
      n: inBin.length,
      meanPredicted: inBin.length ? inBin.reduce((s, [p]) => s + p, 0) / inBin.length : null,
      observedSame: inBin.length ? inBin.filter(([, y]) => y).length / inBin.length : null,
    };
  });
}

// Leave-one-product-out threshold: best-accuracy threshold on the other products.
function cvPredictions(items, scores) {
  const preds = new Array(items.length);
  const thresholds = [];
  for (const held of products) {
    const train = items.map((p, i) => [p, scores[i]]).filter(([p]) => p.productId !== held);
    const candidates = [...new Set(train.map(([, s]) => s))].sort((a, b) => a - b);
    let best = 0.5, bestAcc = -1;
    for (const t of candidates) {
      const acc = train.filter(([p, s]) => (s >= t) === p.same).length / train.length;
      if (acc > bestAcc) { bestAcc = acc; best = t; }
    }
    thresholds.push(best);
    items.forEach((p, i) => { if (p.productId === held) preds[i] = scores[i] >= best; });
  }
  return { preds, meanThreshold: thresholds.reduce((a, b) => a + b, 0) / thresholds.length };
}

// ---------- run ----------
const results = {};
const add = (name, scores, { preds, probabilistic, cost = 0, ms = 0, calls = 0, threshold }) => {
  results[name] = {
    ...confusion(labeled, preds),
    auc: auc(labeled, scores),
    brier: probabilistic ? brier(labeled, scores) : null,
    calibration: probabilistic ? calibration(labeled, scores) : null,
    threshold,
    costPer1kPairs: (cost / labeled.length) * 1000,
    msPerCall: calls ? ms / calls : 0,
    calls,
    byCategory: Object.fromEntries([...new Set(labeled.map((p) => p.category))].map((cat) => {
      const idx = labeled.map((p, i) => i).filter((i) => labeled[i].category === cat);
      return [cat, idx.filter((i) => preds[i] === labeled[i].same).length / idx.length];
    })),
  };
  console.log(`${name.padEnd(14)} acc=${results[name].accuracy.toFixed(3)} f1=${results[name].f1.toFixed(3)}`);
};

const jac = labeled.map(tokenJaccard);
const jacCv = cvPredictions(labeled, jac);
add("token-jaccard", jac, { preds: jacCv.preds, threshold: `${jacCv.meanThreshold.toFixed(2)} (LOPO-tuned)` });

const mn = labeled.map(modelNumber);
add("model-number", mn, { preds: mn.map(Boolean), threshold: "rule" });

const emb = await embeddingScores(labeled);
const embCv = cvPredictions(labeled, emb.scores);
add("embeddings", emb.scores, { preds: embCv.preds, threshold: `${embCv.meanThreshold.toFixed(3)} (LOPO-tuned)`, cost: emb.cost, ms: emb.ms, calls: emb.calls });

const llm = await llmScores(labeled);
add("llm-judge", llm.scores, { preds: llm.scores.map(Boolean), cost: llm.cost, ms: llm.ms, calls: llm.calls, threshold: "YES/NO" });

const jev = await jevScores(labeled);
add("jev", jev.scores, { preds: jev.scores.map((s) => s >= 0.5), probabilistic: true, cost: jev.cost, ms: jev.ms, calls: jev.calls, threshold: "0.5" });

await writeFile(data("results.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  models: { embeddings: EMBEDDING_MODEL, llm: DEFAULT_MODEL, jev: JEV_MODEL },
  dataset: { pairs: labeled.length, products: products.length, same: labeled.filter((p) => p.same).length },
  results,
  errors: Object.fromEntries(Object.keys(results).map((m) => [m, []])),
}, null, 2));

// ---------- report ----------
const pct = (x) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const cats = [...new Set(labeled.map((p) => p.category))];
const row = (name) => {
  const r = results[name];
  return `| ${name} | ${pct(r.accuracy)} | ${pct(r.precision)} | ${pct(r.recall)} | ${r.f1.toFixed(3)} | ${r.auc == null ? "–" : r.auc.toFixed(3)} | ${r.costPer1kPairs ? "$" + r.costPer1kPairs.toFixed(4) : "$0"} | ${r.msPerCall ? Math.round(r.msPerCall) + " ms" : "<1 ms"} |`;
};

const md = `# Matching Eval Results

_Generated ${new Date().toISOString().slice(0, 10)} by \`eval/run.mjs\`._

**Task:** is a shop listing exactly the same product as the tracked product (same model, variant, color, capacity)?
**Dataset:** ${labeled.length} labeled pairs from ${products.length} real "Find best prices" searches across ${cats.length} categories (${labeled.filter((p) => p.same).length} same, ${labeled.filter((p) => !p.same).length} not same). Labels drafted by Claude and reviewed by a human; see [\`LABELS.md\`](LABELS.md).

| Method | Accuracy | Precision | Recall | F1 | AUC | Cost / 1k pairs | Latency / call |
|---|---|---|---|---|---|---|---|
${Object.keys(results).map(row).join("\n")}

- **AUC** is threshold-free: the chance a random "same" pair scores higher than a random "not same" pair. Binary methods (model-number, llm-judge) have a lower ceiling here.
- **token-jaccard** and **embeddings** thresholds were tuned leave-one-product-out (mean thresholds: ${results["token-jaccard"].threshold}, ${results.embeddings.threshold}); **llm-judge** and **jev** use no tuning.
- **Jev** latency is per request; one request scores every candidate for a product (${results.jev.calls} requests total). LLM latency is per pair (${results["llm-judge"].calls} requests).

## Accuracy by category

| Method | ${cats.join(" | ")} |
|---|${cats.map(() => "---").join("|")}|
${Object.keys(results).map((m) => `| ${m} | ${cats.map((c) => pct(results[m].byCategory[c])).join(" | ")} |`).join("\n")}

## Jev calibration

When Jev says "X% likely the same product", how often is it actually the same? (Brier score: ${results.jev.brier.toFixed(3)}, lower is better.)

| Predicted range | Pairs | Mean predicted | Actually same |
|---|---|---|---|
${results.jev.calibration.map((b) => `| ${b.range} | ${b.n} | ${pct(b.meanPredicted)} | ${pct(b.observedSame)} |`).join("\n")}

## Models

- Embeddings: \`${EMBEDDING_MODEL}\`
- LLM judge: \`${DEFAULT_MODEL}\`
- Jev: \`${JEV_MODEL}\`
`;

await writeFile(new URL("./results.md", import.meta.url), md);
console.log("\nWrote eval/results.md and eval/data/results.json");
