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

    const listings = await sql`
      select l.id, p.user_id, l.url, l.name, l.current_price::float8 as current_price,
        l.currency, l.image_url, l.pending_price::float8 as pending_price, l.pending_currency
      from listings l
      join products p on p.id = l.product_id
    `;

    console.log(`Found ${listings.length} listings to check`);

    const results = {
      total: listings.length,
      updated: 0,
      failed: 0,
      priceChanges: 0,
      alertsSent: 0,
      flagged: 0,
    };

    for (const listing of listings) {
      try {
        const productData = await scrapeProduct(listing.url);

        if (!productData.currentPrice) {
          results.failed++;
          continue;
        }

        const newPrice = parseFloat(productData.currentPrice);
        const oldPrice = listing.current_price;
        const currency = productData.currencyCode || listing.currency;

        // A flagged price that shows up again on the next check is accepted:
        // scraping glitches rarely repeat identically, real price changes persist.
        const confirmedPending =
          listing.pending_price === newPrice &&
          listing.pending_currency === currency;

        const guard = confirmedPending
          ? { genuine: true }
          : await checkPriceChange({
              trackedName: listing.name,
              scrapedName: productData.productName || listing.name,
              oldPrice,
              oldCurrency: listing.currency,
              newPrice,
              newCurrency: currency,
            });

        if (!guard.genuine) {
          await sql`
            update listings set
              pending_price = ${newPrice},
              pending_currency = ${currency}
            where id = ${listing.id}
          `;
          console.warn(
            `Flagged price for listing ${listing.id}: ${listing.currency} ${oldPrice} -> ${currency} ${newPrice} (genuine p=${guard.probability})`
          );
          results.flagged++;
          continue;
        }

        await sql`
          update listings set
            current_price = ${newPrice},
            currency = ${currency},
            name = ${productData.productName || listing.name},
            image_url = ${productData.productImageUrl || listing.image_url},
            pending_price = null,
            pending_currency = null,
            updated_at = now()
          where id = ${listing.id}
        `;

        if (oldPrice !== newPrice) {
          await sql`
            insert into price_history (listing_id, price, currency)
            values (${listing.id}, ${newPrice}, ${currency})
          `;

          results.priceChanges++;

          if (newPrice < oldPrice) {
            const email = await getUserEmail(listing.user_id);

            if (email) {
              const emailResult = await sendPriceDropAlert(
                email,
                listing,
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
        console.error(`Error processing listing ${listing.id}:`, error);
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
