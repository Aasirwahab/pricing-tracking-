"use server";

import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { scrapeProduct } from "@/lib/firecrawl";
import { convert, getRates } from "@/lib/currency";
import { analyzePrices } from "@/lib/analysis";
import { getInsight } from "@/lib/insights";
import { discoverShops } from "@/lib/discover";
import { identifyProduct } from "@/lib/identify";
import { findCountry, isLocalShop } from "@/lib/countries";

// Shop discovery reads several pages (~30 Firecrawl credits), so results are reused for a day.
const DISCOVERY_CACHE_HOURS = 24;
const TOP_SHOPS = 5;
const TOP_INTERNATIONAL_SHOPS = 3;
// Title-only evidence, so the bar is higher than for shops whose page was read.
const UNPRICED_TITLE_MATCH = 0.8;
import { revalidatePath } from "next/cache";

function shopFromUrl(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

// Adds a product by URL. With `productId`, the URL is added as another shop
// for that existing product instead of creating a new product.
export async function addProduct(formData) {
  const url = formData.get("url");
  const productId = formData.get("productId");

  if (!url) {
    return { error: "URL is required" };
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    if (productId) {
      const [owned] = await sql`
        select id from products where id = ${productId} and user_id = ${userId}
      `;
      if (!owned) {
        return { error: "Product not found" };
      }
    }

    // Scrape product data with Firecrawl
    const productData = await scrapeProduct(url);

    if (!productData.productName || !productData.currentPrice) {
      console.log(productData, "productData");
      return { error: "Could not extract product information from this URL" };
    }

    const newPrice = parseFloat(productData.currentPrice);
    const currency = productData.currencyCode || "USD";

    // Same URL already tracked by this user? Refresh that listing instead of duplicating it.
    const [existing] = await sql`
      select l.id, l.current_price::float8 as current_price
      from listings l
      join products p on p.id = l.product_id
      where p.user_id = ${userId} and l.url = ${url}
    `;

    let listingId;

    if (existing) {
      await sql`
        update listings set
          name = ${productData.productName},
          current_price = ${newPrice},
          currency = ${currency},
          condition = ${productData.condition},
          image_url = ${productData.productImageUrl},
          updated_at = now()
        where id = ${existing.id}
      `;
      listingId = existing.id;
    } else if (productId) {
      const [listing] = await sql`
        insert into listings (product_id, url, shop, name, current_price, currency, condition, image_url)
        values (${productId}, ${url}, ${shopFromUrl(url)}, ${productData.productName},
          ${newPrice}, ${currency}, ${productData.condition}, ${productData.productImageUrl})
        returning id
      `;
      listingId = listing.id;
    } else {
      // New product and its first listing in one statement
      const [listing] = await sql`
        with new_product as (
          insert into products (user_id, name, image_url)
          values (${userId}, ${productData.productName}, ${productData.productImageUrl})
          returning id
        )
        insert into listings (product_id, url, shop, name, current_price, currency, condition, image_url)
        select id, ${url}, ${shopFromUrl(url)}, ${productData.productName},
          ${newPrice}, ${currency}, ${productData.condition}, ${productData.productImageUrl}
        from new_product
        returning id
      `;
      listingId = listing.id;
    }

    // Add to price history if it's a new listing OR price changed
    if (!existing || existing.current_price !== newPrice) {
      await sql`
        insert into price_history (listing_id, price, currency)
        values (${listingId}, ${newPrice}, ${currency})
      `;
    }

    revalidatePath("/");
    return {
      success: true,
      message: existing
        ? "Price refreshed for this shop!"
        : productId
          ? "Shop added to product!"
          : "Product added successfully!",
    };
  } catch (error) {
    console.error("Add product error:", error);
    return { error: error.message || "Failed to add product" };
  }
}

export async function deleteProduct(productId) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    await sql`
      delete from products where id = ${productId} and user_id = ${userId}
    `;

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

// Removes one shop from a product; the product goes too if it was its last shop.
export async function deleteListing(listingId) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    const [deleted] = await sql`
      delete from listings l
      using products p
      where l.id = ${listingId} and p.id = l.product_id and p.user_id = ${userId}
      returning l.product_id
    `;

    if (deleted) {
      await sql`
        delete from products p
        where p.id = ${deleted.product_id}
          and not exists (select 1 from listings l where l.product_id = p.id)
      `;
    }

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

export async function getProducts() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return [];
    }

    return await sql`
      select p.id, p.name, p.image_url, p.created_at,
        coalesce(
          json_agg(
            json_build_object(
              'id', l.id,
              'url', l.url,
              'shop', l.shop,
              'name', l.name,
              'current_price', l.current_price::float8,
              'currency', l.currency,
              'condition', l.condition,
              'updated_at', l.updated_at
            ) order by l.created_at
          ) filter (where l.id is not null),
          '[]'
        ) as listings
      from products p
      left join listings l on l.product_id = p.id
      where p.user_id = ${userId}
      group by p.id
      order by p.created_at desc
    `;
  } catch (error) {
    console.error("Get products error:", error);
    return [];
  }
}

