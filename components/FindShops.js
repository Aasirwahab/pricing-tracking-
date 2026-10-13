"use client";

import { useEffect, useState } from "react";
import { findShops, trackShop } from "@/app/actions";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

// Shows the cheapest shops found for a product. `currency` and `shopCountry` are
// only used to refetch when the user changes those settings.
export default function FindShops({ productId, currency, shopCountry }) {
  // Results are stored with the settings they were fetched for; a mismatch means "loading".
  const key = `${productId}|${currency}|${shopCountry}`;
  const [fetched, setFetched] = useState(null);
  const [trackingUrl, setTrackingUrl] = useState(null);
  const result = fetched?.key === key ? fetched.data : null;

  useEffect(() => {
    let cancelled = false;
    findShops(productId).then((data) => {
      if (!cancelled) setFetched({ key, data });
    });
    return () => {
      cancelled = true;
    };
  }, [key, productId]);

  const handleTrack = async (url) => {
    setTrackingUrl(url);
    const res = await trackShop(result.discoveryId, url);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Shop added to this product");
      setFetched({
        key,
        data: {
          ...result,
          shops: result.shops.map((s) => (s.url === url ? { ...s, tracked: true } : s)),
        },
      });
    }
    setTrackingUrl(null);
  };

  if (!result) {
    return (
      <div className="rounded-md border bg-orange-50/40 p-4 text-sm text-gray-600">
        <div className="flex items-center gap-2 font-medium text-gray-800">
          <Loader2 className="w-4 h-4 animate-spin" />
          Searching shops for the same product...
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Checking several shop pages and matching the exact model. This takes
          about 30-60 seconds the first time; results are reused for a day.
        </p>
      </div>
    );
  }

  if (result.error) {
    return <p className="py-2 text-sm text-gray-500">{result.error}</p>;
  }

  const { shops, country, searchedAt } = result;

  return (
    <div className="space-y-2 rounded-md border bg-orange-50/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-800">
          Best prices found · {country}
        </h4>
        <span className="text-xs text-gray-400">
          searched {new Date(searchedAt).toLocaleDateString("en-US")}
        </span>
      </div>

      {shops.length === 0 ? (
        <p className="text-sm text-gray-500">
          No other shops with this exact product were found in {country}. Try
          &quot;Shops in: Worldwide&quot; at the top.
        </p>
      ) : (
        <ol className="divide-y rounded-md border bg-white">
          {shops.map((s, i) => (
            <li key={s.url} className="flex items-center gap-3 p-2">
              <span className="w-5 text-center text-sm font-semibold text-gray-400">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{s.shop}</span>
                  <Badge variant="outline" className="border-transparent bg-gray-100 text-gray-600">
                    {Math.round(s.matchP * 100)}% match
                  </Badge>
                </div>
                <div className="text-sm text-gray-600">
                  {formatPrice(s.price, s.currency)}
                  {s.currency !== result.currency && s.converted_price != null && (
                    <span className="text-gray-400">
                      {" "}≈ {formatPrice(s.converted_price, result.currency)}
                    </span>
                  )}
                </div>
              </div>

              <Button variant="ghost" size="sm" asChild className="gap-1">
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                  View
                </a>
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={s.tracked || trackingUrl === s.url}
                onClick={() => handleTrack(s.url)}
                className="gap-1 w-24"
              >
                {s.tracked ? (
                  <>
                    <Check className="w-4 h-4" />
                    Tracking
                  </>
                ) : trackingUrl === s.url ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Track
                  </>
                )}
              </Button>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-gray-400">
        Found by web search; an AI decision model (Jev) checks each shop sells the exact same model.
        Always confirm details on the shop page before buying.
      </p>
    </div>
  );
}
