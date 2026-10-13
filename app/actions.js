"use server";

import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { scrapeProduct } from "@/lib/firecrawl";
import { revalidatePath } from "next/cache";

export async function addProduct(formData) {
  const url = formData.get("url");

  if (!url) {
    return { error: "URL is required" };
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Not authenticated" };
    }

    // Scrape product data with Firecrawl
    const productData = await scrapeProduct(url);

    if (!productData.productName || !productData.currentPrice) {
      console.log(productData, "productData");
      return { error: "Could not extract product information from this URL" };
    }

    const newPrice = parseFloat(productData.currentPrice);
    const currency = productData.currencyCode || "USD";

    // Check if product exists to determine if it's an update
    const [existingProduct] = await sql`
      select id, current_price::float8 as current_price
      from products
      where user_id = ${userId} and url = ${url}
    `;

    const isUpdate = !!existingProduct;

    // Upsert product (insert or update based on user_id + url)
    const [product] = await sql`
      insert into products (user_id, url, name, current_price, currency, image_url)
      values (${userId}, ${url}, ${productData.productName}, ${newPrice}, ${currency}, ${productData.productImageUrl})
      on conflict (user_id, url) do update set
        name = excluded.name,
        current_price = excluded.current_price,
        currency = excluded.currency,
        image_url = excluded.image_url,
        updated_at = now()
      returning id, user_id, url, name, current_price::float8 as current_price,
        currency, image_url, created_at, updated_at
    `;

    // Add to price history if it's a new product OR price changed
    const shouldAddHistory =
      !isUpdate || existingProduct.current_price !== newPrice;

    if (shouldAddHistory) {
      await sql`
        insert into price_history (product_id, price, currency)
        values (${product.id}, ${newPrice}, ${currency})
      `;
    }

    revalidatePath("/");
    return {
      success: true,
      product,
      message: isUpdate
        ? "Product updated with latest price!"
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

export async function getProducts() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return [];
    }

    return await sql`
      select id, user_id, url, name, current_price::float8 as current_price,
        currency, image_url, created_at, updated_at
      from products
      where user_id = ${userId}
      order by created_at desc
    `;
  } catch (error) {
    console.error("Get products error:", error);
    return [];
  }
}

export async function getPriceHistory(productId) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return [];
    }

    return await sql`
      select ph.id, ph.product_id, ph.price::float8 as price, ph.currency, ph.checked_at
      from price_history ph
      join products p on p.id = ph.product_id
      where ph.product_id = ${productId} and p.user_id = ${userId}
      order by ph.checked_at asc
    `;
  } catch (error) {
    console.error("Get price history error:", error);
    return [];
  }
}