export async function getPriceHistory(listingId) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return [];
    }

    return await sql`
      select ph.id, ph.listing_id, ph.price::float8 as price, ph.currency, ph.checked_at
      from price_history ph
      join listings l on l.id = ph.listing_id
      join products p on p.id = l.product_id
      where ph.listing_id = ${listingId} and p.user_id = ${userId}
      order by ph.checked_at asc
    `;
  } catch (error) {
    console.error("Get price history error:", error);
    return [];
  }
}

// Pricing analysis for one product: stats computed in code, then a short
// LLM-written summary of those stats (or a template if the LLM is unavailable).
export async function getPriceAnalysis(productId) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    const [listings, history, currency, fx] = await Promise.all([
      sql`
        select l.id, l.shop, l.current_price::float8 as current_price, l.currency
        from listings l
        join products p on p.id = l.product_id
        where l.product_id = ${productId} and p.user_id = ${userId}
      `,
      sql`
        select ph.listing_id, ph.price::float8 as price, ph.currency, ph.checked_at
        from price_history ph
        join listings l on l.id = ph.listing_id
        join products p on p.id = l.product_id
        where l.product_id = ${productId} and p.user_id = ${userId}
      `,
      getPreferredCurrency(),
      getRates(),
    ]);

    const analysis = analyzePrices({
      listings,
      history,
      currency,
      rates: fx?.rates,
    });

    if (!analysis) {
      return { error: "No prices with a known exchange rate to analyze" };
    }

    const insight = await getInsight(analysis);
    return { analysis, ...insight };
  } catch (error) {
    console.error("Price analysis error:", error);
    return { error: "Could not analyze prices right now" };
  }
}

// Shapes a stored discovery for the browser: matches only, priced in the user's
// currency, cheapest first, with local and international shops separated.
function shopsFromDiscovery(discovery, { country, currency, fx, trackedUrls }) {
  const tracked = new Set(trackedUrls);
  const matches = discovery.results
    .filter((c) => c.status === "match")
    .map((c) => ({
      url: c.url,
      shop: c.shop,
      name: c.name,
      price: c.price,
      currency: c.currency,
      // Searches saved before condition existed count as new
      condition: c.condition ?? "new",
      matchP: c.matchP,
      converted_price: convert(c.price, c.currency, currency, fx?.rates),
      tracked: tracked.has(c.url),
      local: isLocalShop(country, c),
    }))
    .sort(
      (a, b) =>
        (a.converted_price ?? Infinity) - (b.converted_price ?? Infinity)
    );

  // Shops abroad may not deliver, and their price excludes shipping and import
  // duty, so they are listed separately instead of competing with local shops.
  // The browser filters by condition (new only, or including refurbished/used)
  // and then shows the first TOP_SHOPS / TOP_INTERNATIONAL_SHOPS.
  return {
    discoveryId: discovery.id,
    productId: discovery.product_id ?? null,
    shops: matches.filter((s) => s.local),
    internationalShops: matches.filter((s) => !s.local),
    // Local shops whose title clearly names this product but whose price can't be
    // read (loaded by JavaScript, geo-priced, or blocked). Shown, not ranked.
    unpricedShops: discovery.results
      .filter(
        (c) =>
          c.status === "read_failed" &&
          // Exact model code in the title is hard evidence, so Jev only needs to
          // lean "same"; without a code, require strong agreement.
          (c.titleCodeMatch === true
            ? c.titleSameP >= 0.5
            : c.titleSameP >= UNPRICED_TITLE_MATCH) &&
          c.shopP >= UNPRICED_TITLE_MATCH &&
          isLocalShop(country, { shop: c.shop })
      )
      .slice(0, TOP_INTERNATIONAL_SHOPS)
      .map((c) => ({ url: c.url, shop: c.shop, title: c.title })),
    limits: { local: TOP_SHOPS, international: TOP_INTERNATIONAL_SHOPS },
    currency,
    country: country.name,
    searchedAt: discovery.created_at,
  };
}

