import { decide } from "./jev.js";

// Small moves are almost always real, so only big ones are worth a Jev call.
const SUSPICIOUS_CHANGE = 0.25;
// Below this probability of being genuine, the new price is not saved or alerted.
const MIN_GENUINE_PROBABILITY = 0.5;

// Decides whether a newly scraped price is a real change or a scraping error
// (wrong product/variant, accessory, bundle, missing digit, currency mix-up).
export async function checkPriceChange({
  trackedName,
  scrapedName,
  oldPrice,
  oldCurrency,
  newPrice,
  newCurrency,
}) {
  const change = (newPrice - oldPrice) / oldPrice;
  const currencyChanged = oldCurrency !== newCurrency;

  if (Math.abs(change) < SUSPICIOUS_CHANGE && !currencyChanged) {
    return { genuine: true, checked: false };
  }

  try {
    const { answers, usage, latencyMs } = await decide(
      {
        tracked_product_name: trackedName,
        product_name_on_page_now: scrapedName,
        previous_price: `${oldCurrency} ${oldPrice.toFixed(2)}`,
        newly_scraped_price: `${newCurrency} ${newPrice.toFixed(2)}`,
        change_percent: `${(change * 100).toFixed(1)}%`,
      },
      {
        genuine_change: {
          type: "noul",
          instructions:
            "A price tracker re-scraped a product page. Is the newly scraped price a real current price for the same product that is being tracked?",
          criteria: {
            true: "Same product and variant; the price genuinely changed (sale, discount, clearance, or price increase).",
            false:
              "Likely a scraping error: a different product, variant, accessory or bundle, a per-unit or partial price, a missing or extra digit, or a currency mix-up.",
          },
        },
      }
    );

    const probability = answers.genuine_change.noul;

    return {
      genuine: probability >= MIN_GENUINE_PROBABILITY,
      checked: true,
      probability,
      cost: usage.cost,
      latencyMs,
    };
  } catch (error) {
    // Fail open: if Jev is unavailable, behave as before the guard existed
    console.error("Price guard unavailable:", error.message);
    return { genuine: true, checked: false, error: error.message };
  }
}
