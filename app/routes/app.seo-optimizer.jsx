/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureKeywordsMetafieldDefinition } from "../lib/metafieldDefinitions.server";
import {
  DESC_MAX,
  TITLE_MAX,
  generateSeoCopy,
  extractKeywords,
  isDescOk,
  isTitleOk,
} from "../lib/seoCopy";

function parseMetafieldKeywords(rawVal) {
  if (!rawVal) return [];
  try {
    const parsed = JSON.parse(rawVal);
    if (Array.isArray(parsed)) return parsed.map((k) => String(k).trim()).filter(Boolean);
    if (typeof parsed === "string") return parsed.split(",").map((k) => k.trim()).filter(Boolean);
  } catch (e) {
    return String(rawVal).split(",").map((k) => k.trim()).filter(Boolean);
  }
  return [];
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  // Guarantee that the Target SEO Keywords definition is registered & pinned in Shopify
  await ensureKeywordsMetafieldDefinition(admin, shop);

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
              keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                value
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
      seoDescription: String(p.seo?.description || ""),
      keywords: parseMetafieldKeywords(p.keywordsMetafield?.value),
    }));

    return { products, hasMore: rawProducts.length === 250 };
  } catch (error) {
    console.error("Error loading products:", error);
    return { products: [], hasMore: false };
  }
};

