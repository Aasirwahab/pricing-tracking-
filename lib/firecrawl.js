import FirecrawlApp from "@mendable/firecrawl-js";

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

// `options` are extra Firecrawl scrape options (e.g. { timeout } in ms).
export async function scrapeProduct(url, options = {}) {
  try {
    const result = await firecrawl.scrapeUrl(url, {
      ...options,
      formats: ["extract"],
      extract: {
        prompt:
          "Extract the product name as 'productName', current price as a number as 'currentPrice', the ISO 4217 currency code as 'currencyCode', and product image URL as 'productImageUrl' if available. For the currency code, use the page's currency symbol together with the shop's country and domain (e.g. 'Rs' on a Pakistani site is PKR, 'Rs' on a Sri Lankan site is LKR, '$' on a Canadian site is CAD). Always return a 3-letter code.",
        schema: {
          type: "object",
          properties: {
            productName: { type: "string" },
            currentPrice: { type: "number" },
            currencyCode: { type: "string" },
            productImageUrl: { type: "string" },
          },
          required: ["productName", "currentPrice"],
        },
      },
    });

    // Firecrawl returns data in result.extract
    const extractedData = result.extract;

    if (!extractedData || !extractedData.productName) {
      throw new Error("No data extracted from URL");
    }

    // Reject nonsense prices; drop currency values that aren't ISO codes
    // (e.g. "$" or "Rs") so callers fall back to a known currency instead.
    const price = Number(extractedData.currentPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Scraped price is not a positive number: ${extractedData.currentPrice}`);
    }

    const code = extractedData.currencyCode?.trim().toUpperCase();

    return {
      ...extractedData,
      currentPrice: price,
      currencyCode: /^[A-Z]{3}$/.test(code ?? "") ? code : undefined,
    };
  } catch (error) {
    console.error("Firecrawl scrape error:", error);
    throw new Error(`Failed to scrape product: ${error.message}`);
  }
}
