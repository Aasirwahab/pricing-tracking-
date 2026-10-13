"use client";

import { useEffect, useState } from "react";
import { findShops } from "@/app/actions";
import ShopResults, { SearchingNotice } from "./ShopResults";

// Shows the cheapest shops found for a tracked product. `currency` and `shopCountry`
// are only used to refetch when the user changes those settings.
export default function FindShops({ productId, currency, shopCountry }) {
  // Results are stored with the settings they were fetched for; a mismatch means "loading".
  // `refreshes` is part of the key so "Search again" also shows the loading state.
  const [refreshes, setRefreshes] = useState(0);
  const key = `${productId}|${currency}|${shopCountry}|${refreshes}`;
  const [fetched, setFetched] = useState(null);
  const result = fetched?.key === key ? fetched.data : null;

  useEffect(() => {
    let cancelled = false;
    findShops(productId, { refresh: refreshes > 0 }).then((data) => {
      if (!cancelled) setFetched({ key, data });
    });
    return () => {
      cancelled = true;
    };
  }, [key, productId, refreshes]);

  if (!result) return <SearchingNotice />;

  if (result.error) {
    return <p className="py-2 text-sm text-gray-500">{result.error}</p>;
  }

  return (
    <ShopResults
      key={key}
      result={result}
      onRefresh={() => setRefreshes((n) => n + 1)}
    />
  );
}
