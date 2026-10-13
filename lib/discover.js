// Finds other shops selling the same product:
//   search -> Jev pre-check on titles -> read the most promising pages -> Jev same-product check.
// Page reads cost ~5 Firecrawl credits each (search ~2), so the title pre-check exists
// to avoid reading pages that are obviously not shops or not the same product.
import FirecrawlApp from "@mendable/firecrawl-js";
import { scrapeProducts } from "./firecrawl.js";
import { decide } from "./jev.js";
import { generateText } from "./llm.js";

const SEARCH_RESULTS = 10;
const MAX_PAGES_TO_READ = 6;
// Before reading a page, recall matters more: the page check verifies again afterwards.
const PRECHECK_THRESHOLD = 0.3;
const MATCH_THRESHOLD = 0.5;

const SAME_PRODUCT = {
  true: "Same brand, model and variant (color, size, capacity). Regional, retailer or packaging suffixes on the same model number (for example DF, UDF, JF, EF) and different listing wording do not make it a different product.",
  false: "A different model number, variant, color, size or capacity; an accessory, part or replacement; a bundle or multi-pack; or a different product.",
};

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

// Long marketplace titles make poor searches; ask a cheap LLM for brand + model + variant.
async function buildSearchQuery(productName) {
  const fallback = productName.split(/\s+/).slice(0, 8).join(" ");
  try {
    const { text } = await generateText({
      kind: "discover_query",
      system:
        "Write the best web search query to find online shops selling this exact product. Use brand, model number and key variant (color/size/capacity) only. Max 8 words. Output only the query, no quotes.",
      prompt: productName,
      maxTokens: 30,
    });
    const query = text.replace(/["\n]/g, " ").trim();
    return query.length >= 3 ? query : fallback;
  } catch {
    return fallback;
  }
}

const normalizeUrl = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
};

// Returns every candidate with its decision trail (for the eval dataset) plus the matches.
// `localTld` (e.g. ".lk") makes pages from the user's country get read first.
export async function discoverShops({ productName, country, location, localTld, excludeUrls = [] }) {
  const query = await buildSearchQuery(productName);
  const excluded = new Set(excludeUrls.map(normalizeUrl));

  const search = await firecrawl.search(query, {
    limit: SEARCH_RESULTS,
    ...(country ? { country, location } : {}),
  });

  const results = (search.data ?? [])
    .filter((r) => r.url && !excluded.has(normalizeUrl(r.url)))
    .map((r, i) => ({
      id: `r${i}`,
      url: r.url,
      shop: new URL(r.url).hostname.replace(/^www\./, ""),
      title: r.title ?? r.metadata?.title ?? "",
      description: (r.description ?? "").slice(0, 300),
    }));

  if (results.length === 0) return { query, candidates: [], matches: [] };

  // 1. One Jev call: for every result, "is it a shop page?" and "does the title look like the same product?"
  const precheck = await decide(
    {
      tracked_product: productName,
      search_results: results.map(({ id, url, title, description }) => ({ id, url, title, description })),
    },
    Object.fromEntries(
      results.flatMap((r) => [
        [
          `${r.id}_shop`,
          {
            type: "noul",
            instructions: `Is search result ${r.id} a page where this item can be bought online (an online shop, marketplace listing, or a brand's own online store)?`,
            criteria: {
              true: "A product page with a way to buy, even if the title is generic.",
              false: "A review, blog, video, forum, comparison article, news, a search-results or category page listing many items, or a page with no way to buy.",
            },
          },
        ],
        [
          `${r.id}_same`,
          {
            type: "noul",
            instructions: `Judging only from its title, URL and description, is search result ${r.id} about the same product as the tracked product?`,
            criteria: SAME_PRODUCT,
          },
        ],
      ])
    ),
    "discover_precheck"
  );

  const candidates = results.map((r) => {
    const shopP = precheck.answers[`${r.id}_shop`].noul;
    const titleSameP = precheck.answers[`${r.id}_same`].noul;
    return { ...r, shopP, titleSameP, score: shopP * titleSameP, status: "skipped" };
  });

  const isLocalDomain = (c) => Boolean(localTld) && c.shop.endsWith(localTld);
  const toRead = candidates
    .filter((c) => c.shopP >= PRECHECK_THRESHOLD && c.titleSameP >= PRECHECK_THRESHOLD)
    .sort((a, b) => isLocalDomain(b) - isLocalDomain(a) || b.score - a.score)
    .slice(0, MAX_PAGES_TO_READ);

  // 2. Read the promising pages as one batch job (Firecrawl queues them for free slots)
  const reads = await scrapeProducts(toRead.map((c) => c.url));
  const pages = [];
  toRead.forEach((c, i) => {
    const read = reads[i];
    if (read.ok) {
      Object.assign(c, {
        name: read.data.productName,
        price: read.data.currentPrice,
        currency: read.data.currencyCode ?? null,
        condition: read.data.condition,
        image_url: read.data.productImageUrl ?? null,
      });
      pages.push(c);
    } else {
      c.status = "read_failed";
      c.readError = read.reason;
      c.error = read.error?.slice(0, 200);
    }
  });

  const failures = toRead.filter((c) => c.status === "read_failed");
  if (failures.length > 0) {
    const counts = Object.entries(
      failures.reduce((acc, c) => ({ ...acc, [c.readError]: (acc[c.readError] ?? 0) + 1 }), {})
    );
    console.warn(
      `Discovery read ${pages.length}/${toRead.length} pages; failed: ${counts.map(([r, n]) => `${r}=${n}`).join(", ")}`
    );
  }

  // 3. One Jev call: is each page's product exactly the tracked product?
  if (pages.length > 0) {
    const match = await decide(
      {
        tracked_product: productName,
        pages: pages.map((p) => ({ id: p.id, name_on_page: p.name, url: p.url })),
      },
      Object.fromEntries(
        pages.map((p) => [
          p.id,
          {
            type: "noul",
            instructions: `Is the item on page ${p.id} exactly the same product as the tracked product, sold as a single item?`,
            criteria: SAME_PRODUCT,
          },
        ])
      ),
      "discover_match"
    );

    for (const p of pages) {
      p.matchP = match.answers[p.id].noul;
      p.status =
        p.matchP < MATCH_THRESHOLD ? "not_same" : p.currency ? "match" : "no_currency";
    }
  }

  return {
    query,
    candidates,
    matches: candidates.filter((c) => c.status === "match"),
  };
}
