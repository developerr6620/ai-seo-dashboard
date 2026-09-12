/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useMemo, useCallback } from "react";
import { useLoaderData, useNavigation, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  ALT_MAX,
  ALT_WARN,
  ALT_PRESETS,
  isAltOk,
  generateImageAltText,
  getImageViewLabel,
} from "../lib/imageAltCopy";

function parseKeywords(rawVal) {
  if (!rawVal) return [];
  if (Array.isArray(rawVal)) return rawVal.map((k) => String(k).trim()).filter(Boolean);
  const str = String(rawVal).trim();
  if (!str || str === "[]" || str === '""') return [];
  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed.map((k) => String(k).trim()).filter(Boolean);
    } catch {
      // ignore JSON parse error
    }
  }
  return str.split(/[,\n\r]+/).map((k) => k.trim()).filter(Boolean);
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopName = session?.shop || "";

  try {
    const response = await admin.graphql(
      `#graphql
      query getProductsWithMedia {
        shop {
          name
          myshopifyDomain
        }
        products(first: 100) {
          edges {
            cursor
            node {
              id
              title
              handle
              status
              vendor
              keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                value
              }
              media(first: 20) {
                nodes {
                  id
                  alt
                  mediaContentType
                  status
                  preview {
                    image {
                      url
                      width
                      height
                    }
                  }
                  ... on MediaImage {
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }`
    );

    const data = await response.json();
    const shop = data?.data?.shop || { name: shopName || "Your Store" };
    const rawProducts = data?.data?.products?.edges?.map((e) => e.node) || [];

    const products = rawProducts.map((p) => {
      const mediaNodes = (p.media?.nodes || [])
        .filter((m) => m.mediaContentType === "IMAGE" || !m.mediaContentType)
        .map((m) => ({
          id: m.id,
          alt: m.alt || "",
          url: m.preview?.image?.url || m.image?.url || "",
          width: m.preview?.image?.width || null,
          height: m.preview?.image?.height || null,
        }))
        .filter((m) => Boolean(m.url));

      return {
        id: p.id,
        title: p.title || "Untitled Product",
        handle: p.handle || "",
        status: p.status || "ACTIVE",
        vendor: p.vendor || shop.name || "",
        keywords: parseKeywords(p.keywordsMetafield?.value),
        media: mediaNodes,
      };
    });

    return {
      shop,
      products,
    };
  } catch (error) {
    console.error("[ImageAltOptimizer] Loader error:", error);
    return {
      shop: { name: shopName || "Your Store" },
      products: [],
    };
  }
};

