// Step 2 of the matching eval: turn collected candidates into (tracked product,
// candidate) pairs. The candidate text is the product name read from the page when
// available, otherwise the search-result title.
//
// Usage (from the project root): node eval/build-pairs.mjs
import { readFile, writeFile } from "node:fs/promises";

const data = (f) => new URL(`./data/${f}`, import.meta.url);
const discoveries = JSON.parse(await readFile(data("discoveries.json"), "utf8"));

const pairs = discoveries.flatMap((d) =>
  d.candidates.map((c) => ({
    id: `${d.productId}:${c.id}`,
    productId: d.productId,
    category: d.category,
    productName: d.productName,
    candidate: c.name ?? c.title,
    source: c.name ? "page" : "title",
    shop: c.shop,
    url: c.url,
  }))
);

await writeFile(data("pairs.json"), JSON.stringify(pairs, null, 2));
console.log(`Wrote ${pairs.length} pairs (${pairs.filter((p) => p.source === "page").length} from pages, ${pairs.filter((p) => p.source === "title").length} from titles)`);
