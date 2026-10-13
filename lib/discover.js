// Finds other shops selling the same product:
//   search -> Jev pre-check on titles -> read the most promising pages -> Jev same-product check.
// Page reads cost ~5 Firecrawl credits each (search ~2), so the title pre-check exists
// to avoid reading pages that are obviously not shops or not the same product.
import FirecrawlApp from "@mendable/firecrawl-js";
import { scrapeProducts } from "./firecrawl.js";
import { decide } from "./jev.js";
import { generateText } from "./llm.js";

// Bump whenever discovery logic changes: cached searches from an older version are
// ignored, so users never keep seeing results produced by code that has been fixed.
// 1: single search; 2: site/alias searches, near codes, similar models, robust reads.
export const DISCOVERY_VERSION = 2;

const SEARCH_RESULTS = 10;
const MAX_PAGES_TO_READ = 6;
// Before reading a page, recall matters more: the page check verifies again afterwards.
const PRECHECK_THRESHOLD = 0.3;
const MATCH_THRESHOLD = 0.5;
// A near-code title is only read if it clearly looks like a shop page.
const NEAR_SHOP_THRESHOLD = 0.6;

// Single definition of "same product", shared by discovery and the eval (eval/run.mjs),
// so the eval measures exactly what users get. Condition is not identity: it is a
// separate field extracted from the page.
export const SAME_PRODUCT = {
  true: "Same brand, model and variant (color, size, storage, capacity). Regional, retailer or packaging suffixes on the same model number (for example DF, UDF, JF, EF) and different listing wording do not make it a different product. Condition (new, renewed, refurbished, used) is not part of product identity.",
  false: "A different model number, variant, color, size, storage or capacity; an accessory, part, case or replacement; a bundle or multi-pack; a comparison of several products; or a category, search-results or 'items for sale' page instead of one product.",
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

// Social and video platforms are never shop pages, and Firecrawl refuses to read
// them (one such URL used to fail a whole batch of page reads).
const PLATFORMS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "pinterest.com",
  "linkedin.com",
];
const isPlatform = (shop) => PLATFORMS.some((p) => shop === p || shop.endsWith(`.${p}`));

const normalizeUrl = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
};

const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Model-like codes in a product name: tokens with both letters and digits
// (A500WA-7, SRPD55, WH-1000XM5, 128GB).
export function modelCodes(name) {
  return String(name)
    .split(/\s+/)
    .map(squash)
    .filter((t) => /[a-z]/.test(t) && /\d/.test(t) && t.length >= 3);
}

// Capacity/size tokens (128GB, 42mm) aren't model identity: "iPhone 14 128GB" must
// not look like "iPhone 15 128GB" just because the storage matches.
const isMeasure = (t) => /^\d+(gb|tb|mb|mm|cm|ml|mah|hz|w|in|inch)$/.test(t);
const identityCodes = (name) => modelCodes(name).filter((c) => !isMeasure(c));

