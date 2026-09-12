/**
 * Image ALT Text Generation and Optimization Utilities
 * Adheres to SEO and WCAG Accessibility best practices:
 * - Recommended length: under 125 characters
 * - Descriptive, natural language avoiding spammy keyword stuffing
 * - Contextual image view awareness (front, detail, angle, lifestyle)
 */

export const ALT_MAX = 125;
export const ALT_WARN = 100;

export function isAltOk(text) {
  const len = String(text || "").trim().length;
  return len > 0 && len <= ALT_MAX;
}

export function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/["“”'‘’]/g, "")
    .trim();
}

/**
 * Ensures text does not exceed max length, never cuts mid-word,
 * and strips trailing punctuation.
 */
export function fitWords(text, max = ALT_MAX) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";
  if (cleaned.length <= max) return cleaned;

  const words = cleaned.split(" ").filter(Boolean);
  let acc = "";
  for (const word of words) {
    const next = acc ? `${acc} ${word}` : word;
    if (next.length <= max) {
      acc = next;
    } else {
      break;
    }
  }
  return acc.replace(/[,:;–—\-.]+$/g, "").trim();
}

/**
 * Returns contextual description of the image position in gallery
 */
export function getImageViewLabel(index = 0, total = 1) {
  if (total <= 1) return "";
  if (index === 0) return "Front View";
  if (index === 1) return "Angle View";
  if (index === 2) return "Detail & Texture";
  if (index === 3) return "Side View";
  if (index === 4) return "Back View";
  return `View ${index + 1}`;
}

export const ALT_PRESETS = [
  {
    id: "balanced",
    label: "Balanced (Recommended)",
    description: "Product title, primary keyword, and store/brand name",
    template: "{product_title} - {keyword} by {brand}",
  },
  {
    id: "descriptive",
    label: "Descriptive & Contextual",
    description: "Product title with specific image view angle and keyword",
    template: "{product_title} {view} - {keyword}",
  },
  {
    id: "clean",
    label: "Clean & Direct",
    description: "Product title and brand only (best for minimalist catalogs)",
    template: "{product_title} | {brand}",
  },
  {
    id: "keyword_focused",
    label: "Search & Keyword Focus",
    description: "Target keyword highlighted with product title",
    template: "{keyword} - {product_title}",
  },
];

/**
 * Generate an optimized Image ALT text using either a template or smart heuristics
 */
export function generateImageAltText({
  productTitle = "",
  keyword = "",
  keywords = [],
  brand = "",
  storeName = "",
  imageIndex = 0,
  totalImages = 1,
  template = "",
} = {}) {
  const title = cleanText(productTitle) || "Product";
  const vendor = cleanText(brand) || cleanText(storeName) || "";
  
  // Extract primary keyword
  let kw = cleanText(keyword);
  if (!kw && Array.isArray(keywords) && keywords.length > 0) {
    const validKw = keywords.map(cleanText).filter(Boolean);
    // Alternate keywords across multiple images if available
    kw = validKw[imageIndex % validKw.length] || validKw[0] || "";
  }
  if (!kw) {
    // Fallback: use first 2-3 words of title as topical subject
    kw = title.split(" ").slice(0, 3).join(" ");
  }

  const view = getImageViewLabel(imageIndex, totalImages);

  // If a template is provided, apply token replacements
  if (template && typeof template === "string") {
    let result = template
      .replace(/\{product_title\}/gi, title)
      .replace(/\{keyword\}/gi, kw)
      .replace(/\{brand\}/gi, vendor)
      .replace(/\{store_name\}/gi, cleanText(storeName) || vendor)
      .replace(/\{view\}/gi, view ? `(${view})` : "");

    // Clean up empty separators if tokens were missing
    result = result
      .replace(/\s*-\s*by\s*$/gi, "")
      .replace(/\s*by\s*$/gi, "")
      .replace(/\s*-\s*$/gi, "")
      .replace(/\s*\|\s*$/gi, "")
      .replace(/\s*-\s*-\s*/g, " - ")
      .replace(/\(\s*\)/g, "")
      .trim();

    return fitWords(result, ALT_MAX);
  }

  // Smart heuristic generation if no specific template is supplied
  const parts = [];
  parts.push(title);

  if (view && totalImages > 1) {
    parts.push(`(${view})`);
  }

  if (kw && !title.toLowerCase().includes(kw.toLowerCase())) {
    parts.push(`- ${kw}`);
  }

  if (vendor && !title.toLowerCase().includes(vendor.toLowerCase())) {
    parts.push(`by ${vendor}`);
  }

  const rawCandidate = parts.join(" ");
  return fitWords(rawCandidate, ALT_MAX);
}
