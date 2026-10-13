"use client";

import { useEffect, useState } from "react";
import { getPriceAnalysis } from "@/app/actions";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";

const VERDICT_STYLES = {
  great: { label: "Great price", className: "bg-green-100 text-green-800" },
  good: { label: "Good price", className: "bg-emerald-50 text-emerald-700" },
  typical: { label: "Typical price", className: "bg-gray-100 text-gray-700" },
  high: { label: "Higher than usual", className: "bg-amber-100 text-amber-800" },
  new: { label: "Not enough history yet", className: "bg-blue-50 text-blue-700" },
};

const signedPct = (x) =>
  `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;

// `currency` is only used to refetch when the user switches currency.
export default function PriceAnalysis({ productId, currency }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPriceAnalysis(productId).then((data) => {
      if (!cancelled) setResult(data);
    });
    return () => {
      cancelled = true;
    };
  }, [productId, currency]);

  if (!result) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Analyzing prices...
      </div>
    );
  }

  if (result.error) {
    return <p className="py-4 text-sm text-gray-500">{result.error}</p>;
  }

  const { analysis: a, summary, source } = result;
  const verdict = VERDICT_STYLES[a.verdict];
  const f = (n) => formatPrice(n, a.currency);

  const stats = [
    { label: "Cheapest now", value: f(a.cheapest.price), note: a.cheapest.shop },
    a.shopCount > 1 && {
      label: "Save vs priciest",
      value: f(a.savings),
      note: a.priciest.shop,
    },
    a.verdict !== "new" && {
      label: "Lowest seen",
      value: f(a.lowest.price),
      note: a.lowest.date,
    },
    a.verdict !== "new" && {
      label: "30-day average",
      value: f(a.average30),
      note: `now ${signedPct(a.vsAverage)}`,
    },
    a.change7d != null && a.verdict !== "new" && {
      label: "Last 7 days",
      value: signedPct(a.change7d),
    },
    { label: "History", value: `${a.daysTracked} ${a.daysTracked === 1 ? "day" : "days"}` },
  ].filter(Boolean);

  return (
    <div className="space-y-3 rounded-md border bg-orange-50/40 p-3">
      <Badge variant="outline" className={`border-transparent ${verdict.className}`}>
        {verdict.label}
      </Badge>

      <p className="text-sm text-gray-800">{summary}</p>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded bg-white p-2 border">
            <dt className="text-xs text-gray-500">{s.label}</dt>
            <dd className="font-semibold text-gray-900">{s.value}</dd>
            {s.note && <dd className="text-xs text-gray-500 truncate">{s.note}</dd>}
          </div>
        ))}
      </dl>

      <p className="flex items-center gap-1 text-xs text-gray-400">
        {source === "ai" && <Sparkles className="w-3 h-3" />}
        {source === "ai"
          ? "Summary written by AI from the numbers above"
          : "Summary generated from the numbers above"}
      </p>
    </div>
  );
}
