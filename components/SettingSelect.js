"use client";

import { useTransition } from "react";
import { toast } from "sonner";

// A header dropdown that saves a user setting through a server action.
export default function SettingSelect({ label, value, options, action }) {
  const [pending, startTransition] = useTransition();

  const handleChange = (e) => {
    const next = e.target.value;
    startTransition(async () => {
      const result = await action(next);
      if (result.error) toast.error(result.error);
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <span className="hidden md:inline">{label}</span>
      <select
        value={value}
        onChange={handleChange}
        disabled={pending}
        aria-label={label}
        className="h-9 max-w-36 rounded-md border border-gray-300 bg-white px-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
