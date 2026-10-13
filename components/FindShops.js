"use client";

import { useEffect, useState } from "react";
import { findShops } from "@/app/actions";
import ShopResults, { SearchingNotice } from "./ShopResults";

// Shows the cheapest shops found for a tracked product. `currency` and `shopCountry`
// are only used to refetch when the user changes those settings.
export default function FindShops({ productId, currency, shopCountry }) {
  // Results are stored with the settings they were fetched for; a mismatch means "loading".
  const key = `${productId}|${currency}|${shopCountry}`;
  const [fetched, setFetched] = useState(null);
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

  if (!result) return <SearchingNotice />;

  if (result.error) {
    return <p className="py-2 text-sm text-gray-500">{result.error}</p>;
  }

  return <ShopResults key={key} result={result} />;
}