export default function SeoOptimizer() {
  const loaderData = useLoaderData();
  const navigation = useNavigation();
  const products = useMemo(() => loaderData?.products || [], [loaderData?.products]);
  const hasMore = loaderData?.hasMore || false;
  const shopify = useAppBridge();
  const isPageLoading = navigation.state === "loading";

  const [selectedProduct, setSelectedProduct] = useState(products[0] || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [allProducts, setAllProducts] = useState(products);

  useEffect(() => {
    setAllProducts(products);
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return allProducts;
    return allProducts.filter((p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allProducts, searchQuery]);

  const [keywordsList, setKeywordsList] = useState(selectedProduct?.keywords || []);
  const [newKeywordInput, setNewKeywordInput] = useState("");
  const [tone, setTone] = useState("High-Converting");

  const [seoTitle, setSeoTitle] = useState(selectedProduct?.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(selectedProduct?.seoDescription || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState(null);

  const selectProduct = (prod) => {
    setSelectedProduct(prod);
    setSearchQuery(prod.title);
    setSeoTitle(prod.seoTitle);
    setSeoDescription(prod.seoDescription);

    // Automatically generate keywords if product has none or fewer than 3 keywords
    let initialKeywords = prod.keywords || [];
    if (initialKeywords.length < 3 && prod.title) {
      const autoExtracted = extractKeywords({
        productTitle: prod.title,
        productDescription: prod.description,
      });
      initialKeywords = Array.from(new Set([...initialKeywords, ...autoExtracted])).slice(0, 8);
    }
    setKeywordsList(initialKeywords);
    setIsDropdownOpen(false);
    setFeedbackMessage(null);
  };

  useEffect(() => {
    if (products.length > 0 && !selectedProduct) {
      selectProduct(products[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const seoAnalysis = useMemo(() => {
    const titleLen = (seoTitle || "").length;
    const descLen = (seoDescription || "").length;
    const titleOk = isTitleOk(seoTitle);
    const descOk = isDescOk(seoDescription);
    const hasKw = keywordsList.length > 0;

    let score = 0;
    if (titleOk) score += 40;
    else if (titleLen > 0 && titleLen <= TITLE_MAX + 10) score += 20;

    if (descOk) score += 40;
    else if (descLen > 0 && descLen <= DESC_MAX + 20) score += 20;

    if (hasKw) score += 20;

    return { score, titleOk, descOk, titleLen, descLen, hasKw };
  }, [seoTitle, seoDescription, keywordsList]);

  // Handle adding a keyword tag
  const handleAddKeyword = useCallback(() => {
    const trimmed = newKeywordInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!keywordsList.includes(trimmed)) {
      setKeywordsList((prev) => [...prev, trimmed]);
    }
    setNewKeywordInput("");
  }, [newKeywordInput, keywordsList]);

  // Handle removing a keyword tag
  const handleRemoveKeyword = useCallback((kwToRemove) => {
    setKeywordsList((prev) => prev.filter((k) => k !== kwToRemove));
  }, []);

  // Handle AI Keyword Extraction
  const handleAutoExtractKeywords = useCallback(() => {
    if (!selectedProduct) return;
    const extracted = extractKeywords({
      productTitle: selectedProduct.title,
      productDescription: selectedProduct.description,
    });
    setKeywordsList(extracted);
    if (shopify?.toast) shopify.toast.show(`✨ Auto-extracted ${extracted.length} keywords!`);
  }, [selectedProduct, shopify]);

  const handleGenerateAI = () => {
    if (!selectedProduct) return;
    setIsGenerating(true);

    setTimeout(() => {
      // Auto-generate fresh high-converting keywords from product data
      const generatedKeywords = extractKeywords({
        productTitle: selectedProduct.title,
        productDescription: selectedProduct.description,
      });
      setKeywordsList(generatedKeywords);

      const generated = generateSeoCopy({
        productTitle: selectedProduct.title,
        productDescription: selectedProduct.description,
        keywords: generatedKeywords,
        tone,
      });

      setSeoTitle(generated.title);
      setSeoDescription(generated.description);
      setIsGenerating(false);
      setFeedbackMessage({
        type: "info",
        text: `✨ Generated SEO Title, Meta Description, and ${generatedKeywords.length} Target Keywords! Review below, then click 'Save SEO & Keywords to Shopify Store'.`,
      });
      if (shopify?.toast) shopify.toast.show(`✨ Generated SEO & ${generatedKeywords.length} Target Keywords!`);
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
        body: JSON.stringify({
          productId: selectedProduct.id,
          seoTitle,
          seoDescription,
          keywords: keywordsList,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Update local product cache
        selectedProduct.seoTitle = seoTitle;
        selectedProduct.seoDescription = seoDescription;
        selectedProduct.keywords = keywordsList;

        setFeedbackMessage({
          type: "success",
          text: `✅ Saved successfully! Title, description, and ${keywordsList.length} keywords updated in Shopify.`,
        });
        if (shopify?.toast) shopify.toast.show("✅ Saved SEO & Keywords to Shopify!");
      } else {
        setFeedbackMessage({
          type: "error",
          text: `❌ Error: ${data.error || "Failed to update Shopify"}`,
        });
      }
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: `❌ Network error: ${err.message || "Failed to contact API"}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <s-page heading="⚡ Single Product SEO & Keywords Optimizer">
      <s-layout>
        <s-layout-section>
          <s-stack direction="block" gap="large">

            {/* Step 1: Select Product */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text font-weight="bold" font-size="medium">📦 1. Search & Select Product</s-text>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search product by title..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "#ffffff",
                    }}
                  />
                  {isDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: "#ffffff",
                        border: "1px solid #c9cccf",
                        borderRadius: "0 0 6px 6px",
                        maxHeight: "220px",
                        overflowY: "auto",
                        zIndex: 1000,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    >
                      {filteredProducts.length > 0 ? (
                        filteredProducts.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => selectProduct(p)}
                            style={{
                              padding: "10px 14px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f1f2f3",
                              backgroundColor: selectedProduct?.id === p.id ? "#f6f6f7" : "transparent",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: selectedProduct?.id === p.id ? "bold" : "normal", fontSize: "14px", color: "#202223" }}>{p.title}</div>
                              <div style={{ fontSize: "12px", color: "#6d7175" }}>Status: {p.status}</div>
                            </div>
                            {p.keywords && p.keywords.length > 0 && (
                              <span style={{ fontSize: "11px", background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: "10px" }}>
                                {p.keywords.length} kws
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "12px 14px", color: "#6d7175", fontSize: "14px" }}>No matching products</div>
                      )}
                    </div>
                  )}
                </div>
                {hasMore && (
                  <div style={{ fontSize: "12px", color: "#6d7175" }}>
                    ℹ️ Searching within first 250 products. Type in search box to filter.
                  </div>
                )}
              </s-stack>
            </s-box>

            {/* Step 2: AI Generator & Keywords Controls */}
            {selectedProduct && (
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-text font-weight="bold" font-size="medium">🤖 2. Target Keywords & AI Generator Controls</s-text>

                  {/* Target Keywords Tags Manager */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <s-text font-weight="bold">Target Search Keywords ({keywordsList.length})</s-text>
                      <button
                        type="button"
                        onClick={handleAutoExtractKeywords}
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #86efac",
                          color: "#166534",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                        }}
                      >
                        🤖 Auto-Suggest Keywords
                      </button>
                    </div>

                    {/* Keywords Tag Badges */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                        minHeight: "36px",
                        padding: "8px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        marginBottom: "8px",
                        alignItems: "center",
                      }}
                    >
                      {keywordsList.length > 0 ? (
                        keywordsList.map((kw) => (
                          <span
                            key={kw}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              background: "#e0f2fe",
                              color: "#0369a1",
                              fontSize: "12px",
                              fontWeight: "600",
                              padding: "4px 10px",
                              borderRadius: "14px",
                              border: "1px solid #bae6fd",
                            }}
                          >
                            <span>🏷️ {kw}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyword(kw)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "#0369a1",
                                fontWeight: "bold",
                                fontSize: "13px",
                                padding: 0,
                                lineHeight: 1,
                              }}
                            >
                              &times;
                            </button>
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                          No target keywords set yet. Click &apos;Auto-Suggest Keywords&apos; or type below and press Enter.
                        </span>
                      )}
                    </div>

                    {/* Add Keyword Input */}
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="Add a target keyword (e.g. running shoes, lightweight)..."
                        value={newKeywordInput}
                        onChange={(e) => setNewKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddKeyword();
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "13px",
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddKeyword}
                        style={{
                          background: "#0f172a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "8px 16px",
                          fontSize: "13px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Add Keyword
                      </button>
                    </div>
                  </div>

                  {/* Tone of Voice */}
                  <div>
                    <s-text font-weight="bold">Tone of Voice</s-text>
                    <select
                      style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #c9cccf",
                        fontSize: "14px",
                        width: "100%",
                        marginTop: "4px",
                        backgroundColor: "#ffffff",
                      }}
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                    >
                      <option value="High-Converting">High-Converting & Sales</option>
                      <option value="Luxury & Authoritative">Luxury & Premium</option>
                      <option value="Friendly & Engaging">Friendly & Engaging</option>
                      <option value="Urgent & Promotional">Urgent & Promotional</option>
                    </select>
                  </div>

                  <s-button
                    onClick={handleGenerateAI}
                    disabled={isGenerating}
                    {...(isGenerating ? { loading: true } : {})}
                  >
                    {isGenerating ? "✨ Generating AI SEO & Keywords..." : `✨ Generate AI SEO & Keywords (Title ≤ ${TITLE_MAX} / Description ≤ ${DESC_MAX})`}
                  </s-button>
                </s-stack>
              </s-box>
            )}

            {/* Step 3: Preview & Save */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" align="space-between" align-items="center">
                  <s-text font-weight="bold" font-size="medium">🔍 3. Live Google Snippet & SEO Health Check</s-text>
                  <div style={{ background: seoAnalysis.score >= 80 ? "#e3f8e0" : "#fff4e5", color: seoAnalysis.score >= 80 ? "#108043" : "#b7791f", padding: "6px 14px", borderRadius: "16px", fontWeight: "bold", fontSize: "14px" }}>
                    SEO Score: {seoAnalysis.score} / 100
                  </div>
                </s-stack>

                {feedbackMessage && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "8px",
                      backgroundColor:
                        feedbackMessage.type === "success"
                          ? "#e3f8e0"
                          : feedbackMessage.type === "info"
                          ? "#e7f4fe"
                          : "#fbeae5",
                      color:
                        feedbackMessage.type === "success"
                          ? "#108043"
                          : feedbackMessage.type === "info"
                          ? "#0c5460"
                          : "#d9381e",
                      border:
                        feedbackMessage.type === "info"
                          ? "1px solid #bee5eb"
                          : "none",
                      fontWeight: "600",
                      fontSize: "14px",
                    }}
                  >
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
                    <s-text-field label={`SEO Title (${seoAnalysis.titleLen} / ${TITLE_MAX} chars max)`} value={seoTitle} onChange={(e) => setSeoTitle(e.currentTarget.value)}></s-text-field>
                    <div style={{ fontSize: "12px", marginTop: "2px", fontWeight: "600", color: seoAnalysis.titleOk ? "#108043" : "#d9381e" }}>
                      {seoAnalysis.titleOk ? `✓ Within limit: ${seoAnalysis.titleLen} chars (max ${TITLE_MAX})` : `⚠️ Over limit: ${seoAnalysis.titleLen} chars (must be ${TITLE_MAX} or less)`}
                    </div>
                  </div>
                  <div>
                    <s-text-field label={`Meta Description (${seoAnalysis.descLen} / ${DESC_MAX} chars max)`} value={seoDescription} onChange={(e) => setSeoDescription(e.currentTarget.value)}></s-text-field>
                    <div style={{ fontSize: "12px", marginTop: "2px", fontWeight: "600", color: seoAnalysis.descOk ? "#108043" : "#d9381e" }}>
                      {seoAnalysis.descOk ? `✓ Within limit: ${seoAnalysis.descLen} chars (max ${DESC_MAX})` : `⚠️ Over limit: ${seoAnalysis.descLen} chars (must be ${DESC_MAX} or less)`}
                    </div>
                  </div>

                  {/* Keywords summary line */}
                  <div style={{ fontSize: "12px", color: seoAnalysis.hasKw ? "#108043" : "#b7791f", fontWeight: "600" }}>
                    {seoAnalysis.hasKw
                      ? `✓ ${keywordsList.length} Target Keywords attached (will save as Shopify Metafield)`
                      : "⚠️ No target keywords specified (optional, but recommended for better ranking)"}
                  </div>
                </s-stack>

                <s-button
                  onClick={handleSaveSeo}
                  disabled={isSaving || !seoTitle}
                  {...(isSaving ? { loading: true } : {})}
                >
                  {isSaving ? "Saving to Shopify..." : "💾 Save SEO & Keywords to Shopify Store"}
                </s-button>
              </s-stack>
            </s-box>

          </s-stack>
        </s-layout-section>
      </s-layout>

      {/* Loading Overlay */}
      {isPageLoading && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(255, 255, 255, 0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: "bold" }}>Loading...</div>
        </div>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
