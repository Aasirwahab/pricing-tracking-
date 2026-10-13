# DealDrop Roadmap

## Vision (v1.0)

**AI price comparison for any product, any website, any currency.**
Add a product by **link**, **name**, or **screenshot**. DealDrop finds listings across shops, shows each
price in its original currency and in the currency you choose, and gives a **pricing analysis**:
the cheapest **trusted** seller, price history, and whether now is a good time to buy.

### How customers add a product

```
Link        ──→ scrape the page ──────────────────┐
Name        ──→ "Casio A159W silver" ─────────────┼──→ find shops → match listings (Jev) → pricing analysis
Screenshot  ──→ vision model identifies the product┘
                (brand / model / color, user confirms)
```

- Any kind of product, from any website, in any currency.
- Screenshots are shrunk in the browser (max ~1024px) before upload, sent to a vision model,
  and **not stored**. No image service is needed unless a later feature has to keep images.

### Pricing analysis (per product)

- Cheapest and most expensive shop right now, converted to the user's currency
- Price history: lowest ever, average, trend
- "Is this a good price?" (for example "12% below its 30-day average"), computed in code
- A short plain-language explanation written by an LLM from those computed numbers

### Definition of done

- [ ] Add products by link, name, or screenshot; any category, any website, any currency
- [ ] Listing matching accuracy measured and reported per category (4-5 categories)
- [ ] Screenshot identification accuracy measured on a test set of photos
- [ ] Models benchmarked on our own eval set (Jev vs other decision models vs LLMs), with a cascade
- [ ] Cost, latency, and accuracy tracked per request
- [ ] Tests and CI, including an eval regression check
- [ ] Live demo, real users, real usage numbers
- [ ] README with results table, architecture diagram, and demo video

## Versions

| Version | Goal | Main work | Status |
|---|---|---|---|
| v0.2 | Foundation | Migrate to Neon + Clerk + pnpm + Vercel Cron | ✅ Done |
| v0.3 | Go live | API keys ✅, local end-to-end test ✅, Brevo email + Resend fallback ✅; remaining: test alert email, deploy to Vercel | 🚧 Deploy pending |
| v0.4 | Data model + currency | Product → many shop listings; original price + currency per listing; daily exchange rates (open.er-api.com, 166 currencies); user's preferred currency; add another shop to a product | ✅ Done |
| v0.5 | Pricing analysis + AI foundation | Pricing analysis (daily best-price series, verdict in code) ✅; LLM summary with hallucination check + cache ✅; bad-price guard (Jev) ✅; swappable LLM layer ✅; scrape validation ✅; `ai_calls` cost/latency log ✅ | ✅ Done |
| v0.6 | Matching + eval | Labeled dataset (4-5 categories); string vs embeddings vs LLM vs Jev; calibration; model benchmark; cascade | ⏳ |
| v0.7 | Add by link, name, or screenshot | Name search and screenshot identification (vision model via OpenRouter) → find shops → match → compare; screenshot-accuracy eval | ⏳ |
| v0.8 | Production hardening | Tests, CI with eval, caching, rate limiting, error monitoring | ⏳ |
| v0.9 | Launch | Deploy, no-signup demo mode, share with communities, collect usage + feedback | ⏳ |
| v1.0 | Showcase | Results README, architecture diagram, demo video, write-up | ⏳ |

## Where each model is used (and where none is)

| Task | Model |
|---|---|
| Extract price, name, currency from a page | Firecrawl (LLM extraction) |
| Identify a product from a screenshot | Vision LLM via OpenRouter |
| Same product? Real price change? Seller trust? Category? Which currency is `$`? | **Jev** decision model (`typesafe/jev-1.13`) |
| Explain the pricing analysis | Small LLM |
| Currency conversion, sorting, stats, scheduling, access control | **Plain code, no model** |

## Later (after v1.0)

- Natural-language search ("silver watch under $50, ships to my country")
- Browser extension that compares prices on any shop page
- Storage for screenshots (Vercel Blob or ImageKit) only if a feature needs to keep them
