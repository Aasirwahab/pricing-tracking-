# Matching Eval Results

_Generated 2026-10-13 by `eval/run.mjs`._

**Task:** is a shop listing exactly the same product as the tracked product (same model, variant, color, capacity)?
**Dataset:** 52 labeled pairs from 8 real "Find best prices" searches across 4 categories (41 same, 11 not same). Labels drafted by Claude and reviewed by a human; see [`LABELS.md`](LABELS.md).

| Method | Accuracy | Precision | Recall | F1 | AUC | Cost / 1k pairs | Latency / call |
|---|---|---|---|---|---|---|---|
| always-same | 78.8% | 78.8% | 100.0% | 0.882 | 0.500 | $0 | <1 ms |
| token-jaccard | 65.4% | 76.7% | 80.5% | 0.786 | 0.774 | $0 | <1 ms |
| model-number | 88.5% | 87.2% | 100.0% | 0.932 | 0.727 | $0 | <1 ms |
| embeddings | 75.0% | 80.4% | 90.2% | 0.851 | 0.863 | $0.0003 | 4704 ms |
| llm-judge | 86.5% | 92.5% | 90.2% | 0.914 | 0.815 | $0.0198 | 1216 ms |
| jev | 88.5% | 94.9% | 90.2% | 0.925 | 0.961 | $0.0101 | 635 ms |
| cascade | 88.5% | 94.9% | 90.2% | 0.925 | 0.966 | $0.0091 | 635 ms |

- **always-same** is the floor: 78.8% of pairs are "same", so accuracy alone flatters every method. Precision (how often a "same" verdict is right) and F1/AUC are the fairer comparison.
- 28 pairs were labeled **unclear** (the text omits the deciding variant) and are excluded.
- **AUC** is threshold-free: the chance a random "same" pair scores higher than a random "not same" pair. Binary methods (model-number, llm-judge) have a lower ceiling here.
- **token-jaccard** and **embeddings** thresholds were tuned leave-one-product-out (mean thresholds: 0.20 (LOPO-tuned), 0.706 (LOPO-tuned)); **llm-judge** and **jev** use no tuning.
- **Jev** latency is per request; one request scores every candidate for a product (8 requests total). LLM latency is per pair (52 requests).

## Accuracy by category

| Method | watches | phones | headphones | shoes |
|---|---|---|---|---|
| always-same | 88.2% | 84.6% | 78.6% | 50.0% |
| token-jaccard | 47.1% | 84.6% | 78.6% | 50.0% |
| model-number | 100.0% | 92.3% | 78.6% | 75.0% |
| embeddings | 70.6% | 92.3% | 78.6% | 50.0% |
| llm-judge | 88.2% | 100.0% | 85.7% | 62.5% |
| jev | 82.4% | 100.0% | 100.0% | 62.5% |
| cascade | 82.4% | 100.0% | 100.0% | 62.5% |

## Jev calibration

When Jev says "X% likely the same product", how often is it actually the same? (Brier score: 0.085, lower is better.)

| Predicted range | Pairs | Mean predicted | Actually same |
|---|---|---|---|
| 0.0-0.2 | 7 | 5.7% | 0.0% |
| 0.2-0.4 | 4 | 27.0% | 50.0% |
| 0.4-0.6 | 7 | 51.6% | 85.7% |
| 0.6-0.8 | 8 | 71.0% | 87.5% |
| 0.8-1.0 | 26 | 89.5% | 100.0% |

## Models

- Embeddings: `openai/text-embedding-3-small`
- LLM judge: `google/gemini-2.5-flash-lite`
- Jev: `typesafe/jev-1.13`
