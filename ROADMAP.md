# DealDrop Roadmap

## Vision (v1.0)

**AI price comparison for any product, any website, any currency.**
Search a product or paste a link. DealDrop finds listings across shops, shows each price in its
original currency and in the currency you choose, and recommends the cheapest **trusted** seller.
It also tracks prices over time and alerts you when to buy.

### Definition of done

- [ ] Works for all product categories, on any website, in any currency
- [ ] Listing matching accuracy measured and reported per category (4-5 categories)
- [ ] Models benchmarked on our own eval set (Gemini and others), with a cheap-to-strong cascade
- [ ] Cost, latency, and accuracy tracked per request
- [ ] Tests and CI, including an eval regression check
- [ ] Live demo, real users, real usage numbers
- [ ] README with results table, architecture diagram, and demo video

## Versions

| Version | Goal | Main work | Status |
|---|---|---|---|
| v0.2 | Foundation | Migrate to Neon + Clerk + pnpm + Vercel Cron | ✅ Done |
| v0.3 | Go live | API keys, deploy to Vercel, verify cron + email with a real product | 🚧 In progress |
| v0.4 | Data model + currency | Product → many listings; original price + currency; exchange-rate layer; preferred currency | ⏳ |
| v0.5 | AI foundation | Model-swappable LLM layer; validated structured extraction; ~~bad-price guard~~ ✅ (Jev, confirm-on-second-sighting); cost/latency logging | 🚧 Started |
| v0.6 | Matching + eval | Labeled dataset (4-5 categories); string vs embeddings vs LLM; model benchmark; cascade | ⏳ |
| v0.7 | Search + compare UI | Search → find listings → match → price table (original + converted), trust score, buy links | ⏳ |
| v0.8 | Production hardening | Tests, CI with eval, caching, rate limiting, error monitoring | ⏳ |
| v0.9 | Launch | No-signup demo mode, share with communities, collect usage + feedback | ⏳ |
| v1.0 | Showcase | Results README, architecture diagram, demo video, write-up | ⏳ |

## Where the model is used (and where it isn't)

**LLM:** extracting product data from messy pages, normalizing titles, matching listings,
disambiguating currency symbols from context, judging seller trust, explaining recommendations,
parsing natural-language searches.

**Plain code:** currency conversion math, sorting and ranking, scheduling, access control.

## Later (after v1.0)

- Natural-language search ("silver watch under $50, ships to my country")
- Buy-or-wait insight from price history
- Browser extension that compares prices on any shop page
