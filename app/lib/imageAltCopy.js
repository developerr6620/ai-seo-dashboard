/**
 * Image ALT Text Generation and Optimization Utilities
 * Adheres to SEO and WCAG Accessibility best practices:
 * - Recommended length: under 125 characters
 * - Descriptive, natural language avoiding spammy keyword stuffing
 * - Contextual image view awareness (front, detail, angle, lifestyle)
 * - Support for Products, Store Files (Content -> Files), and Collection Banners
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
 * Turns messy filenames (e.g. `hero-banner_summer-sale_v2_1200x800.jpg?v=123`)
 * into clean, readable title-cased English descriptions (e.g. `Summer Sale Banner Hero`).
 */
export function cleanFilename(rawNameOrUrl) {
  if (!rawNameOrUrl) return "Store Image";

  // If a full URL is passed, extract the filename from path
  let filename = String(rawNameOrUrl).split("?")[0].split("#")[0];
  if (filename.includes("/")) {
    filename = filename.substring(filename.lastIndexOf("/") + 1);
  }

  // Strip file extensions
  filename = filename.replace(/\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff)$/i, "");

  // Strip dimension suffixes like _1200x800, _800x, _2048x2048
  filename = filename.replace(/_\d+x\d*/gi, "");

  // Strip version / draft / hash suffixes
  filename = filename.replace(/[_-](v\d+|final|draft|edit|copy|thumb|compressed|master)$/gi, "");

  // Strip common noisy prefixes
  filename = filename.replace(/^(img|dsc|screenshot|photo|image|banner)[_-]?/gi, "");

  // Replace underscores, hyphens, and dots with spaces
  filename = filename.replace(/[_\-.]+/g, " ").trim();

  // If empty after stripping, return fallback
  if (!filename) return "Store Image";

  // Title case each word
  const titleCased = filename
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return titleCased || "Store Image";
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

export const FILE_ALT_PRESETS = [
  {
    id: "file_balanced",
    label: "Balanced (Recommended)",
    description: "Cleaned filename with store name",
    template: "{filename} - {store_name}",
  },
  {
    id: "file_clean",
    label: "Filename Only",
    description: "Pure natural-English image title",
    template: "{filename}",
  },
  {
    id: "file_brand_first",
    label: "Store First",
    description: "Store name followed by descriptive file title",
    template: "{store_name} | {filename}",
  },
  {
    id: "file_banner",
    label: "Banner & Promotion",
    description: "Appends Banner to the image subject",
    template: "{filename} Banner - {store_name}",
  },
];

export const COLLECTION_ALT_PRESETS = [
  {
    id: "col_balanced",
    label: "Balanced (Recommended)",
    description: "Collection title with store name",
    template: "{collection_title} Collection Banner - {store_name}",
  },
  {
    id: "col_clean",
    label: "Category Only",
    description: "Collection name banner",
    template: "{collection_title} Collection",
  },
  {
    id: "col_action",
    label: "Action / Shop Now",
    description: "High-converting action phrase",
    template: "Shop {collection_title} at {store_name}",
  },
];

/**
 * Generate an optimized Image ALT text for products
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

  let kw = cleanText(keyword);
  if (!kw && Array.isArray(keywords) && keywords.length > 0) {
    const validKw = keywords.map(cleanText).filter(Boolean);
    kw = validKw[imageIndex % validKw.length] || validKw[0] || "";
  }
  if (!kw) {
    kw = title.split(" ").slice(0, 3).join(" ");
  }

  const view = getImageViewLabel(imageIndex, totalImages);

  if (template && typeof template === "string") {
    let result = template
      .replace(/\{product_title\}/gi, title)
      .replace(/\{keyword\}/gi, kw)
      .replace(/\{brand\}/gi, vendor)
      .replace(/\{store_name\}/gi, cleanText(storeName) || vendor)
      .replace(/\{view\}/gi, view ? `(${view})` : "");

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

  return fitWords(parts.join(" "), ALT_MAX);
}

/**
 * Generate an optimized ALT text for Store Files (Content -> Files)
 */
export function generateStoreFileAltText({
  filename = "",
  url = "",
  storeName = "",
  template = "",
} = {}) {
  const name = cleanFilename(filename || url);
  const store = cleanText(storeName) || "Store";

  if (template && typeof template === "string") {
    let result = template
      .replace(/\{filename\}/gi, name)
      .replace(/\{store_name\}/gi, store)
      .replace(/\{brand\}/gi, store);

    result = result
      .replace(/\s*-\s*by\s*$/gi, "")
      .replace(/\s*-\s*$/gi, "")
      .replace(/\s*\|\s*$/gi, "")
      .replace(/\s*-\s*-\s*/g, " - ")
      .trim();

    return fitWords(result, ALT_MAX);
  }

  return fitWords(`${name} - ${store}`, ALT_MAX);
}

/**
 * Generate an optimized ALT text for Collection Banners
 */
export function generateCollectionAltText({
  collectionTitle = "",
  storeName = "",
  template = "",
} = {}) {
  const title = cleanText(collectionTitle) || "Collection";
  const store = cleanText(storeName) || "Store";

  if (template && typeof template === "string") {
    let result = template
      .replace(/\{collection_title\}/gi, title)
      .replace(/\{store_name\}/gi, store)
      .replace(/\{brand\}/gi, store);

    result = result
      .replace(/\s*-\s*by\s*$/gi, "")
      .replace(/\s*-\s*$/gi, "")
      .replace(/\s*\|\s*$/gi, "")
      .replace(/\s*-\s*-\s*/g, " - ")
      .trim();

    return fitWords(result, ALT_MAX);
  }

  return fitWords(`${title} Collection Banner - ${store}`, ALT_MAX);
}