// Exact text check, given to Jev as a fact: do all of the tracked product's model
// codes appear in the candidate text, ignoring punctuation? Suffixes still match
// ("A500WA-7" is found in "A500WA-7DF"); other variants don't ("A500WA-1").
// null when the tracked name has no model code (e.g. many shoes, "iPhone 15").
export function containsModelCodes(trackedName, text) {
  const codes = identityCodes(trackedName);
  if (codes.length === 0) return null;
  const haystack = squash(text);
  return codes.every((code) => haystack.includes(code));
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// "Near" model code: same leading letters (series, e.g. LTP vs MTP), exactly the same
// digits (so color/variant numbers like -5A vs -1A still differ), at most two letter
// changes in the core, and any extra letters at the very end (regional/packaging
// suffixes such as V, DF, VDF). LTP-1302D-5A ~ LTP-1302DD-5AVDF. Used to surface
// likely aliases as "similar", never as an exact match.
export function nearModelCode(trackedName, text) {
  const codes = identityCodes(trackedName);
  if (codes.length === 0) return false;
  const prefix = (s) => s.match(/^[a-z]*/)[0];
  const digits = (s) => s.replace(/[^0-9]/g, "");
  // Split "ltp1302dd5avdf" into core "ltp1302dd5" and trailing letters "avdf"
  const split = (s) => {
    const m = s.match(/^(.*\d)([a-z]*)$/);
    return m ? { core: m[1], tail: m[2] } : { core: s, tail: "" };
  };
  const candidates = modelCodes(text);
  return codes.every((code) => {
    const t = split(code);
    return candidates.some((c) => {
      const k = split(c);
      return (
        prefix(c) === prefix(code) &&
        digits(c) === digits(code) &&
        k.tail.startsWith(t.tail) &&
        editDistance(k.core, t.core) <= 2
      );
    });
  });
}

// "Casio A500WA-7 World Time Digital Watch" -> "Casio A500WA-7". Short code queries
// work much better for site-restricted searches than full product names.
function codeQuery(productName) {
  const words = String(productName).trim().split(/\s+/);
  const codes = words.filter((w) => /[a-z]/i.test(w) && /\d/.test(w) && squash(w).length >= 3);
  return codes.length ? [words[0], ...codes].join(" ") : null;
}

export const CODE_FACT_NOTE =
  "contains_tracked_model_codes is computed by exact text matching: true means every model code of the tracked product (e.g. A500WA-7) appears in that text, ignoring punctuation; extra regional/packaging suffixes still count as present. null means the tracked product has no model code.";

// One Jev call for a list of search results: "is it a shop page?" and "does the
// title look like the same product?" for each. Returns the results with scores.
async function precheckResults(productName, results) {
  const precheck = await decide(
    {
      tracked_product: productName,
      note: CODE_FACT_NOTE,
      search_results: results.map(({ id, url, title, description, titleCodeMatch }) => ({
        id,
        url,
        title,
        description,
        contains_tracked_model_codes: titleCodeMatch,
      })),
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

  return results.map((r) => {
    const shopP = precheck.answers[`${r.id}_shop`].noul;
    const titleSameP = precheck.answers[`${r.id}_same`].noul;
    return { ...r, shopP, titleSameP, score: shopP * titleSameP, status: "skipped" };
  });
}

// The near model code that shop-like results use most often (e.g. "LTP1302DD-5AV"),
// or null. Only codes from likely shop pages count.
function mostCommonAlias(productName, candidates) {
  const counts = new Map();
  for (const c of candidates) {
    if (!c.titleNearCode || isPlatform(c.shop) || c.shopP < NEAR_SHOP_THRESHOLD) continue;
    for (const word of c.title.split(/\s+/)) {
      const code = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
      if (!nearModelCode(productName, code) || containsModelCodes(productName, code)) continue;
      const key = squash(code);
      const entry = counts.get(key) ?? { code, n: 0 };
      entry.n++;
      counts.set(key, entry);
    }
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return best?.code ?? null;
}

// Returns every candidate with its decision trail (for the eval dataset) plus the matches.
// `localTld` (e.g. ".lk") makes pages from the user's country get read first and,
// with `siteSearch`, adds a search restricted to that country's domains.
export async function discoverShops({
  productName,
  country,
  location,
  localTld,
  siteSearch = true,
  excludeUrls = [],
}) {
  const query = await buildSearchQuery(productName);
  const excluded = new Set(excludeUrls.map(normalizeUrl));

  // "Shops in" only biases search results toward a country, so local shops can be
  // missing from the top 10 (measured: the A500WA-7 at ubuy.com.lk was absent from
  // a plain and a "... Sri Lanka" search, but first in a "site:lk" search). Each
  // search costs ~2 credits vs ~5 per page read, so extra searches are cheap.
  // Order matters: local results come first when merging.
  const queries = country
    ? [
        ...(siteSearch && localTld
          ? [`${codeQuery(productName) ?? query} site:${localTld.slice(1)}`]
          : []),
        `${query} ${location}`,
        query,
      ]
    : [query];
  const searches = await Promise.all(
    queries.map((q) =>
      firecrawl.search(q, {
        limit: SEARCH_RESULTS,
        ...(country ? { country, location } : {}),
      })
    )
  );

  const seen = new Set();
  // Search hits -> candidates, skipping excluded and already-seen URLs
  const toResults = (hits, startIndex) =>
    hits
      .filter((r) => {
        const key = r.url && normalizeUrl(r.url);
        if (!key || excluded.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r, i) => {
        const title = r.title ?? r.metadata?.title ?? "";
        const description = (r.description ?? "").slice(0, 300);
        return {
          id: `r${startIndex + i}`,
          url: r.url,
          shop: new URL(r.url).hostname.replace(/^www\./, ""),
          title,
          description,
          titleCodeMatch: containsModelCodes(productName, `${title} ${r.url}`),
          titleNearCode: nearModelCode(productName, title),
        };
      });

  const results = toResults(searches.flatMap((s) => s.data ?? []), 0);
  if (results.length === 0) return { query, candidates: [], matches: [] };

  // 1. One Jev call: for every result, "is it a shop page?" and "does the title look like the same product?"
  const candidates = await precheckResults(productName, results);

  const isLocalDomain = (c) => Boolean(localTld) && c.shop.endsWith(localTld);
  const likelySame = (c) =>
    !isPlatform(c.shop) &&
    c.shopP >= PRECHECK_THRESHOLD &&
    c.titleSameP >= PRECHECK_THRESHOLD;

  // 1b. Alias search. Shops sometimes sell the product under a slightly different
  // model code (LTP-1302DD-5AV for LTP-1302D-5A). If no local result looks like a
  // match but results reveal such an alias, search the country's sites for the
  // alias too (~2 credits), as a person would after spotting the other code.
  if (country && siteSearch && localTld && !candidates.some((c) => isLocalDomain(c) && likelySame(c))) {
    const alias = mostCommonAlias(productName, candidates);
    if (alias) {
      const brand = productName.trim().split(/\s+/)[0];
      const more = await firecrawl.search(`${brand} ${alias} site:${localTld.slice(1)}`, {
        limit: SEARCH_RESULTS,
        country,
        location,
      });
      const extra = toResults(more.data ?? [], candidates.length);
      if (extra.length > 0) {
        const checked = await precheckResults(productName, extra);
        candidates.push(...checked.map((c) => ({ ...c, foundByAlias: alias })));
      }
    }
  }

  // Pages worth reading: likely the same product, or a shop selling a near model
  // code (a probable alias such as LTP-1302DD-5AV for LTP-1302D-5A), so the user
  // can see its price under "similar". Local pages are read first.
  const nearShop = (c) =>
    !isPlatform(c.shop) && c.titleNearCode && c.shopP >= NEAR_SHOP_THRESHOLD;
  const tier = (c) => (isLocalDomain(c) ? 0 : 2) + (likelySame(c) ? 0 : 1);
  const toRead = candidates
    .filter((c) => likelySame(c) || nearShop(c))
    .sort((a, b) => tier(a) - tier(b) || b.score - a.score)
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
    for (const p of pages) p.pageCodeMatch = containsModelCodes(productName, p.name);

    const match = await decide(
      {
        tracked_product: productName,
        note: CODE_FACT_NOTE,
        pages: pages.map((p) => ({
          id: p.id,
          name_on_page: p.name,
          url: p.url,
          contains_tracked_model_codes: p.pageCodeMatch,
        })),
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
      p.pageNearCode = nearModelCode(productName, p.name);
      if (p.matchP >= MATCH_THRESHOLD) {
        p.status = p.currency ? "match" : "no_currency";
      } else {
        // Not confirmed as the same product, but the model code is a near alias:
        // shown to the user as "similar" so they can decide, never ranked as a match.
        p.status = p.currency && (p.pageNearCode || p.titleNearCode) ? "similar" : "not_same";
      }
    }
  }

  return {
    query,
    candidates,
    matches: candidates.filter((c) => c.status === "match"),
  };
}
