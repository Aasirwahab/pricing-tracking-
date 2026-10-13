// Renders eval/LABELS.md from pairs.json + labels.json so labels can be reviewed.
// Usage (from the project root): node eval/labels-report.mjs
import { readFile, writeFile } from "node:fs/promises";

const data = (f) => new URL(`./data/${f}`, import.meta.url);
const pairs = JSON.parse(await readFile(data("pairs.json"), "utf8"));
const labels = JSON.parse(await readFile(data("labels.json"), "utf8"));

const mark = (v) => (v === true ? "✅ same" : v === false ? "❌ not same" : "➖ unclear");
const counts = { true: 0, false: 0, null: 0 };
pairs.forEach((p) => counts[String(labels[p.id]?.same ?? null)]++);

let md = `# Eval Labels

Each row asks: **does the candidate refer to exactly the same product as the tracked product?**

Rules:
- **✅ same**: same model and variant (color, storage, size). Regional/packaging suffixes don't matter
  (\`A159W-N1DF\` = \`A159W-N1\`, \`SRPD55K1\` = \`SRPD55\`). Condition doesn't matter (refurbished is still
  the same product; condition is a separate field in the app).
- **❌ not same**: a different variant (e.g. Midnight Blue vs Black), an accessory, a comparison of two
  products, or a category / "25+ for sale" page.
- **➖ unclear**: the text names the model but omits the deciding variant (e.g. no color for shoes).
  Nobody can decide from the text alone, so these are **excluded from scoring**.

Totals: **${counts.true} same, ${counts.false} not same, ${counts.null} unclear (excluded)** out of ${pairs.length} pairs.
Labels drafted by Claude, reviewed by a human. To correct one, edit \`eval/data/labels.json\` and re-run.
`;

for (const productId of [...new Set(pairs.map((p) => p.productId))]) {
  const rows = pairs.filter((p) => p.productId === productId);
  md += `\n## ${rows[0].productName}\n\n| ID | Label | Candidate (${rows[0].category}) | Shop | Note |\n|---|---|---|---|---|\n`;
  for (const p of rows) {
    const l = labels[p.id] ?? {};
    md += `| ${p.id.split(":")[1]} | ${mark(l.same)} | ${p.candidate.replace(/\|/g, "/")} | ${p.shop} | ${l.note ?? ""} |\n`;
  }
}

await writeFile(new URL("./LABELS.md", import.meta.url), md);
console.log(`Wrote eval/LABELS.md: ${counts.true} same, ${counts.false} not same, ${counts.null} unclear`);
