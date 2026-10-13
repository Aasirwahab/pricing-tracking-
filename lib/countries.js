// Countries offered for "Shops in". `code` is passed to Firecrawl search (ISO 3166-1
// alpha-2, lowercase); an empty code means a worldwide search.
export const SHOP_COUNTRIES = [
  { code: "", name: "Worldwide" },
  { code: "au", name: "Australia" },
  { code: "ca", name: "Canada" },
  { code: "de", name: "Germany" },
  { code: "in", name: "India" },
  { code: "my", name: "Malaysia" },
  { code: "pk", name: "Pakistan" },
  { code: "sg", name: "Singapore" },
  { code: "lk", name: "Sri Lanka" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "gb", name: "United Kingdom" },
  { code: "us", name: "United States" },
];

export function findCountry(code) {
  return SHOP_COUNTRIES.find((c) => c.code === (code ?? ""));
}
