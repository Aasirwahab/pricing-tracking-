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

## v3: a real-world miss (Casio A500WA-7, Sri Lanka)

A user searched the A500WA-7 with "Shops in: Sri Lanka" and got "no shops in Sri Lanka", while Google
showed Sri Lankan shops. The stored decision trail showed three separate causes:

| Finding | Cause | Fix |
|---|---|---|
| Google's top result (mzwatcheslk.com) was **not** a miss | It sells the **A500WA-1** (black), not the -7 (silver); Google itself showed "Missing: 7df" | None: correctly rejected (title 0.06) |
| ubuy.com.lk A500WA-7 never reached the pipeline | "Shops in" only biases search; a plain and a "... Sri Lanka" search both missed it | Add a site-restricted search (`Casio A500WA-7 site:lk`, brand + model code only). Probe: 10/10 Sri Lankan results, the A500WA-7 page first, ~2 credits |
| watchfactory.com.au "A500WA-7D" rejected (0.37) | Regional suffix again | Give Jev a fact computed by code: does the text contain the tracked model codes (punctuation ignored, suffixes allowed)? |
| ubuy page read as "no price" | Price is filled in by JavaScript per visitor country; not in the HTML, JSON-LD, or meta tags, and a Sri Lanka scrape location returned an empty page | Show it under "Also listed (price not shown to us)" when the title carries the exact model code and Jev leans "same" |

### Does the model-code fact help Jev?

Jev is not deterministic, so before trusting a 2-pair change, both versions were run 3 times on the same 52 pairs:

| | Accuracy (3 runs) | AUC | Brier |
|---|---|---|---|
| Without code fact | 86.5 / 88.5 / 88.5 | 0.959-0.961 | 0.084-0.085 |
| With code fact | 88.5 / 86.5 / 88.5 | 0.962-0.966 | 0.091-0.094 |

- **Run-to-run noise is about one pair (±2% accuracy)** and up to 0.13 on a single pair's probability.
  Any accuracy difference under ~2 pairs on this set is noise.
- On the 52 pairs the fact is roughly neutral: slightly better ranking (AUC), slightly worse calibration
  (Brier). On the real failure it moved "A500WA-7D" from 0.37 to 0.45-0.51, still borderline.
- Kept because it fixes an observed production case and is cheap; flagged for the larger held-out set.

**Lesson:** the biggest gap was **search coverage**, not matching. A shop the pipeline never sees can't
be matched, which the identity eval (which only scores candidates that were found) cannot reveal. A
recall eval ("for products with known local shops, how many does discovery find?") is the next measurement.

## v4: model-code aliases (Casio LTP-1302D-5A, Sri Lanka)

The user searched "LTP-1302**D**-5A". Sri Lankan shops (and Google's own results) list the same watch as
"LTP-1302**DD**-5AV"; only one shop worldwide used the user's exact code. The pipeline found 20+ Sri Lankan
results but rejected every one: the rule "different model code = different product" is right for
A500WA-1 vs -7, but here the code differs in the **middle** (D vs DD), which the suffix-tolerant check
did not allow.

| Finding | Fix |
|---|---|
| Codes differing only by small letter changes are likely aliases, not different products | `nearModelCode`: same leading letters (LTP, not MTP), **identical digits** (so -5A brown ≠ -1A black ≠ -4A pink), ≤2 letter edits in the core, any extra letters at the end (V, DF, VDF). 15 unit cases incl. negatives (XM4/XM5, A35/A55, iPhone 14/15, SRPD51/55) |
| Ambiguous evidence should not be decided for the user | Near-code shops that Jev doesn't confirm are shown as **"Similar models"** with prices (local first) and can be tracked; never ranked as matches |
| The aliased shops were missing from search results entirely | **Alias search:** when no local result looks like a match, the most common near code among shop results (e.g. "LTP-1302DD-5A") is searched on the country's sites (~2 credits) and checked the same way |
| "128GB" was treated as a model code, so iPhone 14 128GB "contained the code" of iPhone 15 128GB | Capacity/size tokens are no longer model identity (eval re-run: Jev precision 94.9% → 97.3%, AUC 0.969) |
| One unsupported URL (facebook.com) failed the whole batch of page reads | Social/video platforms are never sent to the page reader; a rejected batch falls back to individual reads (2 at a time) |

Result for the same search: ceylonhome.lk "LTP-1302DD-5AV", LKR 17,050 (the price Google showed), shown first
under Similar models; ubuy.com.lk listed with a hidden price; look-alikes (men's MTP, pink -4A2V,
LTP-1314D) correctly rejected. 33 credits, 28 s. gearz.lk was not returned by the search engine for any
query: no single search engine sees every shop.
