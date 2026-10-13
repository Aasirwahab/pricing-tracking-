import { auth } from "@clerk/nextjs/server";
import {
  getPreferredCurrency,
  getProducts,
  getShopCountry,
  setPreferredCurrency,
  setShopCountry,
} from "./actions";
import { getRates, withConvertedPrices } from "@/lib/currency";
import { SHOP_COUNTRIES } from "@/lib/countries";
import AddProductForm from "@/components/AddProductForm";
import ProductCard from "@/components/ProductCard";
import SettingSelect from "@/components/SettingSelect";
import { TrendingDown, Shield, Bell, Rabbit } from "lucide-react";
import AuthButton from "@/components/AuthButton";
import Image from "next/image";

export default async function Home() {
  const { userId } = await auth();
  const user = userId ? { id: userId } : null;

  const [rawProducts, currency, fx, shopCountry] = user
    ? await Promise.all([
        getProducts(),
        getPreferredCurrency(),
        getRates(),
        getShopCountry(),
      ])
    : [[], "USD", null, ""];

  const products = rawProducts.map((product) =>
    withConvertedPrices(product, currency, fx?.rates)
  );

  const FEATURES = [
    {
      icon: Rabbit,
      title: "Lightning Fast",
      description:
        "Deal Drop extracts prices in seconds, handling JavaScript and dynamic content",
    },
    {
      icon: Shield,
      title: "Always Reliable",
      description:
        "Works across all major e-commerce sites with built-in anti-bot protection",
    },
    {
      icon: Bell,
      title: "Smart Alerts",
      description: "Get notified instantly when prices drop below your target",
    },
  ];

  return (
    <main className="min-h-screen bg-linear-to-br from-orange-50 via-white to-orange-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image
              src="/deal-drop-logo.png"
              alt="Deal Drop Logo"
              width={600}
              height={200}
              className="h-10 w-auto"
            />
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <SettingSelect
                label="Shops in"
                value={shopCountry}
                options={SHOP_COUNTRIES.map((c) => ({
                  value: c.code,
                  label: c.name,
                }))}
                action={setShopCountry}
              />
            )}
            {user && fx && (
              <SettingSelect
                label="Show prices in"
                value={currency}
                options={Object.keys(fx.rates)
                  .sort()
                  .map((code) => ({ value: code, label: code }))}
                action={setPreferredCurrency}
              />
            )}
            <AuthButton user={user} />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-6 py-2 rounded-full text-sm font-medium mb-6">
            Made with ❤️ by Roadside Coder
          </div>

          <h2 className="text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            Never Miss a Price Drop
          </h2>
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
            Track prices from any e-commerce site. Get instant alerts when
            prices drop. Save money effortlessly.
          </p>

          <AddProductForm user={user} />

          {/* Features */}
          {products.length === 0 && (
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="bg-white p-6 rounded-xl border border-gray-200"
                >
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4 mx-auto">
                    <Icon className="w-6 h-6 text-orange-500" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                  <p className="text-sm text-gray-600">{description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Products Grid */}
      {user && products.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-20">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900">
              Your Tracked Products
            </h3>
            <span className="text-sm text-gray-500">
              {products.length} {products.length === 1 ? "product" : "products"}
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2 items-start">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={currency}
                shopCountry={shopCountry}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {user && products.length === 0 && (
        <section className="max-w-2xl mx-auto px-4 pb-20 text-center">
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12">
            <TrendingDown className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No products yet
            </h3>
            <p className="text-gray-600">
              Add your first product above to start tracking prices!
            </p>
          </div>
        </section>
      )}

      {fx && (
        <footer className="pb-8 text-center text-xs text-gray-400">
          Prices converted with rates from {fx.date} by{" "}
          <a
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Exchange Rate API
          </a>
        </footer>
      )}
    </main>
  );
}
