"use server";

import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { scrapeProduct } from "@/lib/firecrawl";
import { getRates } from "@/lib/currency";
import { analyzePrices } from "@/lib/analysis";
import { getInsight } from "@/lib/insights";
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
          image_url = ${productData.productImageUrl},
          updated_at = now()
        where id = ${existing.id}
      `;
      listingId = existing.id;
    } else if (productId) {
      const [listing] = await sql`
        insert into listings (product_id, url, shop, name, current_price, currency, image_url)
        values (${productId}, ${url}, ${shopFromUrl(url)}, ${productData.productName},
          ${newPrice}, ${currency}, ${productData.productImageUrl})
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
        insert into listings (product_id, url, shop, name, current_price, currency, image_url)
        select id, ${url}, ${shopFromUrl(url)}, ${productData.productName},
          ${newPrice}, ${currency}, ${productData.productImageUrl}
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
