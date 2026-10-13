// Identifies a product from a screenshot or photo with a vision model, so the user can
// confirm the name before searching shops. The image is never stored.
import { generateText } from "./llm.js";

const SCHEMA = {
  type: "object",
  properties: {
    is_product: { type: "boolean" },
    brand: { type: "string" },
    model: { type: "string" },
    variant: { type: "string" },
    product_name: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["is_product", "brand", "model", "variant", "product_name", "confidence"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You identify the main product in a screenshot or photo so a shopper can search shops for it.
- is_product: false if there is no identifiable purchasable product.
- brand, model: as specific as the image allows. Prefer an exact model number or code when visible (e.g. "A159W-N1", "WH-1000XM5").
- variant: color, storage, size or edition when visible, otherwise "".
- product_name: a clean shop-style name, e.g. "Casio A159W-N1 Vintage Silver Digital Watch".
- confidence: 0 to 1, how sure you are of the exact model and variant (not just the brand).
Read visible text (product titles, labels, model codes) before guessing from appearance. Use "" for unknown fields.`;

// Runs once per screenshot (not per listing), so accuracy matters more than price.
// Compared on product photos and a shop screenshot (see eval/SCREENSHOTS.md):
// best exact-model rate on photos and fastest on the screenshot, ~$0.00045/image.
export const VISION_MODEL = "google/gemini-3.1-flash-lite";

// `imageDataUrl` is a data URL (e.g. "data:image/jpeg;base64,...").
export async function identifyProduct(imageDataUrl, visionModel = VISION_MODEL) {
  const { text, model } = await generateText({
    kind: "identify_screenshot",
    model: visionModel,
    system: SYSTEM_PROMPT,
    prompt: [
      { type: "text", text: "Identify the product in this image." },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ],
    // Room for reasoning models, which spend tokens thinking before the JSON answer
    maxTokens: 1000,
    jsonSchema: SCHEMA,
  });

  const result = JSON.parse(text);
  return {
    isProduct: Boolean(result.is_product) && result.product_name.trim().length > 0,
    brand: result.brand.trim(),
    model: result.model.trim(),
    variant: result.variant.trim(),
    productName: result.product_name.trim(),
    confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0)),
    visionModel: model,
  };
}
