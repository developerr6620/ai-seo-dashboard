import { useState, useMemo, useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(
      `#graphql
      query getProducts {
        products(first: 250) {
          edges {
            node {
              id
              title
              handle
              description
              status
              seo {
                title
                description
              }
            }
          }
        }
      }`
    );

    const data = await response.json();
    const rawProducts = data?.data?.products?.edges?.map((edge) => edge.node) || [];

    const products = rawProducts.map((p) => ({
      id: String(p.id || ""),
      title: String(p.title || "Untitled Product"),
      handle: String(p.handle || "product"),
      description: String(p.description || ""),
      status: String(p.status || "ACTIVE"),
      seoTitle: String(p.seo?.title || p.title || ""),
      seoDescription: String(p.seo?.description || p.description?.slice(0, 150) || ""),
    }));

    return { products };
  } catch (error) {
    console.error("Error loading products:", error);
    return { products: [] };
  }
};

// Strict clamp: Title must be 50-60 chars
const clampTitle = (raw) => {
  let text = raw.trim();
  if (text.length > 60) text = text.slice(0, 60).trim();
  const suffixes = [" | Official Store", " | Free Shipping", " - Buy Now", " - Best Deal", " - Shop Now", " Online"];
  for (const s of suffixes) {
    if (text.length < 50 && (text + s).length <= 60) text = text + s;
  }
  while (text.length < 50 && text.length + 11 <= 60) text += " - Shop Now";
  if (text.length > 60) text = text.slice(0, 60).trim();
  return text;
};

// Strict clamp: Meta Description must be 150-160 chars
const clampDesc = (raw) => {
  let text = raw.trim();
  if (text.length > 160) text = text.slice(0, 160).trim();
  const pads = [
    " Order online today for fast express delivery and 100% satisfaction.",
    " Explore great deals, verified reviews, and fast shipping.",
    " Premium quality with hassle-free returns and great support.",
    " Limited stock available - buy online now for the best price!",
    " Shop with confidence and enjoy quick delivery.",
  ];
  for (const p of pads) {
    if (text.length < 150 && (text + p).length <= 160) text = text + p;
  }
  while (text.length < 150) {
    const pad = " Shop now!";
    if ((text + pad).length <= 160) text += pad;
    else break;
  }
  if (text.length > 160) text = text.slice(0, 160).trim();
  return text;
};