async function searchContext() {
  const [countryCode, currency, fx] = await Promise.all([
    getShopCountry(),
    getPreferredCurrency(),
    getRates(),
  ]);
  return { country: findCountry(countryCode) ?? findCountry(""), currency, fx };
}

// Finds the same product at other shops in the user's "Shops in" country and
// returns the cheapest few in the user's currency. Every candidate (including
// rejected ones and Jev's probabilities) is stored for the matching eval.
export async function findShops(productId) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    const [product] = await sql`
      select id, name from products where id = ${productId} and user_id = ${userId}
    `;
    if (!product) {
      return { error: "Product not found" };
    }

    const [{ country, currency, fx }, listings] = await Promise.all([
      searchContext(),
      sql`select url from listings where product_id = ${productId}`,
    ]);

    let [discovery] = await sql`
      select id, product_id, results, created_at from discoveries
      where product_id = ${productId}
        and country is not distinct from ${country.code || null}
        and created_at > now() - make_interval(hours => ${DISCOVERY_CACHE_HOURS})
      order by created_at desc
      limit 1
    `;
    const cached = Boolean(discovery);

    if (!discovery) {
      const { query, candidates } = await discoverShops({
        productName: product.name,
        country: country.code || undefined,
        location: country.code ? country.name : undefined,
        localTld: country.tld,
        siteSearch: country.siteSearch !== false,
        excludeUrls: listings.map((l) => l.url),
      });

      [discovery] = await sql`
        insert into discoveries (product_id, user_id, country, query, results)
        values (${productId}, ${userId}, ${country.code || null}, ${query}, ${JSON.stringify(candidates)})
        returning id, product_id, results, created_at
      `;
    }

    return {
      ...shopsFromDiscovery(discovery, {
        country,
        currency,
        fx,
        trackedUrls: listings.map((l) => l.url),
      }),
      cached,
    };
  } catch (error) {
    console.error("Find shops error:", error);
    return { error: "Could not search for shops right now" };
  }
}

// Same search as findShops, but starting from a product name (typed, or confirmed
// after a screenshot). No product exists yet: it is created when the user tracks
// the first shop.
export async function searchByName(name) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    const searchName = String(name ?? "").trim().replace(/\s+/g, " ");
    if (searchName.length < 3 || searchName.length > 150) {
      return { error: "Enter a product name (3 to 150 characters)" };
    }

    const { country, currency, fx } = await searchContext();

    let [discovery] = await sql`
      select id, product_id, results, created_at from discoveries
      where user_id = ${userId}
        and lower(search_name) = lower(${searchName})
        and country is not distinct from ${country.code || null}
        and created_at > now() - make_interval(hours => ${DISCOVERY_CACHE_HOURS})
      order by created_at desc
      limit 1
    `;
    const cached = Boolean(discovery);

    if (!discovery) {
      const { query, candidates } = await discoverShops({
        productName: searchName,
        country: country.code || undefined,
        location: country.code ? country.name : undefined,
        localTld: country.tld,
        siteSearch: country.siteSearch !== false,
      });

      [discovery] = await sql`
        insert into discoveries (user_id, search_name, country, query, results)
        values (${userId}, ${searchName}, ${country.code || null}, ${query}, ${JSON.stringify(candidates)})
        returning id, product_id, results, created_at
      `;
    }

    const trackedUrls = discovery.product_id
      ? (await sql`select url from listings where product_id = ${discovery.product_id}`).map((l) => l.url)
      : [];

    return {
      ...shopsFromDiscovery(discovery, { country, currency, fx, trackedUrls }),
      cached,
    };
  } catch (error) {
    console.error("Search by name error:", error);
    return { error: "Could not search for shops right now" };
  }
}

