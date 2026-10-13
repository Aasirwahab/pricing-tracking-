import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { scrapeProduct } from "@/lib/firecrawl";
import { sendPriceDropAlert } from "@/lib/email";
import { checkPriceChange } from "@/lib/price-guard";

async function getUserEmail(userId) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
    ?.emailAddress;
}

// Vercel Cron calls this with GET and `Authorization: Bearer $CRON_SECRET`.
// POST is kept so the endpoint can still be triggered manually (curl).
async function handler(request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const products = await sql`
      select id, user_id, url, name, current_price::float8 as current_price,
        currency, image_url, pending_price::float8 as pending_price, pending_currency
      from products
    `;

    console.log(`Found ${products.length} products to check`);

    const results = {
      total: products.length,
      updated: 0,
      failed: 0,
      priceChanges: 0,
      alertsSent: 0,
      flagged: 0,
    };

    for (const product of products) {
      try {
        const productData = await scrapeProduct(product.url);

        if (!productData.currentPrice) {
          results.failed++;
          continue;
        }

        const newPrice = parseFloat(productData.currentPrice);
        const oldPrice = product.current_price;
        const currency = productData.currencyCode || product.currency;

        // A flagged price that shows up again on the next check is accepted:
        // scraping glitches rarely repeat identically, real price changes persist.
        const confirmedPending =
          product.pending_price === newPrice &&
          product.pending_currency === currency;

        const guard = confirmedPending
          ? { genuine: true }
          : await checkPriceChange({
              trackedName: product.name,
              scrapedName: productData.productName || product.name,
              oldPrice,
              oldCurrency: product.currency,
              newPrice,
              newCurrency: currency,
            });

        if (!guard.genuine) {
          await sql`
            update products set
              pending_price = ${newPrice},
              pending_currency = ${currency}
            where id = ${product.id}
          `;
          console.warn(
            `Flagged price for product ${product.id}: ${product.currency} ${oldPrice} -> ${currency} ${newPrice} (genuine p=${guard.probability})`
          );
          results.flagged++;
          continue;
        }

        await sql`
          update products set
            current_price = ${newPrice},
            currency = ${currency},
            name = ${productData.productName || product.name},
            image_url = ${productData.productImageUrl || product.image_url},
            pending_price = null,
            pending_currency = null,
            updated_at = now()
          where id = ${product.id}
        `;

        if (oldPrice !== newPrice) {
          await sql`
            insert into price_history (product_id, price, currency)
            values (${product.id}, ${newPrice}, ${currency})
          `;

          results.priceChanges++;

          if (newPrice < oldPrice) {
            const email = await getUserEmail(product.user_id);

            if (email) {
              const emailResult = await sendPriceDropAlert(
                email,
                product,
                oldPrice,
                newPrice
              );

              if (emailResult.success) {
                results.alertsSent++;
              }
            }
          }
        }

        results.updated++;
      } catch (error) {
        console.error(`Error processing product ${product.id}:`, error);
        results.failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Price check completed",
      results,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
