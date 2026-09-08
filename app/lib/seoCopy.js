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

export function generateSeoCopy(options = {}) {
  return {
    title: generateSeoTitle(options),
    description: generateSeoDescription(options),
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
