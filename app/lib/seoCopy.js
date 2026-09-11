export const TITLE_MAX = 50;
export const DESC_MAX = 150;

export function isTitleOk(text) {
  const len = String(text || "").length;
  return len > 0 && len <= TITLE_MAX;
}

export function isDescOk(text) {
  const len = String(text || "").length;
  return len > 0 && len <= DESC_MAX;
}

function normalizeSpace(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordList(keyword, keywords) {
  const raw = Array.isArray(keywords)
    ? keywords
    : `${keyword || ""},${keywords || ""}`.split(",");
  return raw
    .map((k) => normalizeSpace(k))
    .filter(Boolean)
    .filter((k) => !/^(best quality|top rated|premium)$/i.test(k));
}

function wordsFit(text, max) {
  const words = normalizeSpace(text).split(" ").filter(Boolean);
  let acc = "";
  for (const word of words) {
    const next = acc ? `${acc} ${word}` : word;
    if (next.length <= max) acc = next;
    else break;
  }
  return acc.replace(/[,:;–—-]+$/g, "").trim();
}

/** Keep full sentences, then full words. Never cut mid-word. */
export function fitComplete(text, max, { asSentence = false } = {}) {
  let t = normalizeSpace(text);
  if (!t) return "";

  if (t.length <= max) {
    if (asSentence && !/[.!?]$/.test(t) && t.length + 1 <= max) t += ".";
    return t;
  }

  const sentences = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [t];
  let built = "";
  for (const raw of sentences) {
    const piece = normalizeSpace(raw);
    const next = built ? `${built} ${piece}` : piece;
    if (next.length <= max) built = next;
    else break;
  }

  if (built && /[.!?]$/.test(built)) return built;

  const source = built || t;
  let words = wordsFit(source, asSentence ? max - 1 : max);
  if (!words) words = source.slice(0, max).trim();
  if (asSentence && words && !/[.!?]$/.test(words) && words.length + 1 <= max) {
    words += ".";
  }
  return words;
}

function extractBenefit(description, maxLen) {
  const plain = normalizeSpace(description);
  if (!plain) return "";
  const first = (plain.match(/^[^.!?]+/) || [plain])[0].trim();
  if (first.length <= maxLen) return first.replace(/[,:;]+$/g, "");
  return wordsFit(first, maxLen);
}

function toneFamily(tone) {
  const t = String(tone || "");
  if (t.includes("Luxury")) return "luxury";
  if (t.includes("Urgent")) return "urgent";
  if (t.includes("Friendly")) return "friendly";
  return "converting";
}

export function generateSeoTitle({
  productTitle,
  keyword = "",
  keywords,
  tone = "High-Converting",
  variant = 0,
} = {}) {
  const name = normalizeSpace(productTitle) || "Shop This Product";
  const kws = keywordList(keyword, keywords);
  const kw = kws[Math.min(variant, Math.max(kws.length - 1, 0))] || kws[0] || "";
  const family = toneFamily(tone);

  const candidates = [];
  if (name.length <= TITLE_MAX) candidates.push(name);

  if (kw) {
    candidates.push(`${name} | ${kw}`);
    candidates.push(`${kw} | ${name}`);
    candidates.push(`${name} - ${kw}`);
  }

  if (family === "luxury") {
    candidates.push(`${name} | Luxury`);
    candidates.push(`Luxury ${name}`);
  } else if (family === "urgent") {
    candidates.push(`${name} | Shop Today`);
    candidates.push(`${name} | Limited Stock`);
  } else if (family === "friendly") {
    candidates.push(`${name} | Shop Now`);
    candidates.push(`Meet ${name}`);
  } else {
    candidates.push(`Shop ${name}`);
    candidates.push(`${name} | Buy Online`);
  }

  const fitting = candidates.filter((c) => c.length > 0 && c.length <= TITLE_MAX);
  if (fitting.length) {
    fitting.sort((a, b) => {
      const kwScore = (c) => (kw && c.toLowerCase().includes(kw.toLowerCase()) ? 30 : 0);
      return kwScore(b) + b.length - (kwScore(a) + a.length);
    });
    return fitting[variant % fitting.length];
  }

  if (kw) {
    const room = TITLE_MAX - kw.length - 3;
    if (room >= 12) {
      const shortened = wordsFit(name, room);
      if (shortened) return `${shortened} | ${kw}`.slice(0, TITLE_MAX);
    }
  }

  return wordsFit(name, TITLE_MAX);
}

export function generateSeoDescription({
  productTitle,
  productDescription = "",
  keyword = "",
  keywords,
  tone = "High-Converting",
  variant = 0,
} = {}) {
  const name = wordsFit(normalizeSpace(productTitle) || "this product", 55);
  const kws = keywordList(keyword, keywords);
  const kw = (kws[variant] || kws[0] || "").toLowerCase();
  const family = toneFamily(tone);
  const benefit = extractBenefit(productDescription, 95);

  const closings = {
    luxury: "Shop the collection today.",
    urgent: "Order now while stock lasts.",
    friendly: "Find yours in our shop today.",
    converting: "Shop online with fast shipping.",
  };
  const close = closings[family] || closings.converting;

  const candidates = [];

  if (variant === 0 && benefit) {
    candidates.push(`${benefit}. Shop ${name} today.`);
    if (kw) candidates.push(`${benefit}. Shop ${name} for ${kw}.`);
  } else if (variant === 1 && benefit) {
    candidates.push(`Shop ${name}. ${benefit}.`);
    candidates.push(`${name}: ${benefit}. ${close}`);
  } else if (benefit) {
    candidates.push(`${benefit}. ${close}`);
    if (kw) candidates.push(`Choose ${name} for ${kw}. ${benefit}.`);
  }

  if (family === "luxury") {
    candidates.push(
      `Discover ${name}${kw ? `, crafted for ${kw}` : ""}. Refined quality made for lasting style.`
    );
    candidates.push(`Shop ${name} for elegant materials, lasting quality, and refined everyday luxury.`);
  } else if (family === "urgent") {
    candidates.push(
      `Get ${name} today${kw ? ` — ${kw}` : ""}. Limited stock, fast shipping, and easy returns.`
    );
    candidates.push(`Order ${name} now. Fast shipping, easy returns, and a great price while supplies last.`);
  } else if (family === "friendly") {
    candidates.push(
      `Meet ${name}${kw ? `, made for ${kw}` : ""}. Honest quality, ready to ship to your door.`
    );
    candidates.push(`Find ${name} for everyday quality, fair value, and fast delivery.`);
  } else {
    candidates.push(
      `Shop ${name}${kw ? ` for ${kw}` : ""}. Quality you can trust, with fast shipping and easy returns.`
    );
    candidates.push(
      `Buy ${name} online. Built for lasting quality, shipped fast, and easy to return if it is not right.`
    );
  }

  const fitted = candidates
    .map((c) => fitComplete(c, DESC_MAX, { asSentence: true }))
    .filter((c) => c.length > 0 && c.length <= DESC_MAX && /[.!?]$/.test(c));

  if (fitted.length) {
    fitted.sort((a, b) => b.length - a.length);
    return fitted[0];
  }

  return fitComplete(`Shop ${name} today.`, DESC_MAX, { asSentence: true });
}

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
  "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's",
  "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself",
  "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she",
  "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than",
  "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
  "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't",
  "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's",
  "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom",
  "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll",
  "you're", "you've", "your", "yours", "yourself", "yourselves", "item", "product"
]);