export default function ImageAltOptimizer() {
  const { shop, products: initialProducts } = useLoaderData();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const isPageLoading = navigation.state === "loading";

  // State
  const [products, setProducts] = useState(initialProducts);
  const [activeTemplate, setActiveTemplate] = useState(ALT_PRESETS[0].template);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // "all" | "missing" | "optimized"

  // Drafts tracking: { [mediaId]: string }
  const [draftAlts, setDraftAlts] = useState(() => {
    const initialDrafts = {};
    for (const p of initialProducts) {
      for (const m of p.media) {
        initialDrafts[m.id] = m.alt || "";
      }
    }
    return initialDrafts;
  });

  // Saving states
  const [savingMediaId, setSavingMediaId] = useState(null);
  const [savingProductId, setSavingProductId] = useState(null);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [feedback, setFeedback] = useState(null);

  // Helper to get current value of alt (draft or original)
  const getAltValue = useCallback(
    (mediaId, originalAlt) => {
      return draftAlts[mediaId] !== undefined ? draftAlts[mediaId] : originalAlt || "";
    },
    [draftAlts]
  );

  // Compute catalog image statistics
  const stats = useMemo(() => {
    let totalImages = 0;
    let imagesWithAlt = 0;
    let productsWithMissing = 0;

    for (const p of products) {
      let prodMissing = false;
      for (const m of p.media) {
        totalImages++;
        const currentVal = getAltValue(m.id, m.alt);
        if (currentVal.trim().length > 0) {
          imagesWithAlt++;
        } else {
          prodMissing = true;
        }
      }
      if (prodMissing && p.media.length > 0) {
        productsWithMissing++;
      }
    }

    const missingAlt = Math.max(0, totalImages - imagesWithAlt);
    const coveragePct = totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 100;

    return {
      totalProducts: products.length,
      totalImages,
      imagesWithAlt,
      missingAlt,
      productsWithMissing,
      coveragePct,
    };
  }, [products, getAltValue]);

  // Dirty changes count
  const dirtyCount = useMemo(() => {
    let count = 0;
    for (const p of products) {
      for (const m of p.media) {
        const draft = (draftAlts[m.id] || "").trim();
        const original = (m.alt || "").trim();
        if (draft !== original) {
          count++;
        }
      }
    }
    return count;
  }, [products, draftAlts]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      // Search match
      const matchesSearch = !q || p.title.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      // Status filter
      if (filterMode === "missing") {
        return p.media.some((m) => !getAltValue(m.id, m.alt).trim());
      }
      if (filterMode === "optimized") {
        return p.media.length > 0 && p.media.every((m) => Boolean(getAltValue(m.id, m.alt).trim()));
      }
      return true;
    });
  }, [products, searchQuery, filterMode, getAltValue]);

  // Live Sample Preview for the first product's first image
  const samplePreview = useMemo(() => {
    const firstProd = products[0];
    if (!firstProd) return "";
    return generateImageAltText({
      productTitle: firstProd.title,
      keyword: firstProd.keywords?.[0] || "",
      keywords: firstProd.keywords,
      brand: firstProd.vendor,
      storeName: shop.name,
      imageIndex: 0,
      totalImages: firstProd.media.length || 1,
      template: activeTemplate,
    });
  }, [products, shop.name, activeTemplate]);

  // Handler: Change single draft alt
  const handleDraftChange = (mediaId, value) => {
    setDraftAlts((prev) => ({ ...prev, [mediaId]: value }));
  };

  // Handler: Insert token into active template
  const handleInsertToken = (token) => {
    setActiveTemplate((prev) => {
      const space = prev.endsWith(" ") || prev === "" ? "" : " ";
      return `${prev}${space}${token}`;
    });
  };

  // Handler: Generate AI ALT for 1 image
  const handleGenerateSingle = (product, mediaId, index) => {
    const generated = generateImageAltText({
      productTitle: product.title,
      keyword: product.keywords?.[index % (product.keywords.length || 1)] || "",
      keywords: product.keywords,
      brand: product.vendor,
      storeName: shop.name,
      imageIndex: index,
      totalImages: product.media.length,
      template: activeTemplate,
    });

    handleDraftChange(mediaId, generated);
    if (shopify?.toast) {
      shopify.toast.show(`✨ Generated ALT text for Image #${index + 1}`);
    }
  };

  // Handler: Generate for all images of a product
  const handleGenerateProduct = (product) => {
    const newDrafts = {};
    product.media.forEach((m, idx) => {
      const generated = generateImageAltText({
        productTitle: product.title,
        keyword: product.keywords?.[idx % (product.keywords.length || 1)] || "",
        keywords: product.keywords,
        brand: product.vendor,
        storeName: shop.name,
        imageIndex: idx,
        totalImages: product.media.length,
        template: activeTemplate,
      });
      newDrafts[m.id] = generated;
    });

    setDraftAlts((prev) => ({ ...prev, ...newDrafts }));
    if (shopify?.toast) {
      shopify.toast.show(`✨ Generated ALT texts for ${product.title}`);
    }
  };

  // Handler: Auto-generate for all images missing ALT text on current view
  const handleGenerateAllMissing = () => {
    let generatedCount = 0;
    const newDrafts = {};

    filteredProducts.forEach((p) => {
      p.media.forEach((m, idx) => {
        const current = getAltValue(m.id, m.alt).trim();
        if (!current) {
          const generated = generateImageAltText({
            productTitle: p.title,
            keyword: p.keywords?.[idx % (p.keywords.length || 1)] || "",
            keywords: p.keywords,
            brand: p.vendor,
            storeName: shop.name,
            imageIndex: idx,
            totalImages: p.media.length,
            template: activeTemplate,
          });
          newDrafts[m.id] = generated;
          generatedCount++;
        }
      });
    });

    if (generatedCount === 0) {
      if (shopify?.toast) {
        shopify.toast.show("No images currently missing ALT text!");
      }
      return;
    }

    setDraftAlts((prev) => ({ ...prev, ...newDrafts }));
    setFeedback({
      type: "info",
      message: `✨ Auto-generated ${generatedCount} ALT texts! Review them below and click 'Save All Changes' to apply to Shopify.`,
    });
    if (shopify?.toast) {
      shopify.toast.show(`✨ Generated ${generatedCount} Image ALT texts!`);
    }
  };

  // Handler: Save single image ALT to Shopify
  const handleSaveSingle = async (productId, mediaId) => {
    const altText = (draftAlts[mediaId] || "").trim();
    setSavingMediaId(mediaId);
    setFeedback(null);

    try {
      const res = await fetch("/api/save-image-alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          mediaId,
          altText,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Update local products state so it is no longer marked dirty
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== productId) return p;
            return {
              ...p,
              media: p.media.map((m) => (m.id === mediaId ? { ...m, alt: altText } : m)),
            };
          })
        );

        if (shopify?.toast) {
          shopify.toast.show("✓ Image ALT text saved to Shopify!");
        }
      } else {
        setFeedback({ type: "error", message: `Failed to save: ${data.error}` });
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Error saving: ${e.message}` });
    } finally {
      setSavingMediaId(null);
    }
  };

  // Handler: Save all images for a specific product
  const handleSaveProduct = async (product) => {
    const dirtyMedia = product.media
      .filter((m) => {
        const draft = (draftAlts[m.id] || "").trim();
        const original = (m.alt || "").trim();
        return draft !== original;
      })
      .map((m) => ({
        id: m.id,
        alt: (draftAlts[m.id] || "").trim(),
      }));

    if (dirtyMedia.length === 0) {
      if (shopify?.toast) shopify.toast.show("No changes to save for this product.");
      return;
    }

    setSavingProductId(product.id);
    setFeedback(null);

    try {
      const res = await fetch("/api/save-image-alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          media: dirtyMedia,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== product.id) return p;
            return {
              ...p,
              media: p.media.map((m) => {
                const savedItem = dirtyMedia.find((dm) => dm.id === m.id);
                return savedItem ? { ...m, alt: savedItem.alt } : m;
              }),
            };
          })
        );

        if (shopify?.toast) {
          shopify.toast.show(`✓ Saved ${dirtyMedia.length} image ALT texts for ${product.title}!`);
        }
      } else {
        setFeedback({ type: "error", message: `Save error: ${data.error}` });
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Error: ${e.message}` });
    } finally {
      setSavingProductId(null);
    }
  };

  // Handler: Batch Save All Dirty Changes across entire page
  const handleBatchSaveAll = async () => {
    // Collect all products that have dirty media
    const itemsToSave = [];

    for (const p of products) {
      const dirtyMedia = p.media
        .filter((m) => {
          const draft = (draftAlts[m.id] || "").trim();
          const original = (m.alt || "").trim();
          return draft !== original;
        })
        .map((m) => ({
          id: m.id,
          alt: (draftAlts[m.id] || "").trim(),
        }));

      if (dirtyMedia.length > 0) {
        itemsToSave.push({
          productId: p.id,
          media: dirtyMedia,
        });
      }
    }

    if (itemsToSave.length === 0) {
      if (shopify?.toast) shopify.toast.show("No unsaved changes detected.");
      return;
    }

    setIsBatchSaving(true);
    setBatchProgress({ current: 0, total: itemsToSave.length });
    setFeedback(null);

    let totalSaved = 0;
    let totalErrors = 0;

    // Process in sequential chunks of 5 products to prevent API throttling
    const CHUNK_SIZE = 5;
    for (let i = 0; i < itemsToSave.length; i += CHUNK_SIZE) {
      const chunk = itemsToSave.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch("/api/save-image-alt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: chunk }),
        });

        const data = await res.json();
        if (data.success) {
          totalSaved += data.updatedImagesCount || 0;
          // Apply to local state
          setProducts((prev) =>
            prev.map((p) => {
              const matchedItem = chunk.find((c) => c.productId === p.id);
              if (!matchedItem) return p;
              return {
                ...p,
                media: p.media.map((m) => {
                  const savedM = matchedItem.media.find((sm) => sm.id === m.id);
                  return savedM ? { ...m, alt: savedM.alt } : m;
                }),
              };
            })
          );
        } else {
          totalErrors += chunk.length;
        }
      } catch (err) {
        console.error("Batch save error:", err);
        totalErrors += chunk.length;
      }

      setBatchProgress({
        current: Math.min(i + CHUNK_SIZE, itemsToSave.length),
        total: itemsToSave.length,
      });
    }

    setIsBatchSaving(false);

    if (totalErrors === 0) {
      setFeedback({
        type: "success",
        message: `🎉 Successfully saved ${totalSaved} image ALT texts to Shopify!`,
      });
      if (shopify?.toast) {
        shopify.toast.show(`🎉 Saved ${totalSaved} Image ALT texts to Shopify!`);
      }
    } else {
      setFeedback({
        type: "warning",
        message: `Saved ${totalSaved} images, but encountered errors on ${totalErrors} products. Please review and retry.`,
      });
    }
  };

  // Discard all unsaved drafts
  const handleDiscardChanges = () => {
    if (window.confirm("Are you sure you want to discard all unsaved ALT text changes?")) {
      const resetDrafts = {};
      products.forEach((p) => {
        p.media.forEach((m) => {
          resetDrafts[m.id] = m.alt || "";
        });
      });
      setDraftAlts(resetDrafts);
      setFeedback(null);
      if (shopify?.toast) shopify.toast.show("All unsaved changes discarded.");
    }
  };

  return (
    <s-page heading="Image ALT Text Optimizer">
      <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "60px" }}>
        {/* Navigation Breadcrumb / Top Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link
              to="/app"
              style={{
                color: "#2563eb",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ← Back to Dashboard
            </Link>
            <span style={{ color: "#cbd5e1" }}>|</span>
            <span style={{ fontSize: "13px", color: "#64748b" }}>
              Store: <strong>{shop.name}</strong>
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <Link
              to="/app/bulk-optimizer"
              style={{
                background: "#f1f5f9",
                color: "#334155",
                padding: "6px 12px",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              Bulk SEO Titles & Descs →
            </Link>
            <Link
              to="/app/seo-optimizer"
              style={{
                background: "#f1f5f9",
                color: "#334155",
                padding: "6px 12px",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              Single Product Workbench →
            </Link>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "8px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background:
                feedback.type === "success"
                  ? "#f0fdf4"
                  : feedback.type === "error"
                  ? "#fef2f2"
                  : feedback.type === "warning"
                  ? "#fffbeb"
                  : "#eff6ff",
              border: `1px solid ${
                feedback.type === "success"
                  ? "#86efac"
                  : feedback.type === "error"
                  ? "#fca5a5"
                  : feedback.type === "warning"
                  ? "#fde68a"
                  : "#93c5fd"
              }`,
              color:
                feedback.type === "success"
                  ? "#166534"
                  : feedback.type === "error"
                  ? "#991b1b"
                  : feedback.type === "warning"
                  ? "#92400e"
                  : "#1e40af",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            <div>{feedback.message}</div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontWeight: "bold",
                color: "inherit",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Batch Saving Progress Bar */}
        {isBatchSaving && (
          <div
            style={{
              background: "#ffffff",
              border: "1.5px solid #3b82f6",
              borderRadius: "10px",
              padding: "16px 20px",
              marginBottom: "20px",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontWeight: "700", color: "#1e3a8a", fontSize: "14px" }}>
                ⏳ Saving Image ALT Texts to Shopify...
              </span>
              <span style={{ fontWeight: "700", color: "#2563eb", fontSize: "14px" }}>
                {batchProgress.current} / {batchProgress.total} Products Processed
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: "10px",
                background: "#e2e8f0",
                borderRadius: "999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${
                    batchProgress.total > 0
                      ? Math.round((batchProgress.current / batchProgress.total) * 100)
                      : 0
                  }%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #3b82f6, #06b6d4)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* STATS OVERVIEW CARDS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {/* Card 1: Total Catalog Images */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              padding: "18px 20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
              Total Product Images
            </div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>
              {stats.totalImages}
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              Across {stats.totalProducts} catalog products
            </div>
          </div>

          {/* Card 2: Optimized Images */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              padding: "18px 20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#166534", textTransform: "uppercase" }}>
              Images With ALT Text
            </div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#16a34a", marginTop: "4px" }}>
              {stats.imagesWithAlt}
            </div>
            <div style={{ fontSize: "12px", color: "#166534", marginTop: "4px" }}>
              Accessible & SEO indexed
            </div>
          </div>

          {/* Card 3: Missing ALT Text */}
          <div
            style={{
              background: stats.missingAlt > 0 ? "#fff7ed" : "#f8fafc",
              borderRadius: "10px",
              padding: "18px 20px",
              border: `1px solid ${stats.missingAlt > 0 ? "#fed7aa" : "#e2e8f0"}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: "700", color: stats.missingAlt > 0 ? "#c2410c" : "#64748b", textTransform: "uppercase" }}>
              Missing ALT Text
            </div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: stats.missingAlt > 0 ? "#ea580c" : "#64748b", marginTop: "4px" }}>
              {stats.missingAlt}
            </div>
            <div style={{ fontSize: "12px", color: stats.missingAlt > 0 ? "#c2410c" : "#64748b", marginTop: "4px" }}>
              {stats.productsWithMissing} products need optimization
            </div>
          </div>

          {/* Card 4: Health Coverage */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              padding: "18px 20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#2563eb", textTransform: "uppercase" }}>
              Image SEO Health
            </div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: stats.coveragePct >= 80 ? "#16a34a" : stats.coveragePct >= 50 ? "#d97706" : "#dc2626", marginTop: "4px" }}>
              {stats.coveragePct}%
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              Target: 100% catalog coverage
            </div>
          </div>
        </div>

        {/* SMART TEMPLATE & GENERATION ENGINE */}
        <div
          style={{
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            border: "1.5px solid #cbd5e1",
            borderRadius: "12px",
            padding: "20px 24px",
            marginBottom: "24px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>✨</span> Smart AI Image ALT Template
              </div>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0 0" }}>
                Define how ALT texts should be crafted across your catalog. Dynamic tokens will automatically pull product titles, target keywords, and brand names.
              </p>
            </div>

            {/* Quick Bulk Action Buttons */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleGenerateAllMissing}
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>✨</span> Auto-Generate All Missing ({stats.missingAlt})
              </button>

              {dirtyCount > 0 && (
                <button
                  type="button"
                  disabled={isBatchSaving}
                  onClick={handleBatchSaveAll}
                  style={{
                    background: isBatchSaving ? "#94a3b8" : "linear-gradient(135deg, #10b981, #059669)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 18px",
                    fontSize: "13px",
                    fontWeight: "800",
                    cursor: isBatchSaving ? "wait" : "pointer",
                    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>💾</span> {isBatchSaving ? "Saving..." : `Save All Changes (${dirtyCount})`}
                </button>
              )}

              {dirtyCount > 0 && !isBatchSaving && (
                <button
                  type="button"
                  onClick={handleDiscardChanges}
                  style={{
                    background: "#ffffff",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Discard Changes
                </button>
              )}
            </div>
          </div>

          {/* Template Presets */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "8px" }}>
              Template Presets:
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {ALT_PRESETS.map((preset) => {
                const isActive = activeTemplate === preset.template;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setActiveTemplate(preset.template)}
                    style={{
                      background: isActive ? "#0f172a" : "#ffffff",
                      color: isActive ? "#ffffff" : "#334155",
                      border: `1px solid ${isActive ? "#0f172a" : "#cbd5e1"}`,
                      borderRadius: "6px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template Input & Token Pills */}
          <div style={{ marginTop: "14px" }}>
            <input
              type="text"
              value={activeTemplate}
              onChange={(e) => setActiveTemplate(e.target.value)}
              placeholder="e.g. {product_title} - {keyword} by {brand}"
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "14px",
                fontFamily: "monospace",
                fontWeight: "600",
                borderRadius: "8px",
                border: "1.5px solid #94a3b8",
                background: "#ffffff",
                color: "#0f172a",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>Click to insert token:</span>
              {[
                { token: "{product_title}", label: "+ Product Title" },
                { token: "{keyword}", label: "+ Target Keyword" },
                { token: "{brand}", label: "+ Brand/Vendor" },
                { token: "{view}", label: "+ Image Angle/View" },
                { token: "{store_name}", label: "+ Store Name" },
              ].map((t) => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => handleInsertToken(t.token)}
                  style={{
                    background: "#e2e8f0",
                    border: "none",
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#1e293b",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Real-time Sample Preview */}
          {samplePreview && (
            <div
              style={{
                marginTop: "14px",
                background: "#ffffff",
                border: "1px dashed #94a3b8",
                borderRadius: "8px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "11px", fontWeight: "800", color: "#2563eb", textTransform: "uppercase" }}>
                Live Sample Preview:
              </span>
              <span style={{ fontSize: "13px", color: "#0f172a", fontStyle: "italic", flex: 1 }}>
                &ldquo;{samplePreview}&rdquo;
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: isAltOk(samplePreview) ? "#dcfce7" : "#fee2e2",
                  color: isAltOk(samplePreview) ? "#166534" : "#991b1b",
                }}
              >
                {samplePreview.length} / {ALT_MAX} chars ({isAltOk(samplePreview) ? "Optimal" : "Too long"})
              </span>
            </div>
          )}
        </div>

        {/* SEARCH & FILTER CONTROLS */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "18px",
          }}
        >
          {/* Search Box */}
          <div style={{ flex: "1 1 300px", maxWidth: "450px" }}>
            <input
              type="text"
              placeholder="🔍 Search products by title or handle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "13px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { id: "all", label: `All Products (${products.length})` },
              {
                id: "missing",
                label: `⚠️ Missing ALT (${stats.productsWithMissing})`,
                highlight: stats.productsWithMissing > 0,
              },
              { id: "optimized", label: `✅ Fully Optimized (${products.length - stats.productsWithMissing})` },
            ].map((f) => {
              const isSelected = filterMode === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterMode(f.id)}
                  style={{
                    background: isSelected ? "#0f172a" : "#ffffff",
                    color: isSelected ? "#ffffff" : f.highlight ? "#ea580c" : "#475569",
                    border: `1.5px solid ${isSelected ? "#0f172a" : f.highlight ? "#fdba74" : "#cbd5e1"}`,
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* PRODUCTS & IMAGES LIST */}
        {filteredProducts.length === 0 ? (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "60px 20px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🖼️</div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>
              {filterMode === "missing"
                ? "Awesome! No images are missing ALT text."
                : "No products matched your search."}
            </div>
            <p style={{ fontSize: "14px", color: "#64748b", maxWidth: "450px", margin: "8px auto 16px auto" }}>
              {filterMode === "missing"
                ? "Every product image in your catalog has an accessible, SEO-indexed ALT text."
                : "Try adjusting your search query or reset the filter to view all products."}
            </p>
            {filterMode !== "all" && (
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                View All Products
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {filteredProducts.map((product) => {
              const productMissingCount = product.media.filter(
                (m) => !getAltValue(m.id, m.alt).trim()
              ).length;
              const isProductSaving = savingProductId === product.id;

              // Check if any image in this product has dirty changes
              const productHasDirty = product.media.some((m) => {
                const draft = (draftAlts[m.id] || "").trim();
                const original = (m.alt || "").trim();
                return draft !== original;
              });

              return (
                <div
                  key={product.id}
                  style={{
                    background: "#ffffff",
                    border: `1.5px solid ${
                      productMissingCount > 0 ? "#fed7aa" : productHasDirty ? "#93c5fd" : "#e2e8f0"
                    }`,
                    borderRadius: "12px",
                    padding: "20px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
                  }}
                >
                  {/* Product Header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px solid #f1f5f9",
                      paddingBottom: "14px",
                      marginBottom: "16px",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "17px", fontWeight: "800", color: "#0f172a" }}>
                          {product.title}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: product.status === "ACTIVE" ? "#dcfce7" : "#f1f5f9",
                            color: product.status === "ACTIVE" ? "#166534" : "#64748b",
                          }}
                        >
                          {product.status}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: productMissingCount > 0 ? "#ffedd5" : "#dcfce7",
                            color: productMissingCount > 0 ? "#9a3412" : "#166534",
                          }}
                        >
                          {productMissingCount > 0
                            ? `⚠️ ${productMissingCount} of ${product.media.length} Images Missing ALT`
                            : `✅ All ${product.media.length} Images Optimized`}
                        </span>
                      </div>

                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        Vendor: <strong>{product.vendor}</strong> &bull; Handle: <code>{product.handle}</code>
                        {product.keywords.length > 0 && (
                          <span style={{ marginLeft: "10px" }}>
                            &bull; Target Keywords: <em>{product.keywords.join(", ")}</em>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Product Action Buttons */}
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => handleGenerateProduct(product)}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #cbd5e1",
                          color: "#1e293b",
                          borderRadius: "6px",
                          padding: "6px 12px",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>✨</span> Generate for Product
                      </button>

                      {productHasDirty && (
                        <button
                          type="button"
                          disabled={isProductSaving}
                          onClick={() => handleSaveProduct(product)}
                          style={{
                            background: isProductSaving ? "#94a3b8" : "#2563eb",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            padding: "6px 14px",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: isProductSaving ? "wait" : "pointer",
                          }}
                        >
                          {isProductSaving ? "Saving..." : "💾 Save Images"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Product Images Grid / Rows */}
                  {product.media.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: "13px", fontStyle: "italic", padding: "12px 0" }}>
                      No images found for this product in Shopify.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      {product.media.map((media, idx) => {
                        const currentAlt = getAltValue(media.id, media.alt);
                        const isMissing = !currentAlt.trim();
                        const isDirty = (draftAlts[media.id] || "").trim() !== (media.alt || "").trim();
                        const isSavingThis = savingMediaId === media.id;
                        const altLength = currentAlt.length;
                        const isOptimal = isAltOk(currentAlt);
                        const viewLabel = getImageViewLabel(idx, product.media.length);

                        return (
                          <div
                            key={media.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "16px",
                              padding: "12px",
                              borderRadius: "8px",
                              background: isDirty ? "#f0fdf4" : "#f8fafc",
                              border: `1px solid ${isDirty ? "#86efac" : "#e2e8f0"}`,
                              flexWrap: "wrap",
                            }}
                          >
                            {/* Thumbnail & Position */}
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "120px" }}>
                              <div
                                style={{
                                  width: "56px",
                                  height: "56px",
                                  borderRadius: "6px",
                                  overflow: "hidden",
                                  border: "1px solid #cbd5e1",
                                  background: "#ffffff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <img
                                  src={media.url}
                                  alt={currentAlt || "Product image"}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              </div>

                              <div>
                                <div style={{ fontSize: "12px", fontWeight: "800", color: "#0f172a" }}>
                                  #{idx + 1}
                                </div>
                                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                                  {viewLabel || "Main Image"}
                                </div>
                              </div>
                            </div>

                            {/* Editable ALT Text Input */}
                            <div style={{ flex: 1, minWidth: "260px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: "4px",
                                  alignItems: "center",
                                }}
                              >
                                <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569" }}>
                                  Image ALT Text:
                                </span>

                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: "700",
                                    color: isMissing
                                      ? "#ea580c"
                                      : altLength <= ALT_WARN
                                      ? "#16a34a"
                                      : altLength <= ALT_MAX
                                      ? "#d97706"
                                      : "#dc2626",
                                  }}
                                >
                                  {isMissing
                                    ? "⚠️ Empty (Needs ALT)"
                                    : `${altLength} / ${ALT_MAX} chars ${isOptimal ? "✓" : "(Too long)"}`}
                                </span>
                              </div>

                              <input
                                type="text"
                                value={currentAlt}
                                onChange={(e) => handleDraftChange(media.id, e.target.value)}
                                placeholder="Enter descriptive image alt text..."
                                style={{
                                  width: "100%",
                                  padding: "8px 12px",
                                  fontSize: "13px",
                                  borderRadius: "6px",
                                  border: `1.5px solid ${
                                    isMissing ? "#fdba74" : isDirty ? "#86efac" : "#cbd5e1"
                                  }`,
                                  background: "#ffffff",
                                  color: "#0f172a",
                                  boxSizing: "border-box",
                                  outline: "none",
                                }}
                              />
                            </div>

                            {/* Actions for this Image */}
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleGenerateSingle(product, media.id, idx)}
                                title="Generate ALT text with AI"
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "6px",
                                  padding: "7px 10px",
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#2563eb",
                                  cursor: "pointer",
                                }}
                              >
                                ✨ AI Suggest
                              </button>

                              {isDirty && (
                                <button
                                  type="button"
                                  disabled={isSavingThis}
                                  onClick={() => handleSaveSingle(product.id, media.id)}
                                  title="Save to Shopify"
                                  style={{
                                    background: isSavingThis ? "#94a3b8" : "#16a34a",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "6px",
                                    padding: "7px 12px",
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    cursor: isSavingThis ? "wait" : "pointer",
                                  }}
                                >
                                  {isSavingThis ? "Saving..." : "💾 Save"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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

export function ErrorBoundary() {
  return boundary.error();
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
