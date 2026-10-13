import FirecrawlApp from "@mendable/firecrawl-js";

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

const EXTRACT_OPTIONS = {
  formats: ["extract"],
  extract: {
    prompt:
      "Extract the product name as 'productName', current price as a number as 'currentPrice', the ISO 4217 currency code as 'currencyCode', the item condition as 'condition', and product image URL as 'productImageUrl' if available. For the currency code, use the page's currency symbol together with the shop's country and domain (e.g. 'Rs' on a Pakistani site is PKR, 'Rs' on a Sri Lankan site is LKR, '$' on a Canadian site is CAD). Always return a 3-letter code. For condition: 'refurbished' if the page says renewed, refurbished, reconditioned or certified pre-owned; 'used' if it says used, pre-owned, second-hand or open-box; otherwise 'new'.",
    schema: {
      type: "object",
      properties: {
        productName: { type: "string" },
        currentPrice: { type: "number" },
        currencyCode: { type: "string" },
        condition: { type: "string", enum: ["new", "refurbished", "used"] },
        productImageUrl: { type: "string" },
      },
      required: ["productName", "currentPrice"],
    },
  },
};

export const CONDITIONS = ["new", "refurbished", "used"];

// Batch reads can wait in Firecrawl's queue, so pages get more time than a lone read.
const BATCH_PAGE_TIMEOUT_MS = 45000;
const SUBMIT_ATTEMPTS = 3;

class ScrapeError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason; // "no_data" | "no_price" | "rate_limited" | "timeout" | "failed"
  }
}

// Shared validation for single and batch reads: reject nonsense prices and drop
// currency values that aren't ISO codes (e.g. "$" or "Rs") so callers fall back
// to a known currency instead.
function normalizeExtract(extractedData) {
  if (!extractedData || !extractedData.productName) {
    throw new ScrapeError("no_data", "No data extracted from URL");
  }

  const price = Number(extractedData.currentPrice);
  if (!Number.isFinite(price) || price <= 0) {
    // Usually out of stock or "contact for price", not a broken page
    throw new ScrapeError("no_price", `No usable price on page: ${extractedData.currentPrice}`);
  }

  const code = extractedData.currencyCode?.trim().toUpperCase();
  const condition = String(extractedData.condition ?? "").toLowerCase();

  return {
    ...extractedData,
    currentPrice: price,
    currencyCode: /^[A-Z]{3}$/.test(code ?? "") ? code : undefined,
    condition: CONDITIONS.includes(condition) ? condition : "new",
  };
}

function reasonFor(error) {
  if (error.reason) return error.reason;
  const status = error.statusCode;
  if (status === 429 || /concurrency slot/i.test(error.message)) return "rate_limited";
  if (status === 408 || /timed out/i.test(error.message)) return "timeout";
  if (status === 403 || /do not support this site/i.test(error.message)) return "unsupported";
  return "failed";
}

// Reads pages one by one, two at a time. Used when a whole batch is rejected
// (e.g. one URL is a site Firecrawl refuses), so one bad URL can't sink the rest.
async function scrapeIndividually(urls) {
  const results = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      try {
        const page = await firecrawl.scrapeUrl(urls[i], {
          ...EXTRACT_OPTIONS,
          timeout: BATCH_PAGE_TIMEOUT_MS,
        });
        results[i] = { url: urls[i], ok: true, data: normalizeExtract(page.extract) };
      } catch (error) {
        results[i] = { url: urls[i], ok: false, reason: reasonFor(error), error: error.message };
      }
    }
  };
  await Promise.all([worker(), worker()]);
  return results;
}

// `options` are extra Firecrawl scrape options (e.g. { timeout } in ms).
export async function scrapeProduct(url, options = {}) {
  try {
    const result = await firecrawl.scrapeUrl(url, { ...options, ...EXTRACT_OPTIONS });
    // Firecrawl returns data in result.extract
    return normalizeExtract(result.extract);
  } catch (error) {
    console.error("Firecrawl scrape error:", error.message);
    throw new Error(`Failed to scrape product: ${error.message}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads many pages as one Firecrawl batch job. The account has a small limit on
// pages read at the same time, shared by every user and the daily cron; a batch
// waits for free slots on Firecrawl's side instead of failing with 429/408, so
// concurrency is controlled where the limit actually lives.
//
// Returns one entry per input URL: { url, ok: true, data } or { url, ok: false, reason, error }.
export async function scrapeProducts(urls) {
  if (urls.length === 0) return [];

  let job;
  for (let attempt = 1; attempt <= SUBMIT_ATTEMPTS; attempt++) {
    try {
      job = await firecrawl.batchScrapeUrls(urls, {
        ...EXTRACT_OPTIONS,
        timeout: BATCH_PAGE_TIMEOUT_MS,
      });
      if (job.success === false) throw new Error(job.error ?? "Batch scrape failed");
      break;
    } catch (error) {
      const retryable = error.statusCode === 429 || error.statusCode >= 500;
      if (!retryable) {
        // The whole batch was rejected (e.g. one unsupported site): isolate it
        console.warn("Firecrawl batch rejected, reading pages individually:", error.message);
        return scrapeIndividually(urls);
      }
      if (attempt === SUBMIT_ATTEMPTS) {
        console.error("Firecrawl batch scrape error:", error.message);
        return urls.map((url) => ({ url, ok: false, reason: reasonFor(error), error: error.message }));
      }
      // Exponential backoff with jitter: ~1s, ~2s
      await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 500);
    }
  }

  const byUrl = new Map();
  for (const doc of job.data ?? []) {
    const source = doc.metadata?.sourceURL ?? doc.metadata?.url ?? doc.url;
    if (source) byUrl.set(source, doc);
  }

  return urls.map((url) => {
    const doc = byUrl.get(url);
    if (!doc) {
      return { url, ok: false, reason: "failed", error: "No result returned for this page" };
    }
    if (doc.metadata?.error) {
      const error = Object.assign(new Error(doc.metadata.error), { statusCode: doc.metadata.statusCode });
      return { url, ok: false, reason: reasonFor(error), error: doc.metadata.error };
    }
    try {
      return { url, ok: true, data: normalizeExtract(doc.extract ?? doc.json) };
    } catch (error) {
      return { url, ok: false, reason: reasonFor(error), error: error.message };
    }
  });
}