/**
 * Intelligent AI Keyword Extractor
 * Derives 5-8 high-intent search keywords from product data
 */
export function extractKeywords({
  productTitle = "",
  productDescription = "",
  vendor = "",
  productType = "",
} = {}) {
  const cleanTitle = normalizeSpace(productTitle);
  const cleanDesc = normalizeSpace(productDescription);
  const keywordsSet = new Set();

  if (cleanTitle) {
    // 1. Exact product title (lowercased)
    keywordsSet.add(cleanTitle.toLowerCase());

    // 2. Meaningful words from title (filtering stop words)
    const titleWords = cleanTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    // 2-word bigrams from title
    for (let i = 0; i < titleWords.length - 1; i++) {
      keywordsSet.add(`${titleWords[i]} ${titleWords[i + 1]}`);
    }

    // 3-word trigrams from title if available
    if (titleWords.length >= 3) {
      keywordsSet.add(`${titleWords[0]} ${titleWords[1]} ${titleWords[2]}`);
    }

    // Individual significant product nouns/adjectives
    titleWords.forEach((w) => {
      if (w.length >= 4) keywordsSet.add(w);
    });
  }

  // 3. Product type and vendor associations
  if (productType && productType.length > 2) {
    keywordsSet.add(productType.toLowerCase());
    if (cleanTitle) {
      keywordsSet.add(`${cleanTitle.toLowerCase()} ${productType.toLowerCase()}`.slice(0, 40));
    }
  }

  if (vendor && vendor.length > 2 && !cleanTitle.toLowerCase().includes(vendor.toLowerCase())) {
    keywordsSet.add(`${vendor.toLowerCase()} ${cleanTitle.toLowerCase()}`.slice(0, 45));
  }

  // 4. Feature and benefit keywords from description
  if (cleanDesc) {
    const descWords = cleanDesc
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

    // Key phrases from description
    for (let i = 0; i < Math.min(descWords.length - 1, 8); i += 2) {
      const phrase = `${descWords[i]} ${descWords[i + 1]}`;
      if (phrase.length <= 25) {
        keywordsSet.add(phrase);
      }
    }
  }

  // Filter out single character, too long, or numeric-only phrases
  const filtered = Array.from(keywordsSet)
    .map((k) => k.trim())
    .filter((k) => k.length >= 3 && k.length <= 40 && !/^\d+$/.test(k));

  // Return top 5 to 8 unique high-intent keywords
  return filtered.slice(0, 8);
}

export function generateSeoCopy(options = {}) {
  let { keywords, keyword } = options;
  let parsedKeywords = keywordList(keyword, keywords);

  // Auto-extract keywords if none were provided
  if (parsedKeywords.length === 0 && options.productTitle) {
    parsedKeywords = extractKeywords(options);
  }

  return {
    title: generateSeoTitle({ ...options, keywords: parsedKeywords }),
    description: generateSeoDescription({ ...options, keywords: parsedKeywords }),
    keywords: parsedKeywords,
  };
}

export function generateSeoVariations(options = {}, count = 3) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < count + 2 && out.length < count; i += 1) {
    const copy = generateSeoCopy({ ...options, variant: i });
    const key = `${copy.title}::${copy.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(copy);
  }
  return out;
}

export function enforceSeoLimits({ title, description }) {
  return {
    title: fitComplete(title, TITLE_MAX),
    description: fitComplete(description, DESC_MAX, { asSentence: true }),
  };
}

