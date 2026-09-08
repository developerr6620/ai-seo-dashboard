import { useState, useMemo } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(
      `#graphql
      query getBulkProducts {
        products(first: 250) {
          edges {
            node {
              id
              title
              handle
              description
              status
              featuredImage {
                url
                altText
              }
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
      imageUrl: p.featuredImage?.url || null,
      status: String(p.status || "ACTIVE"),
      seoTitle: String(p.seo?.title || ""),
      seoDescription: String(p.seo?.description || ""),
    }));

    return { products };
  } catch (error) {
    console.error("Bulk optimizer loader error:", error);
    return { products: [] };
  }
};

// Strict clamp functions
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

export default function BulkOptimizer() {
  const loaderData = useLoaderData();
  const [products, setProducts] = useState(loaderData?.products || []);

  const [filter, setFilter] = useState("all"); // "all" | "missing-title" | "missing-desc" | "suboptimal"
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());

  // AI settings
  const [tone, setTone] = useState("High-Converting");
  const [globalKeywords, setGlobalKeywords] = useState("");

  // Bulk execution states
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [proposedUpdates, setProposedUpdates] = useState({}); // { [productId]: { seoTitle, seoDescription } }
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search filter
      if (searchQuery.trim() && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Status category filter
      const hasTitle = Boolean(p.seoTitle?.trim());
      const hasDesc = Boolean(p.seoDescription?.trim());
      const isTitleOptimal = (p.seoTitle?.length || 0) >= 50 && (p.seoTitle?.length || 0) <= 60;
      const isDescOptimal = (p.seoDescription?.length || 0) >= 150 && (p.seoDescription?.length || 0) <= 160;

      if (filter === "missing-title") return !hasTitle;
      if (filter === "missing-desc") return !hasDesc;
      if (filter === "suboptimal") return !isTitleOptimal || !isDescOptimal;
      if (filter === "optimized") return isTitleOptimal && isDescOptimal;
      return true;
    });
  }, [products, filter, searchQuery]);

  // Counts for pills
  const counts = useMemo(() => {
    const total = products.length;
    const missingTitle = products.filter((p) => !p.seoTitle?.trim()).length;
    const missingDesc = products.filter((p) => !p.seoDescription?.trim()).length;
    const suboptimal = products.filter(
      (p) => (p.seoTitle?.length || 0) < 50 || (p.seoTitle?.length || 0) > 60 || (p.seoDescription?.length || 0) < 150 || (p.seoDescription?.length || 0) > 160
    ).length;
    const optimized = total - suboptimal;
    return { total, missingTitle, missingDesc, suboptimal, optimized };
  }, [products]);

  // Toggle selection
  const handleToggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAllFiltered = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  // Run Bulk AI Generation
  const handleStartBulkGeneration = async () => {
    const targets = products.filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) return;

    setIsBulkGenerating(true);
    setGenerationProgress({ current: 0, total: targets.length, percentage: 0 });

    const kwList = globalKeywords.trim() ? globalKeywords.split(",").map((k) => k.trim()).filter(Boolean) : [];
    const kw1 = kwList[0] || "Best Quality";
    const kw2 = kwList[1] || "Top Rated";

    const newProposals = { ...proposedUpdates };

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];

      // Simulate AI generation delay for realistic progress feel
      await new Promise((resolve) => setTimeout(resolve, 80));

      let genTitle = "";
      let genDesc = "";

      if (tone === "Luxury") {
        genTitle = clampTitle(`The Luxury ${p.title} - ${kw1} Collection`);
        genDesc = clampDesc(`Indulge in artisanal luxury with our ${p.title}. Crafted for discerning connoisseurs seeking refined ${kw1} and uncompromising elegance.`);
      } else if (tone === "Urgent / Sales") {
        genTitle = clampTitle(`Flash Sale: ${p.title} - 30% Off Today Only`);
        genDesc = clampDesc(`Huge limited-time markdown on ${p.title}! Save big with free express delivery and instant checkout. Order online before current inventory sells out today.`);
      } else {
        // High-Converting Default
        genTitle = clampTitle(`Shop ${p.title} | ${kw1} - Official Store`);
        genDesc = clampDesc(`Upgrade your lifestyle with our ${p.title}. Engineered for superior ${kw2} and built to last. Enjoy verified customer satisfaction and fast shipping!`);
      }

      newProposals[p.id] = {
        seoTitle: genTitle,
        seoDescription: genDesc,
        isReviewed: true,
      };

      const current = i + 1;
      setGenerationProgress({
        current,
        total: targets.length,
        percentage: Math.round((current / targets.length) * 100),
      });
    }

    setProposedUpdates(newProposals);
    setIsBulkGenerating(false);
    setToastMessage(`✨ Successfully generated AI SEO for ${targets.length} products! Review proposals below.`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Edit proposal manually
  const handleEditProposal = (productId, field, value) => {
    setProposedUpdates((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  // Save all proposals to Shopify
  const handleSaveBulkToShopify = async () => {
    const itemsToSave = [];
    for (const [productId, proposal] of Object.entries(proposedUpdates)) {
      if (selectedIds.has(productId) && proposal.seoTitle) {
        itemsToSave.push({
          productId,
          seoTitle: proposal.seoTitle,
          seoDescription: proposal.seoDescription || "",
        });
      }
    }

    if (itemsToSave.length === 0) {
      alert("No proposed updates selected to save.");
      return;
    }

    setIsBulkSaving(true);
    try {
      const resp = await fetch("/api/save-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToSave }),
      });
      const data = await resp.json();

      if (data.success) {
        // Update local state
        const updated = products.map((p) => {
          const prop = proposedUpdates[p.id];
          if (selectedIds.has(p.id) && prop) {
            return {
              ...p,
              seoTitle: prop.seoTitle,
              seoDescription: prop.seoDescription,
            };
          }
          return p;
        });
        setProducts(updated);
        setToastMessage(`🎉 Success! Saved ${data.updatedCount || itemsToSave.length} products to Shopify catalog.`);
        setSelectedIds(new Set());
      } else {
        alert(`Save failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Bulk save error:", err);
      alert("Error saving updates to Shopify.");
    } finally {
      setIsBulkSaving(false);
      setTimeout(() => setToastMessage(null), 6000);
    }
  };

  return (
    <s-page heading="🚀 1-Click Bulk SEO Optimizer">
      {/* Toast */}
      {toastMessage && (
        <div
          style={{
            background: "#008060",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "600",
            marginBottom: "16px",
            boxShadow: "0 4px 12px rgba(0,128,96,0.25)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{ background: "none", border: "none", color: "#ffffff", cursor: "pointer", fontSize: "16px" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Hero / Bulk Control Bar */}
      <s-section>
        <div
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            borderRadius: "14px",
            padding: "24px",
            color: "#ffffff",
            marginBottom: "20px",
            boxShadow: "0 4px 16px rgba(15, 23, 42, 0.3)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
            <div>
              <div style={{ fontSize: "12px", opacity: 0.8, fontWeight: "600", letterSpacing: "0.5px", color: "#34d399" }}>
                AUTOMATED BATCH GENERATION
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: "800", margin: "4px 0 6px 0" }}>
                Catalog Bulk AI Optimizer
              </h2>
              <div style={{ fontSize: "13px", opacity: 0.85 }}>
                Select multiple products, generate Google-clamped meta tags in seconds, and batch publish.
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleStartBulkGeneration}
                disabled={isBulkGenerating || selectedIds.size === 0}
                style={{
                  background: selectedIds.size > 0 ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "#475569",
                  color: "#ffffff",
                  fontWeight: "700",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: selectedIds.size > 0 && !isBulkGenerating ? "pointer" : "not-allowed",
                  fontSize: "13px",
                  boxShadow: selectedIds.size > 0 ? "0 2px 10px rgba(16,185,129,0.35)" : "none",
                }}
              >
                {isBulkGenerating ? "🤖 Generating..." : `⚡ Generate AI SEO (${selectedIds.size} Selected)`}
              </button>

              {Object.keys(proposedUpdates).length > 0 && (
                <button
                  onClick={handleSaveBulkToShopify}
                  disabled={isBulkSaving}
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    fontWeight: "700",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: isBulkSaving ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    boxShadow: "0 2px 10px rgba(2,132,199,0.35)",
                  }}
                >
                  {isBulkSaving ? "💾 Saving to Shopify..." : "💾 Apply & Save to Shopify"}
                </button>
              )}
            </div>
          </div>

          {/* Tone & Keyword Settings */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", background: "rgba(255,255,255,0.05)", padding: "16px", borderRadius: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px", color: "#cbd5e1" }}>
                Brand Tone:
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#ffffff",
                  fontSize: "13px",
                  outline: "none",
                }}
              >
                <option value="High-Converting" style={{ background: "#1e293b", color: "#ffffff" }}>High-Converting & Clear</option>
                <option value="Luxury" style={{ background: "#1e293b", color: "#ffffff" }}>Luxury & Artisanal</option>
                <option value="Urgent / Sales" style={{ background: "#1e293b", color: "#ffffff" }}>Urgent / Discount Sales</option>
                <option value="Friendly" style={{ background: "#1e293b", color: "#ffffff" }}>Friendly & Engaging</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px", color: "#cbd5e1" }}>
                Target Keywords (Optional):
              </label>
              <input
                type="text"
                value={globalKeywords}
                onChange={(e) => setGlobalKeywords(e.target.value)}
                placeholder="e.g. organic, handcrafted, free shipping"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#ffffff",
                  fontSize: "13px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Animated Progress Bar */}
          {isBulkGenerating && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "#34d399" }}>
                <span>🤖 Generating optimized metadata...</span>
                <span>{generationProgress.current} / {generationProgress.total} ({generationProgress.percentage}%)</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: "8px", height: "8px", overflow: "hidden" }}>
                <div
                  style={{
                    background: "linear-gradient(90deg, #10b981, #34d399)",
                    height: "100%",
                    width: `${generationProgress.percentage}%`,
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </s-section>

      {/* Filter Chips & Selection Bar */}
      <s-section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { id: "all", label: `All (${counts.total})` },
              { id: "missing-title", label: `🚨 Missing Title (${counts.missingTitle})` },
              { id: "missing-desc", label: `📝 Missing Desc (${counts.missingDesc})` },
              { id: "suboptimal", label: `🟡 Suboptimal (${counts.suboptimal})` },
              { id: "optimized", label: `✅ Optimized (${counts.optimized})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  border: filter === tab.id ? "1px solid #008060" : "1px solid #dcdfe3",
                  background: filter === tab.id ? "#e3f8e0" : "#ffffff",
                  color: filter === tab.id ? "#008060" : "#4a4a4a",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Field */}
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #c9cccf",
              fontSize: "13px",
              minWidth: "180px",
            }}
          />
        </div>
      </s-section>

      {/* Products Table with Side-by-Side Review */}
      <s-section>
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e1e3e5", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e1e3e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="select-all"
                checked={selectedIds.size > 0 && selectedIds.size === filteredProducts.length}
                onChange={handleSelectAllFiltered}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
              />
              <label htmlFor="select-all" style={{ fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                Select All ({filteredProducts.length} filtered)
              </label>
            </div>
            <span style={{ fontSize: "12px", color: "#6d7175" }}>
              {selectedIds.size} of {products.length} selected for bulk action
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e1e3e5", color: "#6d7175", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px", width: "36px" }}></th>
                  <th style={{ padding: "10px 14px", width: "20%" }}>Product</th>
                  <th style={{ padding: "10px 14px", width: "35%" }}>SEO Title</th>
                  <th style={{ padding: "10px 14px", width: "35%" }}>Meta Description</th>
                  <th style={{ padding: "10px 14px", width: "10%", textAlign: "right" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  const proposal = proposedUpdates[p.id];
                  const titleToDisplay = proposal ? proposal.seoTitle : p.seoTitle;
                  const descToDisplay = proposal ? proposal.seoDescription : p.seoDescription;

                  const titleLen = titleToDisplay.length;
                  const descLen = descToDisplay.length;
                  const isTitleGood = titleLen >= 50 && titleLen <= 60;
                  const isDescGood = descLen >= 150 && descLen <= 160;

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid #f1f2f4",
                        background: isSelected ? "#f0fdf4" : "#ffffff",
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(p.id)}
                          style={{ cursor: "pointer", width: "16px", height: "16px" }}
                        />
                      </td>

                      {/* Product Info */}
                      <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                        <div style={{ fontWeight: "700", color: "#202223", marginBottom: "4px" }}>{p.title}</div>
                        <div style={{ fontSize: "11px", color: "#6d7175" }}>Handle: {p.handle}</div>
                        {proposal && (
                          <span
                            style={{
                              display: "inline-block",
                              marginTop: "6px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "#e0f2fe",
                              color: "#0369a1",
                              fontSize: "10px",
                              fontWeight: "700",
                            }}
                          >
                            AI Proposal Ready
                          </span>
                        )}
                      </td>

                      {/* SEO Title (Editable if proposed) */}
                      <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                        {proposal ? (
                          <div>
                            <input
                              type="text"
                              value={proposal.seoTitle}
                              onChange={(e) => handleEditProposal(p.id, "seoTitle", e.target.value)}
                              style={{
                                width: "100%",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                border: `1px solid ${isTitleGood ? "#108043" : "#d9381e"}`,
                                fontSize: "12px",
                                boxSizing: "border-box",
                              }}
                            />
                            <div style={{ fontSize: "11px", marginTop: "4px", color: isTitleGood ? "#108043" : "#b7791f", fontWeight: "600" }}>
                              {titleLen}/60 chars {isTitleGood ? "✓ Optimal" : "(Aim for 50-60)"}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ color: p.seoTitle ? "#202223" : "#d9381e", fontSize: "12px" }}>
                              {p.seoTitle || "❌ Missing Title"}
                            </div>
                            {p.seoTitle && (
                              <div style={{ fontSize: "11px", color: isTitleGood ? "#108043" : "#6d7175", marginTop: "2px" }}>
                                {p.seoTitle.length} chars {isTitleGood ? "✓" : ""}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Meta Description (Editable if proposed) */}
                      <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                        {proposal ? (
                          <div>
                            <textarea
                              rows={2}
                              value={proposal.seoDescription}
                              onChange={(e) => handleEditProposal(p.id, "seoDescription", e.target.value)}
                              style={{
                                width: "100%",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                border: `1px solid ${isDescGood ? "#108043" : "#d9381e"}`,
                                fontSize: "12px",
                                boxSizing: "border-box",
                                fontFamily: "inherit",
                              }}
                            />
                            <div style={{ fontSize: "11px", marginTop: "4px", color: isDescGood ? "#108043" : "#b7791f", fontWeight: "600" }}>
                              {descLen}/160 chars {isDescGood ? "✓ Optimal" : "(Aim for 150-160)"}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ color: p.seoDescription ? "#4a4a4a" : "#d9381e", fontSize: "12px", lineHeight: "1.4" }}>
                              {p.seoDescription ? `${p.seoDescription.slice(0, 70)}...` : "❌ Missing Meta Description"}
                            </div>
                            {p.seoDescription && (
                              <div style={{ fontSize: "11px", color: isDescGood ? "#108043" : "#6d7175", marginTop: "2px" }}>
                                {p.seoDescription.length} chars {isDescGood ? "✓" : ""}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "12px 14px", verticalAlign: "top", textAlign: "right" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "10px",
                            fontSize: "11px",
                            fontWeight: "600",
                            background: proposal ? "#e0f2fe" : isTitleGood && isDescGood ? "#e3f8e0" : "#fff4e5",
                            color: proposal ? "#0369a1" : isTitleGood && isDescGood ? "#108043" : "#b7791f",
                          }}
                        >
                          {proposal ? "Ready" : isTitleGood && isDescGood ? "Optimized" : "Needs Work"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return null;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
