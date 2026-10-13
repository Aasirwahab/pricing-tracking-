import { sql } from "@/lib/db";

// Free, no key, 166 currencies, updated daily. Attribution is shown in the page footer.
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

// USD-based rates, cached in Neon so the API is called at most once a day.
// If the API is down, the most recent cached day is used instead.
export async function getRates() {
  const [latest] = await sql`
    select rate_date::text as date, rates, rate_date = current_date as is_today
    from exchange_rates
    order by rate_date desc
    limit 1
  `;

  if (latest?.is_today) {
    return { date: latest.date, rates: latest.rates };
  }

  try {
    const res = await fetch(RATES_URL, { cache: "no-store" });
    const data = await res.json();

    if (data.result !== "success") {
      throw new Error(`Exchange rate API returned "${data.result}"`);
    }

    const [saved] = await sql`
      insert into exchange_rates (rate_date, rates)
      values (current_date, ${JSON.stringify(data.rates)})
      on conflict (rate_date) do update set rates = excluded.rates, fetched_at = now()
      returning rate_date::text as date
    `;

    return { date: saved.date, rates: data.rates };
  } catch (error) {
    console.error("Exchange rates fetch failed:", error.message);
    return latest ? { date: latest.date, rates: latest.rates } : null;
  }
}

export function convert(amount, from, to, rates) {
  if (from === to) return amount;
  if (!rates?.[from] || !rates?.[to]) return null;
  return (amount / rates[from]) * rates[to];
}

// Adds each listing's price in the user's currency and sorts listings cheapest first.
// Listings in a currency we have no rate for go last.
export function withConvertedPrices(product, toCurrency, rates) {
  const listings = product.listings
    .map((listing) => ({
      ...listing,
      converted_price: convert(
        listing.current_price,
        listing.currency,
        toCurrency,
        rates
      ),
    }))
    .sort(
      (a, b) =>
        (a.converted_price ?? Infinity) - (b.converted_price ?? Infinity)
    );

  return { ...product, listings };
}