// The browser shrinks screenshots to ~1024px JPEG before upload; server actions
// accept about 1 MB by default.
const MAX_SCREENSHOT_BYTES = 900 * 1024;

// Identifies the product in a screenshot so the user can confirm the name before
// searching. The image is only sent to the vision model, never stored.
export async function identifyScreenshot(formData) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    const file = formData.get("image");
    if (!file || typeof file.arrayBuffer !== "function" || !file.type?.startsWith("image/")) {
      return { error: "Please choose an image" };
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { error: "That image is too large" };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await identifyProduct(`data:${file.type};base64,${bytes.toString("base64")}`);

    if (!result.isProduct) {
      return {
        error:
          "Couldn't find a product in this image. Try a screenshot that shows the product title or model number.",
      };
    }

    return { productName: result.productName, confidence: result.confidence };
  } catch (error) {
    console.error("Identify screenshot error:", error);
    return { error: "Could not read this image right now" };
  }
}

// Tracks a shop found by findShops or searchByName. Price data comes from the
// stored discovery, not from the browser, so it can't be tampered with.
export async function trackShop(discoveryId, url) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    const [discovery] = await sql`
      select id, product_id, search_name, results from discoveries
      where id = ${discoveryId} and user_id = ${userId}
    `;
    const shop = discovery?.results.find(
      (c) => c.url === url && c.status === "match"
    );
    if (!shop) {
      return { error: "Shop not found in this search" };
    }

    // The first shop tracked from a name/screenshot search creates the product
    let productId = discovery.product_id;
    if (!productId) {
      const [product] = await sql`
        insert into products (user_id, name, image_url)
        values (${userId}, ${discovery.search_name}, ${shop.image_url ?? null})
        returning id
      `;
      const [linked] = await sql`
        update discoveries set product_id = ${product.id}
        where id = ${discovery.id} and product_id is null
        returning product_id
      `;
      if (linked) {
        productId = product.id;
      } else {
        // Another click linked the search first; use that product instead
        await sql`delete from products where id = ${product.id}`;
        [{ product_id: productId }] = await sql`
          select product_id from discoveries where id = ${discovery.id}
        `;
      }
    }

    const [listing] = await sql`
      insert into listings (product_id, url, shop, name, current_price, currency, condition, image_url)
      values (${productId}, ${shop.url}, ${shop.shop}, ${shop.name},
        ${shop.price}, ${shop.currency}, ${shop.condition ?? "new"}, ${shop.image_url ?? null})
      on conflict (product_id, url) do nothing
      returning id
    `;

    if (listing) {
      await sql`
        insert into price_history (listing_id, price, currency)
        values (${listing.id}, ${shop.price}, ${shop.currency})
      `;
    }

    revalidatePath("/");
    return { success: true, productId };
  } catch (error) {
    return { error: error.message };
  }
}

export async function getShopCountry() {
  const { userId } = await auth();

  if (!userId) {
    return "";
  }

  const [settings] = await sql`
    select shop_country from user_settings where user_id = ${userId}
  `;
  return settings?.shop_country ?? "";
}

export async function setShopCountry(code) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    if (!findCountry(code)) {
      return { error: "Unsupported country" };
    }

    await sql`
      insert into user_settings (user_id, shop_country)
      values (${userId}, ${code || null})
      on conflict (user_id) do update set
        shop_country = excluded.shop_country,
        updated_at = now()
    `;

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

export async function getPreferredCurrency() {
  const { userId } = await auth();

  if (!userId) {
    return "USD";
  }

  const [settings] = await sql`
    select preferred_currency from user_settings where user_id = ${userId}
  `;
  return settings?.preferred_currency ?? "USD";
}

export async function setPreferredCurrency(currency) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    const fx = await getRates();
    if (!fx?.rates[currency]) {
      return { error: "Unsupported currency" };
    }

    await sql`
      insert into user_settings (user_id, preferred_currency)
      values (${userId}, ${currency})
      on conflict (user_id) do update set
        preferred_currency = excluded.preferred_currency,
        updated_at = now()
    `;

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}
