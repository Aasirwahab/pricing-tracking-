// Countries offered for "Shops in". `code` is passed to Firecrawl search (ISO 3166-1
// alpha-2, lowercase); an empty code means a worldwide search. `currency` and `tld`
// are used to tell local shops from international ones.
export const SHOP_COUNTRIES = [
  { code: "", name: "Worldwide" },
  { code: "au", name: "Australia", currency: "AUD", tld: ".au" },
  { code: "ca", name: "Canada", currency: "CAD", tld: ".ca" },
  { code: "de", name: "Germany", currency: "EUR", tld: ".de" },
  { code: "in", name: "India", currency: "INR", tld: ".in" },
  { code: "my", name: "Malaysia", currency: "MYR", tld: ".my" },
  { code: "pk", name: "Pakistan", currency: "PKR", tld: ".pk" },
  { code: "sg", name: "Singapore", currency: "SGD", tld: ".sg" },
  { code: "lk", name: "Sri Lanka", currency: "LKR", tld: ".lk" },
  { code: "ae", name: "United Arab Emirates", currency: "AED", tld: ".ae" },
  { code: "gb", name: "United Kingdom", currency: "GBP", tld: ".uk" },
  { code: "us", name: "United States", currency: "USD", tld: ".us" },
];

export function findCountry(code) {
  return SHOP_COUNTRIES.find((c) => c.code === (code ?? ""));
}

// A shop counts as local when it prices in the country's currency or uses the
// country's domain ending (e.g. a .lk shop, or a .com shop pricing in LKR).
// Worldwide searches treat every shop as local.
export function isLocalShop(country, { shop, currency }) {
  if (!country?.code) return true;
  return currency === country.currency || shop.endsWith(country.tld);
}
