/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useMemo, useEffect } from "react";
import { useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  DESC_MAX,
  TITLE_MAX,
  generateSeoCopy,
  isDescOk,
  isTitleOk,
} from "../lib/seoCopy";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Only fetch first 250 products for initial load - much faster
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
      seoDescription: String(p.seo?.description || ""),
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

  const [keywords, setKeywords] = useState("");
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
    setIsDropdownOpen(false);
    setFeedbackMessage(null);
  };

  useEffect(() => {
    if (products.length > 0 && !selectedProduct) {
      selectProduct(products[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Note: In a future enhancement, you could implement lazy loading for search
  // For now, we search within the first 250 products

  const seoAnalysis = useMemo(() => {
    const titleLen = (seoTitle || "").length;
    const descLen = (seoDescription || "").length;
    const titleOk = isTitleOk(seoTitle);
    const descOk = isDescOk(seoDescription);
    let score = 0;
    if (titleOk) score += 50;
    else if (titleLen > 0 && titleLen <= TITLE_MAX + 10) score += 25;
    if (descOk) score += 50;
    else if (descLen > 0 && descLen <= DESC_MAX + 20) score += 25;
    return { score, titleOk, descOk, titleLen, descLen };
  }, [seoTitle, seoDescription]);

  const handleGenerateAI = () => {
    if (!selectedProduct) return;
    setIsGenerating(true);
    setTimeout(() => {
      const generated = generateSeoCopy({
        productTitle: selectedProduct.title,
        productDescription: selectedProduct.description,
        keywords,
        tone,
      });

      setSeoTitle(generated.title);
      setSeoDescription(generated.description);
      setIsGenerating(false);
      setFeedbackMessage({
        type: "info",
        text: "✨ Generated 1 best SEO recommendation! Review or tweak it below, then click 'Save SEO Changes to Shopify Store' to save.",
      });
      if (shopify?.toast) shopify.toast.show("✨ Generated best SEO content!");
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
      if (data.success) {
        setIsSaving(false);
        setFeedbackMessage({
          type: "success",
          text: `🎉 SEO Saved! Title (${seoTitle.length} chars) & Meta (${seoDescription.length} chars) published to Shopify.`,
        });
        if (shopify?.toast) shopify.toast.show("✅ Saved SEO to Shopify catalog!");
        // Update local product state so it reflects the newly published SEO data immediately without page reload
        setSelectedProduct((prev) =>
          prev ? { ...prev, seoTitle, seoDescription } : prev
        );
        setAllProducts((prev) =>
          prev.map((p) =>
            p.id === selectedProduct.id
              ? { ...p, seoTitle, seoDescription }
              : p
          )
        );
      } else {
        setIsSaving(false);
        setFeedbackMessage({ type: "error", text: `❌ Error: ${data.error || "Failed to update product"}` });
      }
    } catch (err) {
      setIsSaving(false);
      setFeedbackMessage({ type: "error", text: `❌ Error: ${err.message}` });
    }
  };

  return (
    <s-page heading="AI SEO Optimizer">
      <s-section heading="Product Catalog SEO Optimizer">
        <s-paragraph>
          Search your store catalog, generate titles under {TITLE_MAX} characters and complete meta descriptions under {DESC_MAX} characters, then publish directly to Shopify.
        </s-paragraph>

        {hasMore && (
          <s-box padding="base" background="subdued" borderRadius="base" style={{ marginBottom: "16px" }}>
            <s-text font-size="small" color="subdued">
              ℹ️ Showing first 250 products. For catalogs with 250+ products, use the Bulk Optimizer for batch processing.
            </s-text>
          </s-box>
        )}

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
                    placeholder={`Type to search through ${products.length} products...`}
                    value={searchQuery}
                    onFocus={() => setIsDropdownOpen(true)}
                    onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", borderRadius: "8px", border: "1.5px solid #008060", fontSize: "15px", fontWeight: "500", outline: "none", backgroundColor: "#ffffff" }}
                  />
                  {isDropdownOpen && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, maxHeight: "260px", overflowY: "auto", backgroundColor: "#ffffff", border: "1px solid #c9cccf", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 999, marginTop: "4px" }}>
                      {filteredProducts.length === 0 ? (
                        <div style={{ padding: "12px 16px", color: "#616161", fontSize: "14px" }}>
                          {hasMore && searchQuery.trim().length > 0
                            ? "No matches in first 250 products. Try Bulk Optimizer for full catalog search."
                            : "No matching products found."
                          }
                        </div>
                      ) : (
                        filteredProducts.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => selectProduct(p)}
                            style={{ padding: "12px 16px", borderBottom: "1px solid #f1f2f3", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: selectedProduct?.id === p.id ? "#f4f6f8" : "#ffffff", width: "100%", textAlign: "left", border: "none" }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f4f6f8"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedProduct?.id === p.id ? "#f4f6f8" : "#ffffff"}
                          >
                            <span style={{ fontWeight: "600", fontSize: "14px", color: "#202223" }}>{p.title}</span>
                            <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "10px", background: p.status === "ACTIVE" ? "#e3f8e0" : "#f1f2f3", color: p.status === "ACTIVE" ? "#108043" : "#616161" }}>{p.status}</span>
                          </button>
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
                  <s-text-field
                    label="Focus Keywords (Optional)"
                    value={keywords}
                    onChange={(e) => setKeywords(e.currentTarget.value)}
                    details="Example: eco-friendly, premium quality, top rated"
                  />
                  <s-button
                    onClick={handleGenerateAI}
                    disabled={isGenerating}
                    {...(isGenerating ? { loading: true } : {})}
                  >
                    {isGenerating ? "✨ Generating AI SEO..." : `✨ Generate SEO (title ≤ ${TITLE_MAX} / description ≤ ${DESC_MAX})`}
                  </s-button>
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
                  <s-button
                    variant="primary"
                    onClick={handleSaveSeo}
                    disabled={isSaving}
                    {...(isSaving ? { loading: true } : {})}
                  >
                    {isSaving ? "💾 Saving to Shopify..." : "💾 Save SEO Changes to Shopify Store"}
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
          </s-stack>
        )}
      </s-section>

      {/* Page Loading Overlay */}
      {isPageLoading && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(255, 255, 255, 0.9)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "4px solid #f3f3f3",
              borderTop: "4px solid #008060",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "16px",
            }}
          />
          <div style={{ fontSize: "16px", fontWeight: "600", color: "#202223" }}>
            Loading...
          </div>
          <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "4px" }}>
            Please wait while we fetch your data
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
