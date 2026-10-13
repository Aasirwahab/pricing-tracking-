"use client";

import { useState } from "react";
import { addProduct, deleteListing, deleteProduct } from "@/app/actions";
import { formatPrice } from "@/lib/format";
import PriceChart from "./PriceChart";
import PriceAnalysis from "./PriceAnalysis";
import FindShops from "./FindShops";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ExternalLink,
  Trash2,
  Store,
  LineChart,
  X,
  Plus,
  Loader2,
  BarChart3,
  Search,
} from "lucide-react";
import { toast } from "sonner";

// `product.listings` arrive sorted cheapest first, each with `converted_price`
// in `currency` (null when no exchange rate is available for that listing).
export default function ProductCard({ product, currency, shopCountry }) {
  const [chartListingId, setChartListingId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [shopUrl, setShopUrl] = useState("");
  const [addingShop, setAddingShop] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showShops, setShowShops] = useState(false);

  const cheapest = product.listings[0];
  const shopCount = product.listings.length;

  const handleDelete = async () => {
    if (!confirm("Remove this product and all its shops from tracking?"))
      return;

    setDeleting(true);
    await deleteProduct(product.id);
  };

  const handleRemoveListing = async (listing) => {
    const message =
      shopCount === 1
        ? `Remove ${listing.shop}? This is the only shop, so the product will be removed too.`
        : `Remove ${listing.shop} from this product?`;
    if (!confirm(message)) return;

    const result = await deleteListing(listing.id);
    if (result.error) toast.error(result.error);
  };

  const handleAddShop = async (e) => {
    e.preventDefault();
    setAddingShop(true);

    const formData = new FormData();
    formData.append("url", shopUrl);
    formData.append("productId", product.id);

    const result = await addProduct(formData);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setShopUrl("");
    }

    setAddingShop(false);
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex gap-4">
          {product.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              className="w-20 h-20 object-cover rounded-md border"
            />
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">
              {product.name}
            </h3>

            {cheapest && (
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm text-gray-500">
                  {shopCount > 1 ? "From" : "Price"}
                </span>
                <span className="text-3xl font-bold text-orange-500">
                  {cheapest.converted_price != null
                    ? formatPrice(cheapest.converted_price, currency)
                    : formatPrice(cheapest.current_price, cheapest.currency)}
                </span>
                <Badge variant="secondary" className="gap-1">
                  <Store className="w-3 h-3" />
                  {shopCount} {shopCount === 1 ? "shop" : "shops"}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {showShops && (
          <FindShops
            productId={product.id}
            currency={currency}
            shopCountry={shopCountry}
          />
        )}

        {showAnalysis && (
          <PriceAnalysis productId={product.id} currency={currency} />
        )}

        <ul className="divide-y rounded-md border">
          {product.listings.map((listing, index) => {
            const sameCurrency = listing.currency === currency;
            const showingChart = chartListingId === listing.id;

            return (
              <li key={listing.id} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {listing.shop}
                      </span>
                      {index === 0 && shopCount > 1 && (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          Cheapest
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {formatPrice(listing.current_price, listing.currency)}
                      {!sameCurrency && (
                        <span className="text-gray-400">
                          {" "}
                          ≈{" "}
                          {listing.converted_price != null
                            ? formatPrice(listing.converted_price, currency)
                            : "no rate"}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={showingChart ? "Hide price chart" : "Show price chart"}
                    onClick={() =>
                      setChartListingId(showingChart ? null : listing.id)
                    }
                    className={showingChart ? "text-orange-600" : ""}
                  >
                    <LineChart className="w-4 h-4" />
                  </Button>

                  <Button variant="outline" size="sm" asChild className="gap-1">
                    <a href={listing.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                      Buy
                    </a>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${listing.shop}`}
                    onClick={() => handleRemoveListing(listing)}
                    className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {showingChart && (
                  <div className="pt-3">
                    <PriceChart listingId={listing.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={handleAddShop} className="flex gap-2">
          <Input
            type="url"
            value={shopUrl}
            onChange={(e) => setShopUrl(e.target.value)}
            placeholder="Add another shop's link for this product"
            required
            disabled={addingShop}
            className="h-9 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={addingShop}
            className="gap-1 shrink-0"
          >
            {addingShop ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add shop
          </Button>
        </form>
      </CardContent>

      <CardFooter className="pt-0 flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => setShowShops(!showShops)}
            className="gap-1 bg-orange-500 hover:bg-orange-600"
          >
            <Search className="w-4 h-4" />
            {showShops ? "Hide shops" : "Find best prices"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="gap-1"
          >
            <BarChart3 className="w-4 h-4" />
            {showAnalysis ? "Hide analysis" : "Price analysis"}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
        >
          <Trash2 className="w-4 h-4" />
          Remove product
        </Button>
      </CardFooter>
    </Card>
  );
}