export default function SeoOptimizer() {
  const loaderData = useLoaderData();
  const products = loaderData?.products || [];
  const shopify = useAppBridge();

  const [selectedProduct, setSelectedProduct] = useState(products[0] || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    return products.filter((p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const [keywords, setKeywords] = useState("");
  const [tone, setTone] = useState("High-Converting");
  const [targetAudience, setTargetAudience] = useState("General Shoppers");

  const [seoTitle, setSeoTitle] = useState(selectedProduct?.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(selectedProduct?.seoDescription || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiVariations, setAiVariations] = useState([]);
  const [feedbackMessage, setFeedbackMessage] = useState(null);

  const selectProduct = (prod) => {
    setSelectedProduct(prod);
    setSearchQuery(prod.title);
    setSeoTitle(prod.seoTitle);
    setSeoDescription(prod.seoDescription);
    setAiVariations([]);
    setIsDropdownOpen(false);
    setFeedbackMessage(null);
  };

  useEffect(() => {
    if (products.length > 0 && !selectedProduct) {
      selectProduct(products[0]);
    }
  }, [products]);

  const seoAnalysis = useMemo(() => {
    const titleLen = (seoTitle || "").length;
    const descLen = (seoDescription || "").length;
    const titleOk = titleLen >= 50 && titleLen <= 60;
    const descOk = descLen >= 150 && descLen <= 160;
    let score = 0;
    if (titleOk) score += 50;
    else if (titleLen >= 30 && titleLen <= 65) score += 25;
    if (descOk) score += 50;
    else if (descLen >= 120 && descLen <= 165) score += 25;
    return { score, titleOk, descOk, titleLen, descLen };
  }, [seoTitle, seoDescription]);

  const handleGenerateAI = () => {
    if (!selectedProduct) return;
    setIsGenerating(true);
    setTimeout(() => {
      const pTitle = selectedProduct.title;
      const kw = keywords ? keywords.split(",")[0].trim() : "Best Quality";

      let rawVariations = [];
      if (tone === "High-Converting") {
        rawVariations = [
          { rawT: `Buy ${pTitle} Online - Premium ${kw} | Free Shipping`, rawD: `Shop ${pTitle} today! Top rated ${kw.toLowerCase()} engineered for premium performance. Enjoy fast express delivery and 100% satisfaction guarantee.` },
          { rawT: `${pTitle} (${kw}) - Best Deals & Fast Delivery`, rawD: `Upgrade your collection with ${pTitle}. High quality ${kw.toLowerCase()} built to last. Limited stock available - order yours online now for best price!` },
          { rawT: `Official ${pTitle} - Top ${kw} Selection`, rawD: `Looking for top quality ${pTitle}? Discover premium craftsmanship, verified customer reviews, and exclusive deals on our store.` },
        ];
      } else if (tone === "Luxury & Authoritative") {
        rawVariations = [
          { rawT: `The Essential ${pTitle} | Exclusive ${kw}`, rawD: `Indulge in refined elegance with ${pTitle}. Masterfully crafted ${kw.toLowerCase()} for individuals seeking luxury, style, and durability.` },
          { rawT: `${pTitle} Signature Edition - ${kw}`, rawD: `Discover timeless quality with ${pTitle}. Designed with premium materials and precision engineering. Explore our store collection today.` },
        ];
      } else {
        rawVariations = [
          { rawT: `${pTitle} - Rated #1 ${kw} | Shop Now`, rawD: `Get the original ${pTitle}! Perfect for ${targetAudience.toLowerCase()}. High performance, reliable quality, backed by fast hassle-free returns.` },
          { rawT: `Best ${pTitle} Deals - ${kw} Guaranteed`, rawD: `See why customers recommend ${pTitle}. Great value, premium ${kw.toLowerCase()}, and 24/7 dedicated support. Order yours today!` },
        ];
      }

      const strictVariations = rawVariations.map((item) => ({
        title: clampTitle(item.rawT),
        desc: clampDesc(item.rawD),
      }));

      setAiVariations(strictVariations);
      setSeoTitle(strictVariations[0].title);
      setSeoDescription(strictVariations[0].desc);
      setIsGenerating(false);
      if (shopify?.toast) shopify.toast.show("✨ Generated Strict SEO Content!");
    }, 300);
  };

  const handleSaveSeo = async () => {
    if (!selectedProduct || !seoTitle) return;
    setIsSaving(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch("/api/save-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProduct.id, seoTitle, seoDescription }),
      });
      const data = await res.json();
      setIsSaving(false);
      if (data.success) {
        setFeedbackMessage({ type: "success", text: `🎉 SEO Saved! Title (${seoTitle.length} chars) & Meta (${seoDescription.length} chars) published to Shopify.` });
        if (shopify?.toast) shopify.toast.show("✅ Saved SEO to Shopify catalog!");
        selectedProduct.seoTitle = seoTitle;
        selectedProduct.seoDescription = seoDescription;
      } else {
        setFeedbackMessage({ type: "error", text: `❌ Error: ${data.error || "Failed to update product"}` });
      }
    } catch (err) {
      setIsSaving(false);
      setFeedbackMessage({ type: "error", text: `❌ Error: ${err.message}` });
    }
  };

  return (
    <s-page heading="⚡ AI SEO Optimizer">
      <s-section heading="Product Catalog SEO Optimizer">
        <s-paragraph>
          Search your store catalog, generate strict 50–60 char titles & 150–160 char meta descriptions, and publish directly to Shopify.
        </s-paragraph>

        {products.length === 0 ? (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text font-weight="bold">No products found in store catalog.</s-text>
          </s-box>
        ) : (
          <s-stack direction="block" gap="large">
            {/* Step 1 */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text font-weight="bold" font-size="medium">🔍 1. Search & Select Product ({products.length} Available)</s-text>
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    type="text"
                    placeholder="Type to search all products in store..."
                    value={searchQuery}
                    onFocus={() => setIsDropdownOpen(true)}
                    onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                    style={{ width: "100%", padding: "12px 16px", borderRadius: "8px", border: "1.5px solid #008060", fontSize: "15px", fontWeight: "500", outline: "none", backgroundColor: "#ffffff" }}
                  />
                  {isDropdownOpen && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, maxHeight: "260px", overflowY: "auto", backgroundColor: "#ffffff", border: "1px solid #c9cccf", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 999, marginTop: "4px" }}>
                      {filteredProducts.length === 0 ? (
                        <div style={{ padding: "12px 16px", color: "#616161", fontSize: "14px" }}>No matching products found.</div>
                      ) : (
                        filteredProducts.map((p) => (
                          <div key={p.id} onClick={() => selectProduct(p)} style={{ padding: "12px 16px", borderBottom: "1px solid #f1f2f3", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: selectedProduct?.id === p.id ? "#f4f6f8" : "#ffffff" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f4f6f8")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = selectedProduct?.id === p.id ? "#f4f6f8" : "#ffffff")}
                          >
                            <span style={{ fontWeight: "600", fontSize: "14px", color: "#202223" }}>{p.title}</span>
                            <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "10px", background: p.status === "ACTIVE" ? "#e3f8e0" : "#f1f2f3", color: p.status === "ACTIVE" ? "#108043" : "#616161" }}>{p.status}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </s-stack>
            </s-box>

            {/* Step 2 */}
            {selectedProduct && (
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-text font-weight="bold" font-size="medium">🤖 2. AI Generator Controls</s-text>
                  <s-stack direction="inline" gap="base">
                    <div style={{ flex: 1 }}>
                      <s-text font-weight="bold">Tone of Voice</s-text>
                      <select style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "14px", width: "100%", marginTop: "4px" }} value={tone} onChange={(e) => setTone(e.target.value)}>
                        <option value="High-Converting">High-Converting & Sales</option>
                        <option value="Luxury & Authoritative">Luxury & Premium</option>
                        <option value="Friendly & Engaging">Friendly & Engaging</option>
                        <option value="Urgent & Promotional">Urgent & Promotional</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <s-text font-weight="bold">Target Audience</s-text>
                      <select style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "14px", width: "100%", marginTop: "4px" }} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}>
                        <option value="General Shoppers">General Shoppers</option>
                        <option value="Bargain Hunters">Bargain Hunters</option>
                        <option value="Luxury Buyers">Luxury Buyers</option>
                        <option value="Gifting & Holidays">Gifting & Holidays</option>
                      </select>
                    </div>
                  </s-stack>
                  <s-text-field label="Focus Keywords" value={keywords} onChange={(e) => setKeywords(e.currentTarget.value)} details="Example: eco-friendly, premium quality, top rated"></s-text-field>
                  <s-button onClick={handleGenerateAI} {...(isGenerating ? { loading: true } : {})}>✨ Generate Strict (50-60 Title / 150-160 Meta) AI Content</s-button>
                </s-stack>
              </s-box>
            )}

            {/* Variations */}
            {aiVariations.length > 0 && (
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="base">
                  <s-text font-weight="bold">🎯 Select an AI Variation to Apply:</s-text>
                  {aiVariations.map((v, i) => (
                    <div key={i} onClick={() => { setSeoTitle(v.title); setSeoDescription(v.desc); }} style={{ padding: "14px", borderRadius: "8px", border: "1.5px solid #008060", background: "#ffffff", cursor: "pointer", marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: "bold", color: "#008060", fontSize: "14px" }}>Option {i + 1}: {v.title}</span>
                        <span style={{ fontSize: "12px", background: "#e3f8e0", color: "#108043", padding: "2px 8px", borderRadius: "10px", fontWeight: "bold" }}>{v.title.length} chars</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#4a4a4a", marginTop: "6px" }}>{v.desc}</div>
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#108043", fontWeight: "bold" }}>Meta: {v.desc.length} chars ✓</div>
                    </div>
                  ))}
                </s-stack>
              </s-box>
            )}

            {/* Step 3: Preview & Save */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" align="space-between" align-items="center">
                  <s-text font-weight="bold" font-size="medium">🔍 3. Live Google Snippet & SEO Health Check</s-text>
                  <div style={{ background: seoAnalysis.score === 100 ? "#e3f8e0" : "#fff4e5", color: seoAnalysis.score === 100 ? "#108043" : "#b7791f", padding: "6px 14px", borderRadius: "16px", fontWeight: "bold", fontSize: "14px" }}>
                    SEO Score: {seoAnalysis.score} / 100
                  </div>
                </s-stack>

                {feedbackMessage && (
                  <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: feedbackMessage.type === "success" ? "#e3f8e0" : "#fbeae5", color: feedbackMessage.type === "success" ? "#108043" : "#d9381e", fontWeight: "600", fontSize: "14px" }}>
                    {feedbackMessage.text}
                  </div>
                )}

                <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #d3d5d7", fontFamily: "Arial, sans-serif", boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                  <div style={{ color: "#1a0dab", fontSize: "20px", lineHeight: "1.3", fontWeight: "400", marginBottom: "4px", wordBreak: "break-word" }}>{seoTitle || selectedProduct?.title}</div>
                  <div style={{ color: "#202124", fontSize: "14px", lineHeight: "1.6", marginBottom: "4px" }}>https://your-store.myshopify.com/products/{selectedProduct?.handle || "product"}</div>
                  <div style={{ color: "#4d5156", fontSize: "14px", lineHeight: "1.5", wordBreak: "break-word" }}>{seoDescription || "No meta description set yet."}</div>
                </div>

                <s-stack direction="block" gap="base">
                  <div>
                    <s-text-field label={`SEO Title (${seoAnalysis.titleLen} / 60 chars — Strict: 50–60)`} value={seoTitle} onChange={(e) => setSeoTitle(e.currentTarget.value)}></s-text-field>
                    <div style={{ fontSize: "12px", marginTop: "2px", fontWeight: "600", color: seoAnalysis.titleOk ? "#108043" : "#d9381e" }}>
                      {seoAnalysis.titleOk ? `✓ PERFECT: ${seoAnalysis.titleLen} chars (50-60 range)` : `⚠️ NEEDS FIX: ${seoAnalysis.titleLen} chars (must be 50-60)`}
                    </div>
                  </div>
                  <div>
                    <s-text-field label={`Meta Description (${seoAnalysis.descLen} / 160 chars — Strict: 150–160)`} value={seoDescription} onChange={(e) => setSeoDescription(e.currentTarget.value)}></s-text-field>
                    <div style={{ fontSize: "12px", marginTop: "2px", fontWeight: "600", color: seoAnalysis.descOk ? "#108043" : "#d9381e" }}>
                      {seoAnalysis.descOk ? `✓ PERFECT: ${seoAnalysis.descLen} chars (150-160 range)` : `⚠️ NEEDS FIX: ${seoAnalysis.descLen} chars (must be 150-160)`}
                    </div>
                  </div>
                  <s-button variant="primary" onClick={handleSaveSeo} {...(isSaving ? { loading: true } : {})}>
                    💾 Save SEO Changes to Shopify Store
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
