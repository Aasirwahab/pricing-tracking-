# Eval Iterations

How the "same product?" decision was measured and improved. Each iteration runs
`node --env-file=.env.local eval/run.mjs` on the same 52 labeled pairs (8 searches, 4 categories;
41 same, 11 not same; 28 unclear pairs excluded, see [`LABELS.md`](LABELS.md)).

## v1: first measurement

| Method | Accuracy | Precision | Recall | F1 | AUC | Cost / 1k pairs | Latency / call |
|---|---|---|---|---|---|---|---|
| always-same | 78.8% | 78.8% | 100.0% | 0.882 | 0.500 | $0 | <1 ms |
| token-jaccard | 65.4% | 76.7% | 80.5% | 0.786 | 0.774 | $0 | <1 ms |
| model-number | 88.5% | 87.2% | 100.0% | 0.932 | 0.727 | $0 | <1 ms |
| embeddings | 75.0% | 80.4% | 90.2% | 0.851 | 0.863 | $0.0003 | 6084 ms |
| llm-judge | 78.8% | 89.5% | 82.9% | 0.861 | 0.733 | $0.0134 | 1631 ms |
| jev | 75.0% | 88.9% | 78.0% | 0.831 | 0.865 | $0.0084 | 625 ms |

Jev calibration was under-confident: pairs it scored 0.2-0.4 were actually the same 83% of the time
(Brier 0.145).

### Error analysis (Jev: 12 errors, LLM judge: 11 errors)

| Cause | Jev | LLM | Example |
|---|---|---|---|
| Refurbished / renewed treated as a different product | 4 | 3 | "iPhone 15, 128GB, Black (Renewed)" scored 0.40 |
| Category / "25+ for sale" pages treated as the product | 4 | 3 | "Shop iPhone 15 128GB Cell Phones - Walmart" scored 0.64 |
| Regional suffixes | 3 | 1 | "A159W-N1DF ... Black Digital Dial" scored 0.32 |
| Accessory sold alone | 0 | 1 | LLM said YES to "MagSafe Charging Case USB-C" alone |
| Colorway wording | 1 | 1 | "Cloud White Black Gum" (= Clear Granite) |

**Diagnosis:** the two biggest causes were not model failures but a **spec mismatch**: the labeling
rules say condition is not identity and a category page is not a product, but the criteria given to
the models never said so.

The free **model-number** rule scored best on accuracy because listing names usually contain model
codes, but it cannot see color: it called "WH-1000XM5 ... Midnight Blue" the same as the Black one,
which Jev got right. Jev used 8 requests (one per product) against the LLM judge's 52 (one per pair).

### Fix for v2

- One shared definition of "same product" (`SAME_PRODUCT` in `lib/discover.js`) used by both the
  production search and the eval, so the eval measures what users get.
- It now states the two labeling rules that were missing: condition is not identity; a category,
  search-results or "items for sale" page is not one product.
- Deliberately **not** added: the specific suffixes seen in the errors (`D`, `K1`), which would tune
  the definition to the test set.
- New **cascade** method: the free model-code rule rejects mismatched codes; Jev judges the rest.

## v2: shared "same product" definition + cascade

| Method | Accuracy | Precision | Recall | F1 | AUC | Cost / 1k pairs | Latency / call |
|---|---|---|---|---|---|---|---|
| always-same | 78.8% | 78.8% | 100.0% | 0.882 | 0.500 | $0 | <1 ms |
| token-jaccard | 65.4% | 76.7% | 80.5% | 0.786 | 0.774 | $0 | <1 ms |
| model-number | 88.5% | 87.2% | 100.0% | 0.932 | 0.727 | $0 | <1 ms |
| embeddings | 75.0% | 80.4% | 90.2% | 0.851 | 0.863 | $0.0003 | 4704 ms |
| llm-judge | 86.5% | 92.5% | 90.2% | 0.914 | 0.815 | $0.0198 | 1216 ms |
| **jev** | **88.5%** | **94.9%** | 90.2% | 0.925 | **0.961** | $0.0101 | 635 ms |
| cascade | 88.5% | 94.9% | 90.2% | 0.925 | 0.966 | $0.0091 | 635 ms |

**What changed (v1 → v2):**
- Jev precision 88.9% → 94.9%, AUC 0.865 → 0.961, calibration (Brier) 0.145 → 0.085. When Jev says
  0.8-1.0, the pair was the same 100% of the time (26 pairs).
- LLM judge precision 89.5% → 92.5%, AUC 0.733 → 0.815.
- Per pair, Jev is ~12x faster than the LLM judge (8 requests x 635 ms for 52 pairs ≈ 100 ms/pair vs
  1,216 ms/pair) and about half the cost, because one request scores every candidate for a product.
- The cascade made the same decisions as Jev on this data and skipped Jev for pairs whose model codes
  clearly differ (~10% cheaper). With more data it should matter more; here it is a cost saving only.

**Production choice:** Jev with the shared definition (already what `lib/discover.js` uses). The
model-code pre-check is not added to production yet: on this data it changed no decisions and would
save only ~$0.001 per 1,000 pairs. Revisit with the larger held-out set.

**Honest caveats:**
- 52 scored pairs is small; one pair is ~2 percentage points of accuracy.
- The v2 definition was written after reading v1's errors. The two added rules come from the
  labeling spec that existed before v1 (not from individual errors), and error-specific suffixes were
  deliberately left out, but a **fresh held-out set** is still needed to confirm v2. Planned for the
  next credit cycle.
- Shoes remain hard for every method (62.5% best): listing names usually omit the colorway, so
  identity needs the style code (e.g. `CW2288-111`) or the selected color from the page itself.
