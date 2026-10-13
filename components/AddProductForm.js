"use client";

import { useRef, useState } from "react";
import { addProduct, identifyScreenshot, searchByName } from "@/app/actions";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ShopResults, { SearchingNotice } from "./ShopResults";

const isUrl = (text) => /^https?:\/\/\S+$/i.test(text.trim());

// Shrinks a screenshot before upload: smaller request, fewer vision tokens.
async function shrinkImage(file, maxSide = 1024) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

// Add a product by link (tracked directly), by name (search shops first), or by
// screenshot (identify the product, let the user confirm the name, then search).
export default function AddProductForm({ user }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const fileInput = useRef(null);
  const { openSignIn } = useClerk();

  const urlMode = isUrl(text);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      openSignIn();
      return;
    }

    setLoading(true);

    if (urlMode) {
      const formData = new FormData();
      formData.append("url", text.trim());
      const result = await addProduct(formData);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message || "Product tracked successfully!");
        setText("");
      }
    } else {
      setSearchResult(null);
      setSearchResult(await searchByName(text));
    }

    setIdentified(null);
    setLoading(false);
  };

  const handleImage = async (file) => {
    if (!file?.type?.startsWith("image/")) return;
    if (!user) {
      openSignIn();
      return;
    }

    setIdentifying(true);
    setSearchResult(null);
    try {
      const formData = new FormData();
      formData.append("image", await shrinkImage(file), "screenshot.jpg");
      const result = await identifyScreenshot(formData);

      if (result.error) {
        toast.error(result.error);
      } else {
        setText(result.productName);
        setIdentified(result);
      }
    } catch {
      toast.error("Could not read this image");
    }
    setIdentifying(false);
  };

  const handlePaste = (e) => {
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (image) {
      e.preventDefault();
      handleImage(image);
    }
  };

  const busy = loading || identifying;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setIdentified(null);
              }}
              onPaste={handlePaste}
              placeholder="Paste a product link, or type a product name"
              className="h-12 text-base pr-12"
              required
              disabled={busy}
              aria-label="Product link or name"
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              title="Find a product from a screenshot"
              aria-label="Find a product from a screenshot"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-gray-500 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50"
            >
              {identifying ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="bg-orange-500 hover:bg-orange-600 h-10 sm:h-12 px-8 gap-2"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {urlMode ? "Adding..." : "Searching..."}
              </>
            ) : urlMode || !text.trim() ? (
              "Track Price"
            ) : (
              <>
                <Search className="h-4 w-4" />
                Find shops
              </>
            )}
          </Button>
        </div>
      </form>

      {identifying && (
        <p className="text-sm text-gray-500">Reading your screenshot...</p>
      )}

      {identified && (
        <p className="flex items-start gap-2 rounded-md bg-orange-50 p-3 text-left text-sm text-gray-700">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
          <span>
            We think this is <strong>{identified.productName}</strong>. Check the
            model and color, edit the name if needed, then press <strong>Find shops</strong>.
          </span>
        </p>
      )}

      {!text && !identified && !searchResult && (
        <p className="text-xs text-gray-500">
          Tip: use the <Camera className="inline h-3 w-3" /> button or paste a screenshot (Ctrl+V).
          Works best when the screenshot shows the product title or model number.
        </p>
      )}

      {loading && !urlMode && <SearchingNotice label="Searching shops for this product..." />}

      {searchResult?.error && (
        <p className="text-sm text-gray-500">{searchResult.error}</p>
      )}

      {searchResult && !searchResult.error && (
        <ShopResults key={searchResult.discoveryId} result={searchResult} />
      )}
    </div>
  );
}
