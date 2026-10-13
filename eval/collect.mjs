// Step 1 of the matching eval: run the real discovery pipeline for each product in
// eval/products.json and save every candidate (search result + page read).
// Resumable: products already in eval/data/discoveries.json are skipped, so a re-run
// never re-spends Firecrawl credits.
//
// Usage (from the project root): node --env-file=.env.local eval/collect.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { discoverShops } from "../lib/discover.js";

const OUT = new URL("./data/discoveries.json", import.meta.url);
const products = JSON.parse(await readFile(new URL("./products.json", import.meta.url), "utf8"));

await mkdir(new URL("./data/", import.meta.url), { recursive: true });
const done = JSON.parse(await readFile(OUT, "utf8").catch(() => "[]"));

const credits = async () => {
  const res = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", {
    headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
  });
  return (await res.json()).data.remainingCredits;
};

for (const product of products) {
  if (done.some((d) => d.productId === product.id)) {
    console.log(`skip ${product.id} (already collected)`);
    continue;
  }

  const before = await credits();
  const started = Date.now();
  const { query, candidates } = await discoverShops({
    productName: product.name,
    country: product.country,
    location: product.location,
    localTld: product.country === "gb" ? ".uk" : `.${product.country}`,
  });
  const after = await credits();

  done.push({
    productId: product.id,
    category: product.category,
    productName: product.name,
    country: product.country,
    query,
    seconds: Math.round((Date.now() - started) / 1000),
    creditsUsed: before - after,
    collectedAt: new Date().toISOString(),
    candidates,
  });
  await writeFile(OUT, JSON.stringify(done, null, 2));

  const read = candidates.filter((c) => c.status !== "skipped").length;
  console.log(
    `${product.id}: ${candidates.length} results, ${read} pages read, ` +
      `${candidates.filter((c) => c.status === "match").length} matches, ` +
      `${before - after} credits, ${Math.round((Date.now() - started) / 1000)}s`
  );
}

console.log(`\nCollected ${done.length}/${products.length} products. Credits left: ${await credits()}`);
