"use client";

import { useState } from "react";
import { trackShop } from "@/app/actions";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ConditionBadge from "./ConditionBadge";
import { Check, ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

export function SearchingNotice({ label = "Searching shops for the same product..." }) {
  return (
    <div className="rounded-md border bg-orange-50/40 p-4 text-sm text-gray-600 text-left">
      <div className="flex items-center gap-2 font-medium text-gray-800">
        <Loader2 className="w-4 h-4 animate-spin" />
        {label}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Checking several shop pages and matching the exact model. This takes
        about 30-60 seconds the first time; results are reused for a day.
      </p>
    </div>
  );
}

// The list of shops found by a search (findShops or searchByName). Tracking a shop
// marks it in place; `onTracked` is called with the result of trackShop.
export default function ShopResults({ result, onTracked }) {
  const [trackedUrls, setTrackedUrls] = useState([]);
  const [trackingUrl, setTrackingUrl] = useState(null);
  // New and refurbished/used prices aren't comparable, so new-only is the default.
  const [includeUsed, setIncludeUsed] = useState(false);

  const handleTrack = async (url) => {
    setTrackingUrl(url);
    const res = await trackShop(result.discoveryId, url);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Shop is now being tracked");
      setTrackedUrls((urls) => [...urls, url]);
      onTracked?.(res);
    }
    setTrackingUrl(null);
  };

  const isTracked = (s) => s.tracked || trackedUrls.includes(s.url);

  const shopRow = (s, i) => (
    <li key={s.url} className="flex items-center gap-3 p-2 text-left">
      <span className="w-5 text-center text-sm font-semibold text-gray-400">
        {i + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{s.shop}</span>
          <ConditionBadge condition={s.condition} />
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
        disabled={isTracked(s) || trackingUrl === s.url}
        onClick={() => handleTrack(s.url)}
        className="gap-1 w-24"
      >
        {isTracked(s) ? (
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
  );

  const { country, searchedAt, limits } = result;
  const isWorldwide = country === "Worldwide";
  const visible = (list, limit) =>
    list.filter((s) => includeUsed || s.condition === "new").slice(0, limit);
  const shops = visible(result.shops, limits.local);
  const internationalShops = visible(result.internationalShops, limits.international);
  const notNewCount = [...result.shops, ...result.internationalShops].filter(
    (s) => s.condition !== "new"
  ).length;

  return (
    <div className="space-y-2 rounded-md border bg-orange-50/40 p-3 text-left">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-800">
          {isWorldwide ? "Best prices found · Worldwide" : `Shops in ${country}`}
        </h4>
        <span className="text-xs text-gray-400">
          searched {new Date(searchedAt).toLocaleDateString("en-US")}
        </span>
      </div>

      {notNewCount > 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={includeUsed}
            onChange={(e) => setIncludeUsed(e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          Include refurbished &amp; used ({notNewCount})
        </label>
      )}

      {shops.length === 0 ? (
        <p className="text-sm text-gray-500">
          No shops in {country} with a readable price for this exact product.
          {result.unpricedShops?.length > 0 || internationalShops.length > 0
            ? " See below."
            : " Try \"Shops in: Worldwide\" at the top."}
        </p>
      ) : (
        <ol className="divide-y rounded-md border bg-white">{shops.map(shopRow)}</ol>
      )}

      {result.unpricedShops?.length > 0 && (
        <div className="rounded-md border border-dashed bg-white p-2">
          <p className="text-sm font-medium text-gray-700">
            Also listed{isWorldwide ? "" : ` in ${country}`}
            <span className="ml-1 font-normal text-gray-500">
              · price not shown to us (the shop loads or hides it); check on the shop page
            </span>
          </p>
          <ul className="mt-1 space-y-1">
            {result.unpricedShops.map((s) => (
              <li key={s.url} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900">{s.shop}</span>
                <span className="truncate text-gray-500">{s.title}</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto shrink-0 text-orange-600 hover:underline"
                >
                  View
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {internationalShops.length > 0 && (
        <details className="group" open={shops.length === 0}>
          <summary className="cursor-pointer select-none text-sm font-medium text-gray-700">
            International shops ({internationalShops.length})
            <span className="ml-1 font-normal text-gray-500">
              · may not deliver to {country}; shipping and import duties extra
            </span>
          </summary>
          <ol className="mt-2 divide-y rounded-md border bg-white opacity-90">
            {internationalShops.map(shopRow)}
          </ol>
        </details>
      )}

      <p className="text-xs text-gray-400">
        Found by web search; an AI decision model (Jev) checks each shop sells the exact same model.
        Always confirm details on the shop page before buying.
      </p>
    </div>
  );
}
