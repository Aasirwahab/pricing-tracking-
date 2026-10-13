"use client";

import { useTransition } from "react";
import { setPreferredCurrency } from "@/app/actions";
import { toast } from "sonner";

export default function CurrencySelect({ value, currencies }) {
  const [pending, startTransition] = useTransition();

  const handleChange = (e) => {
    const currency = e.target.value;
    startTransition(async () => {
      const result = await setPreferredCurrency(currency);
      if (result.error) toast.error(result.error);
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <span className="hidden sm:inline">Show prices in</span>
      <select
        value={value}
        onChange={handleChange}
        disabled={pending}
        aria-label="Preferred currency"
        className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
      >
        {currencies.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  );
}
