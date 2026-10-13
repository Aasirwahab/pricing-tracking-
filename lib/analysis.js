import { convert } from "./currency.js";
import { formatPrice } from "./format.js";

const DAY = 24 * 60 * 60 * 1000;
// Less history than this and "is it a good price?" would be a guess.
const MIN_DAYS_FOR_VERDICT = 7;
// Within this of the lowest price ever seen counts as "at the lowest".
const NEAR_LOWEST = 0.01;
// This far below/above the 30-day average counts as good/high.
const NOTABLE_DIFF = 0.05;

export const VERDICT_LABELS = {
  great: "Great price",
  good: "Good price",
  typical: "Typical price",
  high: "Higher than usual",
  new: "Not enough history yet",
};

const dayStart = (time) => Math.floor(time / DAY) * DAY;
const isoDay = (time) => new Date(time).toISOString().slice(0, 10);

// Pricing analysis for one product across all its shops, in the user's currency.
// History is converted at today's rates so exchange-rate moves don't look like price moves.
//
// price_history only stores a row when a price changes, so averaging those rows would
// over-weight frequently changing shops. Instead this rebuilds a daily series of the
// best (lowest) price available across shops, carrying each shop's last price forward.
export function analyzePrices({ listings, history, currency, rates, now = Date.now() }) {
  const toUser = (amount, from) => convert(amount, from, currency, rates);

  const current = listings
    .map((l) => ({ shop: l.shop, price: toUser(l.current_price, l.currency) }))
    .filter((l) => l.price != null)
    .sort((a, b) => a.price - b.price);

  if (current.length === 0) return null;

  const points = history
    .map((h) => ({
      listingId: h.listing_id,
      price: toUser(h.price, h.currency),
      at: new Date(h.checked_at).getTime(),
    }))
    .filter((p) => p.price != null)
    .sort((a, b) => a.at - b.at);

  const today = dayStart(now);
  const series = [];
  const lastPrice = new Map();
  let i = 0;

  for (let day = points.length ? dayStart(points[0].at) : today; day <= today; day += DAY) {
    while (i < points.length && points[i].at < day + DAY) {
      lastPrice.set(points[i].listingId, points[i].price);
      i++;
    }
    if (lastPrice.size > 0) {
      series.push({ day, best: Math.min(...lastPrice.values()) });
    }
  }

  const cheapest = current[0];
  const priciest = current[current.length - 1];

  // Today's best price comes from the live listings
  if (series.length === 0 || series[series.length - 1].day !== today) {
    series.push({ day: today, best: cheapest.price });
  } else {
    series[series.length - 1].best = cheapest.price;
  }

  const lowest = series.reduce((min, s) => (s.best < min.best ? s : min));
  const highest = series.reduce((max, s) => (s.best > max.best ? s : max));
  const recent = series.slice(-30);
  const average30 = recent.reduce((sum, s) => sum + s.best, 0) / recent.length;
  const vsAverage = (cheapest.price - average30) / average30;
  const weekAgo = series.length > 7 ? series[series.length - 8].best : null;
  const change7d = weekAgo ? (cheapest.price - weekAgo) / weekAgo : null;
  const daysTracked = series.length;

  let verdict;
  if (daysTracked < MIN_DAYS_FOR_VERDICT) verdict = "new";
  else if (cheapest.price <= lowest.best * (1 + NEAR_LOWEST)) verdict = "great";
  else if (vsAverage <= -NOTABLE_DIFF) verdict = "good";
  else if (vsAverage >= NOTABLE_DIFF) verdict = "high";
  else verdict = "typical";

  return {
    currency,
    verdict,
    cheapest,
    priciest,
    shopCount: current.length,
    savings: priciest.price - cheapest.price,
    lowest: { price: lowest.best, date: isoDay(lowest.day) },
    highest: { price: highest.best, date: isoDay(highest.day) },
    average30,
    vsAverage,
    change7d,
    daysTracked,
  };
}

const pct = (x) => `${Math.round(Math.abs(x) * 100)}%`;

// The only facts the LLM may use, already formatted so it never does maths or formatting.
export function insightFacts(a) {
  const f = (n) => formatPrice(n, a.currency);

  const facts = {
    verdict: VERDICT_LABELS[a.verdict],
    cheapest_now: `${f(a.cheapest.price)} at ${a.cheapest.shop}`,
    shops_compared: a.shopCount,
    days_of_price_history: a.daysTracked,
  };

  if (a.shopCount > 1) {
    facts.most_expensive_now = `${f(a.priciest.price)} at ${a.priciest.shop}`;
    facts.saving_vs_most_expensive = f(a.savings);
  }

  if (a.verdict !== "new") {
    facts.lowest_price_seen = `${f(a.lowest.price)} on ${a.lowest.date}`;
    facts.average_last_30_days = f(a.average30);
    facts.current_vs_average =
      Math.abs(a.vsAverage) < 0.005
        ? "same as average"
        : `${pct(a.vsAverage)} ${a.vsAverage < 0 ? "below" : "above"} average`;
    if (a.change7d != null) {
      facts.change_last_7_days =
        Math.abs(a.change7d) < 0.005
          ? "no change"
          : `${a.change7d < 0 ? "down" : "up"} ${pct(a.change7d)}`;
    }
  }

  return facts;
}

// Deterministic summary used when the LLM is unavailable or fails the number check.
export function templateSummary(a, facts) {
  const savings =
    a.shopCount > 1
      ? ` Buying there saves ${facts.saving_vs_most_expensive} compared with ${a.priciest.shop}.`
      : "";

  if (a.verdict === "new") {
    return `Cheapest right now: ${facts.cheapest_now}.${savings} About a week of price history is needed before judging whether this is a good price.`;
  }

  return `${facts.verdict}: ${facts.cheapest_now}, ${facts.current_vs_average} for the last 30 days.${savings}`;
}

// Hallucination check: every number in the generated text must appear in the facts.
const numbersIn = (text) =>
  (String(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

export function usesOnlyKnownNumbers(text, facts) {
  const allowed = new Set(numbersIn(JSON.stringify(facts)));
  return numbersIn(text).every((n) => allowed.has(n));
}
