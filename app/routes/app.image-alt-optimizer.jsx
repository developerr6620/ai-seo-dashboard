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
  FILE_ALT_PRESETS,
  COLLECTION_ALT_PRESETS,
  isAltOk,
  cleanFilename,
  generateImageAltText,
  generateStoreFileAltText,
  generateCollectionAltText,
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
      // ignore parse error
    }
  }
  return str.split(/[,\n\r]+/).map((k) => k.trim()).filter(Boolean);
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopName = session?.shop || "";

  let shop = { name: shopName || "Your Store" };
  let products = [];
  let files = [];
  let collections = [];
  let filesScopeError = false;

  // 1. Fetch Products & Product Media
  try {
    const prodRes = await admin.graphql(
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

    const prodJson = await prodRes.json();
    if (prodJson?.data?.shop) {
      shop = prodJson.data.shop;
    }

    const rawProducts = prodJson?.data?.products?.edges?.map((e) => e.node) || [];
    products = rawProducts.map((p) => {
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
  } catch (err) {
    console.error("[ImageAltOptimizer] Product fetch error:", err);
  }

  // 2. Fetch Store Files (Content -> Files)
  try {
    const filesRes = await admin.graphql(
      `#graphql
      query getStoreFiles {
        files(first: 100, query: "media_type:IMAGE") {
          edges {
            cursor
            node {
              id
              alt
              createdAt
              ... on MediaImage {
                id
                alt
                image {
                  url
                  width
                  height
                  originalSrc
                }
              }
            }
          }
        }
      }`
    );

    const filesJson = await filesRes.json();
    const rawFiles = filesJson?.data?.files?.edges?.map((e) => e.node) || [];

    files = rawFiles
      .map((f) => {
        const url = f.image?.url || f.image?.originalSrc || "";
        const filename = cleanFilename(url);
        return {
          id: f.id,
          alt: f.alt || "",
          url,
          filename,
          width: f.image?.width || null,
          height: f.image?.height || null,
          createdAt: f.createdAt || "",
        };
      })
      .filter((f) => Boolean(f.url));
  } catch (err) {
    console.warn("[ImageAltOptimizer] Files fetch error (check write_files scope):", err.message);
    filesScopeError = true;
  }

  // 3. Fetch Collections with Images
  try {
    const colRes = await admin.graphql(
      `#graphql
      query getCollectionsWithImages {
        collections(first: 100) {
          edges {
            cursor
            node {
              id
              title
              handle
              image {
                url
                altText
                width
                height
              }
            }
          }
        }
      }`
    );

    const colJson = await colRes.json();
    const rawCollections = colJson?.data?.collections?.edges?.map((e) => e.node) || [];

    collections = rawCollections
      .filter((c) => Boolean(c.image?.url))
      .map((c) => ({
        id: c.id,
        title: c.title || "Collection",
        handle: c.handle || "",
        alt: c.image?.altText || "",
        url: c.image?.url || "",
        width: c.image?.width || null,
        height: c.image?.height || null,
      }));
  } catch (err) {
    console.error("[ImageAltOptimizer] Collection fetch error:", err);
  }

  return {
    shop,
    products,
    files,
    collections,
    filesScopeError,
  };
};

export default function ImageAltOptimizer() {
  const { shop, products: initialProducts, files: initialFiles, collections: initialCollections, filesScopeError } = useLoaderData();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const isPageLoading = navigation.state === "loading";

  // Tab State: "products" | "files" | "collections"
  const [activeTab, setActiveTab] = useState("products");

  // Data States
  const [products, setProducts] = useState(initialProducts);
  const [files, setFiles] = useState(initialFiles);
  const [collections, setCollections] = useState(initialCollections);

  // Template States per tab
  const [productTemplate, setProductTemplate] = useState(ALT_PRESETS[0].template);
  const [fileTemplate, setFileTemplate] = useState(FILE_ALT_PRESETS[0].template);
  const [collectionTemplate, setCollectionTemplate] = useState(COLLECTION_ALT_PRESETS[0].template);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // "all" | "missing" | "optimized"

  // Drafts Maps
  const [draftProductAlts, setDraftProductAlts] = useState(() => {
    const drafts = {};
    initialProducts.forEach((p) => {
      p.media.forEach((m) => {
        drafts[m.id] = m.alt || "";
      });
    });
    return drafts;
  });

  const [draftFileAlts, setDraftFileAlts] = useState(() => {
    const drafts = {};
    initialFiles.forEach((f) => {
      drafts[f.id] = f.alt || "";
    });
    return drafts;
  });

  const [draftCollectionAlts, setDraftCollectionAlts] = useState(() => {
    const drafts = {};
    initialCollections.forEach((c) => {
      drafts[c.id] = c.alt || "";
    });
    return drafts;
  });

  // Saving states
  const [savingId, setSavingId] = useState(null);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [feedback, setFeedback] = useState(null);

  // Value Getters
  const getProductAlt = useCallback((mediaId, orig) => (draftProductAlts[mediaId] !== undefined ? draftProductAlts[mediaId] : orig || ""), [draftProductAlts]);
  const getFileAlt = useCallback((fileId, orig) => (draftFileAlts[fileId] !== undefined ? draftFileAlts[fileId] : orig || ""), [draftFileAlts]);
  const getCollectionAlt = useCallback((colId, orig) => (draftCollectionAlts[colId] !== undefined ? draftCollectionAlts[colId] : orig || ""), [draftCollectionAlts]);

  // Statistics calculation for the active tab
  const stats = useMemo(() => {
    if (activeTab === "products") {
      let total = 0;
      let withAlt = 0;
      let prodsWithMissing = 0;
      products.forEach((p) => {
        let missing = false;
        p.media.forEach((m) => {
          total++;
          if (getProductAlt(m.id, m.alt).trim()) withAlt++;
          else missing = true;
        });
        if (missing && p.media.length > 0) prodsWithMissing++;
      });
      const missingCount = Math.max(0, total - withAlt);
      const pct = total > 0 ? Math.round((withAlt / total) * 100) : 100;
      return { total, withAlt, missing: missingCount, parentMissing: prodsWithMissing, pct, label: "Product Images" };
    }

    if (activeTab === "files") {
      const total = files.length;
      const withAlt = files.filter((f) => Boolean(getFileAlt(f.id, f.alt).trim())).length;
      const missingCount = Math.max(0, total - withAlt);
      const pct = total > 0 ? Math.round((withAlt / total) * 100) : 100;
      return { total, withAlt, missing: missingCount, parentMissing: missingCount, pct, label: "Store Files & Banners" };
    }

    if (activeTab === "collections") {
      const total = collections.length;
      const withAlt = collections.filter((c) => Boolean(getCollectionAlt(c.id, c.alt).trim())).length;
      const missingCount = Math.max(0, total - withAlt);
      const pct = total > 0 ? Math.round((withAlt / total) * 100) : 100;
      return { total, withAlt, missing: missingCount, parentMissing: missingCount, pct, label: "Collection Banners" };
    }

    return { total: 0, withAlt: 0, missing: 0, parentMissing: 0, pct: 100, label: "" };
  }, [activeTab, products, files, collections, getProductAlt, getFileAlt, getCollectionAlt]);

  // Dirty changes count for active tab
  const dirtyCount = useMemo(() => {
    if (activeTab === "products") {
      let count = 0;
      products.forEach((p) => {
        p.media.forEach((m) => {
          if ((draftProductAlts[m.id] || "").trim() !== (m.alt || "").trim()) count++;
        });
      });
      return count;
    }
    if (activeTab === "files") {
      return files.filter((f) => (draftFileAlts[f.id] || "").trim() !== (f.alt || "").trim()).length;
    }
    if (activeTab === "collections") {
      return collections.filter((c) => (draftCollectionAlts[c.id] || "").trim() !== (c.alt || "").trim()).length;
    }
    return 0;
  }, [activeTab, products, files, collections, draftProductAlts, draftFileAlts, draftCollectionAlts]);

  // Filtered lists
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      const match = !q || p.title.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q);
      if (!match) return false;
      if (filterMode === "missing") return p.media.some((m) => !getProductAlt(m.id, m.alt).trim());
      if (filterMode === "optimized") return p.media.length > 0 && p.media.every((m) => Boolean(getProductAlt(m.id, m.alt).trim()));
      return true;
    });
  }, [products, searchQuery, filterMode, getProductAlt]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return files.filter((f) => {
      const match = !q || f.filename.toLowerCase().includes(q) || f.url.toLowerCase().includes(q);
      if (!match) return false;
      const val = getFileAlt(f.id, f.alt).trim();
      if (filterMode === "missing") return !val;
      if (filterMode === "optimized") return Boolean(val);
      return true;
    });
  }, [files, searchQuery, filterMode, getFileAlt]);

  const filteredCollections = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return collections.filter((c) => {
      const match = !q || c.title.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q);
      if (!match) return false;
      const val = getCollectionAlt(c.id, c.alt).trim();
      if (filterMode === "missing") return !val;
      if (filterMode === "optimized") return Boolean(val);
      return true;
    });
  }, [collections, searchQuery, filterMode, getCollectionAlt]);

  // Live Sample Preview for the active tab
  const samplePreview = useMemo(() => {
    if (activeTab === "products") {
      const p = products[0];
      if (!p) return "";
      return generateImageAltText({
        productTitle: p.title,
        keyword: p.keywords?.[0] || "",
        keywords: p.keywords,
        brand: p.vendor,
        storeName: shop.name,
        imageIndex: 0,
        totalImages: p.media.length || 1,
        template: productTemplate,
      });
    }
    if (activeTab === "files") {
      const f = files[0];
      return generateStoreFileAltText({
        filename: f?.filename || "Sample Store Banner",
        url: f?.url || "",
        storeName: shop.name,
        template: fileTemplate,
      });
    }
    if (activeTab === "collections") {
      const c = collections[0];
      return generateCollectionAltText({
        collectionTitle: c?.title || "Summer Apparel",
        storeName: shop.name,
        template: collectionTemplate,
      });
    }
    return "";
  }, [activeTab, products, files, collections, shop.name, productTemplate, fileTemplate, collectionTemplate]);

  // ==========================================
  // HANDLERS: AUTO-GENERATE
  // ==========================================
  const handleAutoGenerateMissing = () => {
    let count = 0;

    if (activeTab === "products") {
      const drafts = {};
      filteredProducts.forEach((p) => {
        p.media.forEach((m, idx) => {
          if (!getProductAlt(m.id, m.alt).trim()) {
            drafts[m.id] = generateImageAltText({
              productTitle: p.title,
              keyword: p.keywords?.[idx % (p.keywords.length || 1)] || "",
              keywords: p.keywords,
              brand: p.vendor,
              storeName: shop.name,
              imageIndex: idx,
              totalImages: p.media.length,
              template: productTemplate,
            });
            count++;
          }
        });
      });
      setDraftProductAlts((prev) => ({ ...prev, ...drafts }));
    } else if (activeTab === "files") {
      const drafts = {};
      filteredFiles.forEach((f) => {
        if (!getFileAlt(f.id, f.alt).trim()) {
          drafts[f.id] = generateStoreFileAltText({
            filename: f.filename,
            url: f.url,
            storeName: shop.name,
            template: fileTemplate,
          });
          count++;
        }
      });
      setDraftFileAlts((prev) => ({ ...prev, ...drafts }));
    } else if (activeTab === "collections") {
      const drafts = {};
      filteredCollections.forEach((c) => {
        if (!getCollectionAlt(c.id, c.alt).trim()) {
          drafts[c.id] = generateCollectionAltText({
            collectionTitle: c.title,
            storeName: shop.name,
            template: collectionTemplate,
          });
          count++;
        }
      });
      setDraftCollectionAlts((prev) => ({ ...prev, ...drafts }));
    }

    if (count === 0) {
      if (shopify?.toast) shopify.toast.show("No images missing ALT text in this view!");
      return;
    }

    setFeedback({
      type: "info",
      message: `✨ Generated ${count} ALT texts! Review them below and click 'Save Changes' to apply to Shopify.`,
    });
    if (shopify?.toast) shopify.toast.show(`✨ Generated ${count} ALT texts!`);
  };

  // ==========================================
  // HANDLERS: SAVE
  // ==========================================
  // Save single Store File
  const handleSaveFile = async (fileId) => {
    const altText = (draftFileAlts[fileId] || "").trim();
    setSavingId(fileId);
    setFeedback(null);
    try {
      const res = await fetch("/api/save-image-alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: "file",
          fileId,
          altText,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, alt: altText } : f)));
        if (shopify?.toast) shopify.toast.show("✓ Store File ALT text saved!");
      } else {
        setFeedback({ type: "error", message: `Failed to save: ${data.error}` });
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Error: ${e.message}` });
    } finally {
      setSavingId(null);
    }
  };

  // Save single Collection Banner
  const handleSaveCollection = async (collection) => {
    const altText = (draftCollectionAlts[collection.id] || "").trim();
    setSavingId(collection.id);
    setFeedback(null);
    try {
      const res = await fetch("/api/save-image-alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: "collection",
          collectionId: collection.id,
          altText,
          imageUrl: collection.url,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCollections((prev) => prev.map((c) => (c.id === collection.id ? { ...c, alt: altText } : c)));
        if (shopify?.toast) shopify.toast.show("✓ Collection Banner ALT text saved!");
      } else {
        setFeedback({ type: "error", message: `Failed to save: ${data.error}` });
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Error: ${e.message}` });
    } finally {
      setSavingId(null);
    }
  };

  // Save single Product Media
  const handleSaveProductMedia = async (productId, mediaId) => {
    const altText = (draftProductAlts[mediaId] || "").trim();
    setSavingId(mediaId);
    setFeedback(null);
    try {
      const res = await fetch("/api/save-image-alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: "product",
          productId,
          mediaId,
          altText,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProducts((prev) =>
          prev.map((p) => (p.id !== productId ? p : { ...p, media: p.media.map((m) => (m.id === mediaId ? { ...m, alt: altText } : m)) }))
        );
        if (shopify?.toast) shopify.toast.show("✓ Product Image ALT text saved!");
      } else {
        setFeedback({ type: "error", message: `Failed to save: ${data.error}` });
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Error: ${e.message}` });
    } finally {
      setSavingId(null);
    }
  };

  // BATCH SAVE ALL FOR ACTIVE TAB
  const handleBatchSave = async () => {
    setIsBatchSaving(true);
    setFeedback(null);

    if (activeTab === "products") {
      const items = [];
      products.forEach((p) => {
        const dirtyMedia = p.media
          .filter((m) => (draftProductAlts[m.id] || "").trim() !== (m.alt || "").trim())
          .map((m) => ({ id: m.id, alt: (draftProductAlts[m.id] || "").trim() }));
        if (dirtyMedia.length > 0) items.push({ productId: p.id, media: dirtyMedia });
      });

      if (items.length === 0) {
        setIsBatchSaving(false);
        if (shopify?.toast) shopify.toast.show("No unsaved product changes.");
        return;
      }

      setBatchProgress({ current: 0, total: items.length });
      let saved = 0;
      const CHUNK = 5;
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK);
        try {
          const res = await fetch("/api/save-image-alt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resourceType: "product", items: chunk }),
          });
          const d = await res.json();
          if (d.success) {
            saved += d.updatedImagesCount || 0;
            setProducts((prev) =>
              prev.map((p) => {
                const match = chunk.find((c) => c.productId === p.id);
                if (!match) return p;
                return {
                  ...p,
                  media: p.media.map((m) => {
                    const sm = match.media.find((item) => item.id === m.id);
                    return sm ? { ...m, alt: sm.alt } : m;
                  }),
                };
              })
            );
          }
        } catch (e) {
          console.error("Batch error:", e);
        }
        setBatchProgress({ current: Math.min(i + CHUNK, items.length), total: items.length });
      }

      setIsBatchSaving(false);
      setFeedback({ type: "success", message: `🎉 Successfully saved ${saved} Product Image ALT texts to Shopify!` });
      if (shopify?.toast) shopify.toast.show(`🎉 Saved ${saved} Product Image ALT texts!`);
    } else if (activeTab === "files") {
      const dirtyFiles = files
        .filter((f) => (draftFileAlts[f.id] || "").trim() !== (f.alt || "").trim())
        .map((f) => ({ id: f.id, alt: (draftFileAlts[f.id] || "").trim() }));

      if (dirtyFiles.length === 0) {
        setIsBatchSaving(false);
        if (shopify?.toast) shopify.toast.show("No unsaved file changes.");
        return;
      }

      setBatchProgress({ current: 0, total: dirtyFiles.length });
      let saved = 0;
      const CHUNK = 10;
      for (let i = 0; i < dirtyFiles.length; i += CHUNK) {
        const chunk = dirtyFiles.slice(i, i + CHUNK);
        try {
          const res = await fetch("/api/save-image-alt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resourceType: "file", files: chunk }),
          });
          const d = await res.json();
          if (d.success) {
            saved += d.updatedCount || 0;
            setFiles((prev) =>
              prev.map((f) => {
                const match = chunk.find((item) => item.id === f.id);
                return match ? { ...f, alt: match.alt } : f;
              })
            );
          }
        } catch (e) {
          console.error("File batch error:", e);
        }
        setBatchProgress({ current: Math.min(i + CHUNK, dirtyFiles.length), total: dirtyFiles.length });
      }

      setIsBatchSaving(false);
      setFeedback({ type: "success", message: `🎉 Successfully saved ${saved} Store File ALT texts to Shopify!` });
      if (shopify?.toast) shopify.toast.show(`🎉 Saved ${saved} Store File ALT texts!`);
    } else if (activeTab === "collections") {
      const dirtyCollections = collections
        .filter((c) => (draftCollectionAlts[c.id] || "").trim() !== (c.alt || "").trim())
        .map((c) => ({ id: c.id, altText: (draftCollectionAlts[c.id] || "").trim(), imageUrl: c.url }));

      if (dirtyCollections.length === 0) {
        setIsBatchSaving(false);
        if (shopify?.toast) shopify.toast.show("No unsaved collection changes.");
        return;
      }

      setBatchProgress({ current: 0, total: dirtyCollections.length });
      let saved = 0;
      const CHUNK = 5;
      for (let i = 0; i < dirtyCollections.length; i += CHUNK) {
        const chunk = dirtyCollections.slice(i, i + CHUNK);
        try {
          const res = await fetch("/api/save-image-alt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resourceType: "collection", items: chunk }),
          });
          const d = await res.json();
          if (d.success) {
            saved += d.updatedCount || 0;
            setCollections((prev) =>
              prev.map((col) => {
                const match = chunk.find((item) => item.id === col.id);
                return match ? { ...col, alt: match.altText } : col;
              })
            );
          }
        } catch (e) {
          console.error("Collection batch error:", e);
        }
        setBatchProgress({ current: Math.min(i + CHUNK, dirtyCollections.length), total: dirtyCollections.length });
      }

      setIsBatchSaving(false);
      setFeedback({ type: "success", message: `🎉 Successfully saved ${saved} Collection Banner ALT texts!` });
      if (shopify?.toast) shopify.toast.show(`🎉 Saved ${saved} Collection Banner ALT texts!`);
    }
  };

  return (
    <s-page heading="Storewide Image ALT Optimizer">
      <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "60px" }}>
        {/* Navigation Breadcrumb */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link to="/app" style={{ color: "#2563eb", textDecoration: "none", fontSize: "13px", fontWeight: "600" }}>
              ← Back to Dashboard
            </Link>
            <span style={{ color: "#cbd5e1" }}>|</span>
            <span style={{ fontSize: "13px", color: "#64748b" }}>
              Store: <strong>{shop.name}</strong>
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <Link
              to="/app/seo-optimizer"
              style={{ background: "#f1f5f9", color: "#334155", padding: "6px 12px", borderRadius: "6px", textDecoration: "none", fontSize: "12px", fontWeight: "600" }}
            >
              Single Product Workbench →
            </Link>
          </div>
        </div>

        {/* RESOURCE TABS SWITCHER */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            background: "#f1f5f9",
            padding: "6px",
            borderRadius: "10px",
            marginBottom: "20px",
            border: "1px solid #e2e8f0",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("products")}
            style={{
              flex: "1 1 180px",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "products" ? "#ffffff" : "transparent",
              color: activeTab === "products" ? "#0f172a" : "#64748b",
              fontWeight: "800",
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: activeTab === "products" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <span>📦</span> Product Images ({products.reduce((acc, p) => acc + p.media.length, 0)})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("files")}
            style={{
              flex: "1 1 180px",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "files" ? "#ffffff" : "transparent",
              color: activeTab === "files" ? "#0f172a" : "#64748b",
              fontWeight: "800",
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: activeTab === "files" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <span>🖼️</span> Store Files & Banners ({files.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("collections")}
            style={{
              flex: "1 1 180px",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "collections" ? "#ffffff" : "transparent",
              color: activeTab === "collections" ? "#0f172a" : "#64748b",
              fontWeight: "800",
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: activeTab === "collections" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <span>📁</span> Collection Banners ({collections.length})
          </button>
        </div>

        {/* Scope warning alert if write_files permission is pending */}
        {filesScopeError && activeTab === "files" && (
          <div
            style={{
              background: "#fffbeb",
              border: "1.5px solid #fde68a",
              borderRadius: "10px",
              padding: "14px 18px",
              marginBottom: "20px",
              color: "#92400e",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <div>
              <strong>Shopify Files Scope Pending:</strong> If your files library does not show images, please reload the app in your Shopify Admin to accept the newly added <code>write_files</code> permission.
            </div>
          </div>
        )}

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
              background: feedback.type === "success" ? "#f0fdf4" : feedback.type === "error" ? "#fef2f2" : "#eff6ff",
              border: `1px solid ${feedback.type === "success" ? "#86efac" : feedback.type === "error" ? "#fca5a5" : "#93c5fd"}`,
              color: feedback.type === "success" ? "#166534" : feedback.type === "error" ? "#991b1b" : "#1e40af",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            <div>{feedback.message}</div>
            <button type="button" onClick={() => setFeedback(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", fontWeight: "bold" }}>
              ✕
            </button>
          </div>
        )}

        {/* Batch Saving Progress Bar */}
        {isBatchSaving && (
          <div style={{ background: "#ffffff", border: "1.5px solid #3b82f6", borderRadius: "10px", padding: "16px 20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontWeight: "700", color: "#1e3a8a", fontSize: "14px" }}>
                ⏳ Saving {stats.label} ALT Texts to Shopify...
              </span>
              <span style={{ fontWeight: "700", color: "#2563eb", fontSize: "14px" }}>
                {batchProgress.current} / {batchProgress.total} Items Processed
              </span>
            </div>
            <div style={{ width: "100%", height: "10px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #3b82f6, #06b6d4)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* STATS OVERVIEW CARDS FOR ACTIVE TAB */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#ffffff", borderRadius: "10px", padding: "18px 20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Total {stats.label}</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>{stats.total}</div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>In current view</div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: "10px", padding: "18px 20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#166534", textTransform: "uppercase" }}>With ALT Text</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#16a34a", marginTop: "4px" }}>{stats.withAlt}</div>
            <div style={{ fontSize: "12px", color: "#166534", marginTop: "4px" }}>Accessible & indexed</div>
          </div>

          <div style={{ background: stats.missing > 0 ? "#fff7ed" : "#f8fafc", borderRadius: "10px", padding: "18px 20px", border: `1px solid ${stats.missing > 0 ? "#fed7aa" : "#e2e8f0"}` }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: stats.missing > 0 ? "#c2410c" : "#64748b", textTransform: "uppercase" }}>Missing ALT Text</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: stats.missing > 0 ? "#ea580c" : "#64748b", marginTop: "4px" }}>{stats.missing}</div>
            <div style={{ fontSize: "12px", color: stats.missing > 0 ? "#c2410c" : "#64748b", marginTop: "4px" }}>Requires optimization</div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: "10px", padding: "18px 20px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#2563eb", textTransform: "uppercase" }}>Image SEO Health</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: stats.pct >= 80 ? "#16a34a" : stats.pct >= 50 ? "#d97706" : "#dc2626", marginTop: "4px" }}>
              {stats.pct}%
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Coverage target: 100%</div>
          </div>
        </div>

        {/* SMART TEMPLATE CONTROL BAR */}
        <div style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", border: "1.5px solid #cbd5e1", borderRadius: "12px", padding: "20px 24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>✨</span> Smart AI Template for {stats.label}
              </div>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0 0" }}>
                {activeTab === "products"
                  ? "Define dynamic tokens for products, gallery view angles, and target keywords."
                  : activeTab === "files"
                  ? "Automatically clean raw filenames into readable, search-optimized descriptions."
                  : "Optimize category headers with collection titles and brand branding."}
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleAutoGenerateMissing}
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>✨</span> Auto-Generate Missing ({stats.missing})
              </button>

              {dirtyCount > 0 && (
                <button
                  type="button"
                  disabled={isBatchSaving}
                  onClick={handleBatchSave}
                  style={{
                    background: isBatchSaving ? "#94a3b8" : "linear-gradient(135deg, #10b981, #059669)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 18px",
                    fontSize: "13px",
                    fontWeight: "800",
                    cursor: isBatchSaving ? "wait" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>💾</span> {isBatchSaving ? "Saving..." : `Save Changes (${dirtyCount})`}
                </button>
              )}
            </div>
          </div>

          {/* Presets */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "8px" }}>Presets:</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {(activeTab === "products" ? ALT_PRESETS : activeTab === "files" ? FILE_ALT_PRESETS : COLLECTION_ALT_PRESETS).map((p) => {
                const currentTpl = activeTab === "products" ? productTemplate : activeTab === "files" ? fileTemplate : collectionTemplate;
                const isAct = currentTpl === p.template;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (activeTab === "products") setProductTemplate(p.template);
                      else if (activeTab === "files") setFileTemplate(p.template);
                      else setCollectionTemplate(p.template);
                    }}
                    style={{
                      background: isAct ? "#0f172a" : "#ffffff",
                      color: isAct ? "#ffffff" : "#334155",
                      border: `1px solid ${isAct ? "#0f172a" : "#cbd5e1"}`,
                      borderRadius: "6px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input & Token Chips */}
          <div style={{ marginTop: "14px" }}>
            <input
              type="text"
              value={activeTab === "products" ? productTemplate : activeTab === "files" ? fileTemplate : collectionTemplate}
              onChange={(e) => {
                if (activeTab === "products") setProductTemplate(e.target.value);
                else if (activeTab === "files") setFileTemplate(e.target.value);
                else setCollectionTemplate(e.target.value);
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "14px",
                fontFamily: "monospace",
                fontWeight: "600",
                borderRadius: "8px",
                border: "1.5px solid #94a3b8",
                background: "#ffffff",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>Click to insert token:</span>
              {(activeTab === "products"
                ? [
                    { token: "{product_title}", label: "+ Product Title" },
                    { token: "{keyword}", label: "+ Keyword" },
                    { token: "{brand}", label: "+ Brand" },
                    { token: "{view}", label: "+ Angle/View" },
                    { token: "{store_name}", label: "+ Store Name" },
                  ]
                : activeTab === "files"
                ? [
                    { token: "{filename}", label: "+ Cleaned Filename" },
                    { token: "{store_name}", label: "+ Store Name" },
                  ]
                : [
                    { token: "{collection_title}", label: "+ Collection Title" },
                    { token: "{store_name}", label: "+ Store Name" },
                  ]
              ).map((t) => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => {
                    const append = (prev) => `${prev}${prev.endsWith(" ") || prev === "" ? "" : " "}${t.token}`;
                    if (activeTab === "products") setProductTemplate(append);
                    else if (activeTab === "files") setFileTemplate(append);
                    else setCollectionTemplate(append);
                  }}
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

          {/* Live Sample Preview */}
          {samplePreview && (
            <div style={{ marginTop: "14px", background: "#ffffff", border: "1px dashed #94a3b8", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", fontWeight: "800", color: "#2563eb", textTransform: "uppercase" }}>Sample Preview:</span>
              <span style={{ fontSize: "13px", color: "#0f172a", fontStyle: "italic", flex: 1 }}>&ldquo;{samplePreview}&rdquo;</span>
              <span style={{ fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "999px", background: isAltOk(samplePreview) ? "#dcfce7" : "#fee2e2", color: isAltOk(samplePreview) ? "#166534" : "#991b1b" }}>
                {samplePreview.length} / {ALT_MAX} chars ({isAltOk(samplePreview) ? "Optimal" : "Too long"})
              </span>
            </div>
          )}
        </div>

        {/* SEARCH & FILTERS */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
          <div style={{ flex: "1 1 300px", maxWidth: "450px" }}>
            <input
              type="text"
              placeholder={`🔍 Search ${stats.label.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", fontSize: "13px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", boxSizing: "border-box", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { id: "all", label: `All (${stats.total})` },
              { id: "missing", label: `⚠️ Missing ALT (${stats.missing})`, highlight: stats.missing > 0 },
              { id: "optimized", label: `✅ Optimized (${stats.withAlt})` },
            ].map((f) => {
              const isSel = filterMode === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterMode(f.id)}
                  style={{
                    background: isSel ? "#0f172a" : "#ffffff",
                    color: isSel ? "#ffffff" : f.highlight ? "#ea580c" : "#475569",
                    border: `1.5px solid ${isSel ? "#0f172a" : f.highlight ? "#fdba74" : "#cbd5e1"}`,
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

        {/* TAB CONTENT: PRODUCTS */}
        {activeTab === "products" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {filteredProducts.length === 0 ? (
              <div style={{ background: "#ffffff", padding: "60px 20px", textAlign: "center", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>📦</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>No product images found matching criteria.</div>
              </div>
            ) : (
              filteredProducts.map((p) => {
                const missingCount = p.media.filter((m) => !getProductAlt(m.id, m.alt).trim()).length;
                return (
                  <div key={p.id} style={{ background: "#ffffff", border: `1.5px solid ${missingCount > 0 ? "#fed7aa" : "#e2e8f0"}`, borderRadius: "12px", padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <span style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>{p.title}</span>
                        <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "999px", background: missingCount > 0 ? "#ffedd5" : "#dcfce7", color: missingCount > 0 ? "#9a3412" : "#166534" }}>
                          {missingCount > 0 ? `⚠️ ${missingCount} of ${p.media.length} Missing ALT` : `✅ All ${p.media.length} Optimized`}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const drafts = {};
                          p.media.forEach((m, idx) => {
                            drafts[m.id] = generateImageAltText({
                              productTitle: p.title,
                              keyword: p.keywords?.[idx % (p.keywords.length || 1)] || "",
                              keywords: p.keywords,
                              brand: p.vendor,
                              storeName: shop.name,
                              imageIndex: idx,
                              totalImages: p.media.length,
                              template: productTemplate,
                            });
                          });
                          setDraftProductAlts((prev) => ({ ...prev, ...drafts }));
                          if (shopify?.toast) shopify.toast.show(`Generated for ${p.title}`);
                        }}
                        style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
                      >
                        ✨ Generate for Product
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {p.media.map((m, idx) => {
                        const currentAlt = getProductAlt(m.id, m.alt);
                        const isMissing = !currentAlt.trim();
                        const isDirty = (draftProductAlts[m.id] || "").trim() !== (m.alt || "").trim();
                        const isSavingThis = savingId === m.id;
                        const len = currentAlt.length;
                        const isOpt = isAltOk(currentAlt);
                        const viewLabel = getImageViewLabel(idx, p.media.length);

                        return (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "10px 14px", borderRadius: "8px", background: isDirty ? "#f0fdf4" : "#f8fafc", border: `1px solid ${isDirty ? "#86efac" : "#e2e8f0"}`, flexWrap: "wrap" }}>
                            <div style={{ width: "50px", height: "50px", borderRadius: "6px", overflow: "hidden", border: "1px solid #cbd5e1", background: "#ffffff", flexShrink: 0 }}>
                              <img src={m.url} alt={currentAlt || "Product"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </div>

                            <div style={{ minWidth: "90px" }}>
                              <div style={{ fontSize: "12px", fontWeight: "800", color: "#0f172a" }}>#{idx + 1}</div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>{viewLabel || "Main"}</div>
                            </div>

                            <div style={{ flex: 1, minWidth: "240px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                <span style={{ fontSize: "11px", fontWeight: "600", color: "#475569" }}>ALT Text:</span>
                                <span style={{ fontSize: "11px", fontWeight: "700", color: isMissing ? "#ea580c" : len <= ALT_WARN ? "#16a34a" : isOpt ? "#d97706" : "#dc2626" }}>
                                  {isMissing ? "⚠️ Empty" : `${len} / ${ALT_MAX} chars ${isOpt ? "✓" : "(Too long)"}`}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={currentAlt}
                                onChange={(e) => setDraftProductAlts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                placeholder="Enter image alt text..."
                                style={{ width: "100%", padding: "7px 10px", fontSize: "12px", borderRadius: "6px", border: `1.5px solid ${isMissing ? "#fdba74" : isDirty ? "#86efac" : "#cbd5e1"}`, background: "#ffffff", boxSizing: "border-box", outline: "none" }}
                              />
                            </div>

                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const gen = generateImageAltText({
                                    productTitle: p.title,
                                    keyword: p.keywords?.[idx % (p.keywords.length || 1)] || "",
                                    keywords: p.keywords,
                                    brand: p.vendor,
                                    storeName: shop.name,
                                    imageIndex: idx,
                                    totalImages: p.media.length,
                                    template: productTemplate,
                                  });
                                  setDraftProductAlts((prev) => ({ ...prev, [m.id]: gen }));
                                }}
                                style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 10px", fontSize: "11px", fontWeight: "700", color: "#2563eb", cursor: "pointer" }}
                              >
                                ✨ AI
                              </button>

                              {isDirty && (
                                <button
                                  type="button"
                                  disabled={isSavingThis}
                                  onClick={() => handleSaveProductMedia(p.id, m.id)}
                                  style={{ background: isSavingThis ? "#94a3b8" : "#16a34a", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 12px", fontSize: "11px", fontWeight: "700", cursor: isSavingThis ? "wait" : "pointer" }}
                                >
                                  {isSavingThis ? "..." : "💾 Save"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB CONTENT: STORE FILES (CONTENT -> FILES) */}
        {activeTab === "files" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {filteredFiles.length === 0 ? (
              <div style={{ background: "#ffffff", padding: "60px 20px", textAlign: "center", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>🖼️</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>No store files found in Content &rarr; Files matching criteria.</div>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "6px auto 0 auto", maxWidth: "450px" }}>
                  Upload hero banners, sliders, and logos in your Shopify Admin under <strong>Content &rarr; Files</strong> to optimize them here.
                </p>
              </div>
            ) : (
              filteredFiles.map((f) => {
                const currentAlt = getFileAlt(f.id, f.alt);
                const isMissing = !currentAlt.trim();
                const isDirty = (draftFileAlts[f.id] || "").trim() !== (f.alt || "").trim();
                const isSavingThis = savingId === f.id;
                const len = currentAlt.length;
                const isOpt = isAltOk(currentAlt);

                return (
                  <div key={f.id} style={{ background: "#ffffff", border: `1.5px solid ${isMissing ? "#fed7aa" : isDirty ? "#86efac" : "#e2e8f0"}`, borderRadius: "10px", padding: "16px 18px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                    <div style={{ width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", border: "1px solid #cbd5e1", background: "#f8fafc", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <img src={f.url} alt={currentAlt || f.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>

                    <div style={{ minWidth: "160px", maxWidth: "220px" }}>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: "#0f172a", wordBreak: "break-word" }}>{f.filename}</div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        {f.width && f.height ? `${f.width}×${f.height}px` : "Store Asset"}
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: "260px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569" }}>File ALT Tag:</span>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: isMissing ? "#ea580c" : len <= ALT_WARN ? "#16a34a" : isOpt ? "#d97706" : "#dc2626" }}>
                          {isMissing ? "⚠️ Missing ALT" : `${len} / ${ALT_MAX} chars ${isOpt ? "✓" : "(Too long)"}`}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={currentAlt}
                        onChange={(e) => setDraftFileAlts((prev) => ({ ...prev, [f.id]: e.target.value }))}
                        placeholder="Enter descriptive ALT text for this banner..."
                        style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "6px", border: `1.5px solid ${isMissing ? "#fdba74" : isDirty ? "#86efac" : "#cbd5e1"}`, background: "#ffffff", boxSizing: "border-box", outline: "none" }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          const gen = generateStoreFileAltText({ filename: f.filename, url: f.url, storeName: shop.name, template: fileTemplate });
                          setDraftFileAlts((prev) => ({ ...prev, [f.id]: gen }));
                        }}
                        style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "7px 12px", fontSize: "12px", fontWeight: "700", color: "#2563eb", cursor: "pointer" }}
                      >
                        ✨ AI Suggest
                      </button>

                      {isDirty && (
                        <button
                          type="button"
                          disabled={isSavingThis}
                          onClick={() => handleSaveFile(f.id)}
                          style={{ background: isSavingThis ? "#94a3b8" : "#16a34a", color: "#ffffff", border: "none", borderRadius: "6px", padding: "7px 14px", fontSize: "12px", fontWeight: "700", cursor: isSavingThis ? "wait" : "pointer" }}
                        >
                          {isSavingThis ? "..." : "💾 Save"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB CONTENT: COLLECTION BANNERS */}
        {activeTab === "collections" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {filteredCollections.length === 0 ? (
              <div style={{ background: "#ffffff", padding: "60px 20px", textAlign: "center", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>📁</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>No collections with banner images found.</div>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "6px auto 0 auto", maxWidth: "450px" }}>
                  Add a collection image in your Shopify Admin under <strong>Products &rarr; Collections</strong> to optimize its banner ALT tag here.
                </p>
              </div>
            ) : (
              filteredCollections.map((c) => {
                const currentAlt = getCollectionAlt(c.id, c.alt);
                const isMissing = !currentAlt.trim();
                const isDirty = (draftCollectionAlts[c.id] || "").trim() !== (c.alt || "").trim();
                const isSavingThis = savingId === c.id;
                const len = currentAlt.length;
                const isOpt = isAltOk(currentAlt);

                return (
                  <div key={c.id} style={{ background: "#ffffff", border: `1.5px solid ${isMissing ? "#fed7aa" : isDirty ? "#86efac" : "#e2e8f0"}`, borderRadius: "10px", padding: "16px 18px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                    <div style={{ width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", border: "1px solid #cbd5e1", background: "#f8fafc", flexShrink: 0 }}>
                      <img src={c.url} alt={currentAlt || c.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>

                    <div style={{ minWidth: "160px", maxWidth: "220px" }}>
                      <div style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>{c.title}</div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        Handle: <code>{c.handle}</code>
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: "260px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569" }}>Collection Banner ALT:</span>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: isMissing ? "#ea580c" : len <= ALT_WARN ? "#16a34a" : isOpt ? "#d97706" : "#dc2626" }}>
                          {isMissing ? "⚠️ Missing ALT" : `${len} / ${ALT_MAX} chars ${isOpt ? "✓" : "(Too long)"}`}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={currentAlt}
                        onChange={(e) => setDraftCollectionAlts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="Enter descriptive ALT text for this collection banner..."
                        style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "6px", border: `1.5px solid ${isMissing ? "#fdba74" : isDirty ? "#86efac" : "#cbd5e1"}`, background: "#ffffff", boxSizing: "border-box", outline: "none" }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          const gen = generateCollectionAltText({ collectionTitle: c.title, storeName: shop.name, template: collectionTemplate });
                          setDraftCollectionAlts((prev) => ({ ...prev, [c.id]: gen }));
                        }}
                        style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "7px 12px", fontSize: "12px", fontWeight: "700", color: "#2563eb", cursor: "pointer" }}
                      >
                        ✨ AI Suggest
                      </button>

                      {isDirty && (
                        <button
                          type="button"
                          disabled={isSavingThis}
                          onClick={() => handleSaveCollection(c)}
                          style={{ background: isSavingThis ? "#94a3b8" : "#16a34a", color: "#ffffff", border: "none", borderRadius: "6px", padding: "7px 14px", fontSize: "12px", fontWeight: "700", cursor: isSavingThis ? "wait" : "pointer" }}
                        >
                          {isSavingThis ? "..." : "💾 Save"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {isPageLoading && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(255, 255, 255, 0.7)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
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
