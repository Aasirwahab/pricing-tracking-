# Screenshot Identification: First Findings

"Add by screenshot" sends the image to a vision model, which returns brand, model, variant, and
a confidence score. The user always confirms or edits the name before any search runs.

This is a **small exploratory check** (4 product photos + 1 shop screenshot), not a full eval.
It was enough to choose a model and shape the UX.

## Test 1: bare product photos (4 images, 6 models)

Inputs were the product images from real shop pages for Casio A159W-N1, Seiko SRPD55,
Galaxy A55 Awesome Navy, and iPhone 15 Black. "Model" means the exact model code was right.

| Vision model | Exact model | Variant (color) | Avg latency | Cost / image |
|---|---|---|---|---|
| google/gemini-2.5-flash-lite | 0/4 | 2/4 | 9.0 s | $0.00018 |
| **google/gemini-3.1-flash-lite** | **2/4** | **3/4** | 8.3 s | $0.00045 |
| google/gemini-2.5-flash | 1/4 | 3/4 | 8.3 s | $0.00062 |
| openai/gpt-5-mini | 1/4 | 3/4 | 15.0 s | $0.00171 |
| anthropic/claude-haiku-4.5 | 1/4 | 3/4 | 8.1 s | $0.00185 |
| qwen/qwen3.7-flash | 1/4 | 2/4 | 9.1 s | $0.00007 |

- Look-alike products are the hard part: Galaxy A55 vs A54 / F54 / M55, iPhone 15 vs 14 Pro / 15 Plus,
  Casio A159W vs A158W / A168W. They differ in details a photo barely shows.
- **Self-reported confidence was unreliable:** most models said 0.8-1.0 while wrong. The cheapest
  model called a navy Galaxy A55 a "Galaxy A14 5G Dark Red" with 0.8 confidence.

## Test 2: a real shop-page screenshot (photo + title text)

A screenshot of a Casio shop page showing the watch photo and the title
"CASIO UNISEX VINTAGE WATCH A159W-N1 QUARTZ DIGITAL SILVER BLACK":

| Vision model | Result | Latency |
|---|---|---|
| google/gemini-2.5-flash-lite | A159W-N1, Silver Black ✓ | 7.1 s |
| google/gemini-3.1-flash-lite | A159W-N1, Silver/Black ✓ | 2.4 s |
| qwen/qwen3.7-flash | A159W-N1, Silver Black ✓ | 6.5 s |

## Decisions

1. **Model:** `google/gemini-3.1-flash-lite`: best on photos, fastest on the screenshot, ~$0.00045 per
   image. Identification runs once per screenshot, so accuracy matters more than price.
2. **Always confirm:** the identified name is shown as editable text; nothing is searched until the
   user presses "Find shops". Confidence is not used to skip confirmation.
3. **Guide the input:** the UI says screenshots work best when they show the product title or model
   number, because vision models read text far more reliably than they tell look-alikes apart.
4. **Images are not stored:** shrunk to max 1024 px in the browser, sent to the vision model, discarded.

## Next

A proper eval needs real user screenshots (shop pages, social posts, photos of price tags), labeled
with the exact model, scored on exact-model and variant accuracy, and checked for calibration.
