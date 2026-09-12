/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useMemo, useEffect } from "react";
import { useLoaderData, useNavigate, useNavigation, useSearchParams, redirect, useRevalidator, Link } from "react-router";
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
import {
  BulkCollectionsView,
  BulkPagesView,
  BulkArticlesView,
} from "../components/BulkResourceViews";

function parseMetafieldKeywords(rawVal) {
  if (!rawVal) return [];
  if (Array.isArray(rawVal)) return rawVal.map((k) => String(k).trim()).filter(Boolean);
  const str = String(rawVal).trim();
  if (!str || str === "[]" || str === '""') return [];

  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map((k) => String(k).trim()).filter(Boolean);
      }
    } catch {
      // fallback to delimiter split
    }
  }

  return str
    .split(/[,\n\r]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  // Guarantee that the Target SEO Keywords definition is registered & pinned in Shopify
  await ensureKeywordsMetafieldDefinition(admin, shop);

  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");
  const cursorParam = url.searchParams.get("cursor");
  const directionParam = url.searchParams.get("direction"); // "next" | "prev"
  const page = parseInt(pageParam || "1", 10);
  const perPage = 250;

  // Self-heal: If page > 1 but no cursor is present (e.g. from previous broken session),
  // redirect cleanly to page 1 while preserving Shopify embedded iframe parameters (host, shop, etc.)
  if (page > 1 && !cursorParam) {
    const cleanParams = new URLSearchParams(url.search);
    cleanParams.delete("page");
    cleanParams.delete("cursor");
    cleanParams.delete("direction");
    const qs = cleanParams.toString();
    return redirect(`/app/bulk-optimizer${qs ? `?${qs}` : ""}`);
  }

  try {
    // Select the appropriate GraphQL products query based on pagination direction and cursor
    let productsGql;
    let productsVars;

    if (cursorParam && directionParam === "prev") {
      productsGql = `#graphql
        query getProductsPrev($last: Int!, $before: String!) {
          products(last: $last, before: $before) {
            edges {
              cursor
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
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                  value
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }`;
      productsVars = { last: perPage, before: cursorParam };
    } else if (cursorParam) {
      productsGql = `#graphql
        query getProductsNext($first: Int!, $after: String!) {
          products(first: $first, after: $after) {
            edges {
              cursor
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
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                  value
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }`;
      productsVars = { first: perPage, after: cursorParam };
    } else {
      productsGql = `#graphql
        query getProductsFirst($first: Int!) {
          products(first: $first) {
            edges {
              cursor
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
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                  value
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }`;
      productsVars = { first: perPage };
    }

    // Run count query and products query in parallel
    const [countResponse, productsResponse] = await Promise.all([
      admin.graphql(
        `#graphql
        query getProductCount {
          productsCount {
            count
          }
        }`
      ),
      admin.graphql(productsGql, { variables: productsVars }),
    ]);

    const countData = await countResponse.json();
    const productsData = await productsResponse.json();

    const totalCount = countData?.data?.productsCount?.count || 0;
    const rawEdges = productsData?.data?.products?.edges || [];
    const pageInfo = productsData?.data?.products?.pageInfo || {};

    const products = rawEdges.map((edge) => {
      const p = edge.node;
      return {
        id: String(p.id || ""),
        title: String(p.title || "Untitled Product"),
        handle: String(p.handle || "product"),
        description: String(p.description || ""),
        imageUrl: p.featuredImage?.url || null,
        status: String(p.status || "ACTIVE"),
        seoTitle: String(p.seo?.title || ""),
        seoDescription: String(p.seo?.description || ""),
        keywords: parseMetafieldKeywords(p.keywordsMetafield?.value),
        // hasCustomSeoTitle is true only when Shopify seo.title is explicitly set
        hasCustomSeoTitle: Boolean(p.seo?.title?.trim()),
      };
    });

    // Calculate total pages and ensure currentPage is within bounds
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const startCursor = pageInfo.startCursor || rawEdges[0]?.cursor || null;
    const endCursor = pageInfo.endCursor || rawEdges[rawEdges.length - 1]?.cursor || null;

    const hasNextPage = Boolean(
      (pageInfo.hasNextPage ?? (currentPage < totalPages)) && currentPage < totalPages
    );
    const hasPreviousPage = Boolean(
      (pageInfo.hasPreviousPage ?? (currentPage > 1)) && currentPage > 1
    );

    // 1. Fetch Shop details
    let shopInfo = { name: "Your Store" };
    try {
      const shopRes = await admin.graphql(
        `#graphql
        query getShopName {
          shop {
            name
            myshopifyDomain
          }
        }`
      );
      const shopData = await shopRes.json();
      if (shopData?.data?.shop?.name) {
        shopInfo = shopData.data.shop;
      }
    } catch (e) {
      console.warn("Shop fetch error:", e);
    }

    // 2. Fetch Collections
    let collections = [];
    try {
      const colRes = await admin.graphql(
        `#graphql
        query getCollectionsSeo {
          collections(first: 100) {
            edges {
              node {
                id
                title
                handle
                description
                image {
                  url
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
      const colData = await colRes.json();
      collections = (colData?.data?.collections?.edges || []).map((e) => ({
        id: e.node.id,
        title: e.node.title || "Untitled Collection",
        handle: e.node.handle || "",
        description: e.node.description || "",
        imageUrl: e.node.image?.url || null,
        seoTitle: e.node.seo?.title || "",
        seoDescription: e.node.seo?.description || "",
        hasCustomSeoTitle: Boolean(e.node.seo?.title?.trim()),
      }));
    } catch (colErr) {
      console.warn("Collections fetch error:", colErr);
    }

    // 3. Fetch Pages & Articles (requires write_content scope)
    let pages = [];
    let articles = [];
    let contentScopeError = false;

    try {
      const pageRes = await admin.graphql(
        `#graphql
        query getPagesSeo {
          pages(first: 100) {
            edges {
              node {
                id
                title
                handle
                bodySummary
                seo {
                  title
                  description
                }
              }
            }
          }
        }`
      );
      const pageData = await pageRes.json();
      if (pageData?.errors?.some((e) => e.message?.toLowerCase().includes("access") || e.message?.toLowerCase().includes("scope"))) {
        contentScopeError = true;
      } else {
        pages = (pageData?.data?.pages?.edges || []).map((e) => ({
          id: e.node.id,
          title: e.node.title || "Untitled Page",
          handle: e.node.handle || "",
          bodySummary: e.node.bodySummary || "",
          seoTitle: e.node.seo?.title || "",
          seoDescription: e.node.seo?.description || "",
          hasCustomSeoTitle: Boolean(e.node.seo?.title?.trim()),
        }));
      }
    } catch (pageErr) {
      console.warn("Pages fetch error:", pageErr.message);
      contentScopeError = true;
    }

    try {
      const artRes = await admin.graphql(
        `#graphql
        query getArticlesSeo {
          articles(first: 100) {
            edges {
              node {
                id
                title
                handle
                summaryHtml
                blog {
                  title
                }
                image {
                  url
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
      const artData = await artRes.json();
      if (artData?.errors?.some((e) => e.message?.toLowerCase().includes("access") || e.message?.toLowerCase().includes("scope"))) {
        contentScopeError = true;
      } else {
        articles = (artData?.data?.articles?.edges || []).map((e) => ({
          id: e.node.id,
          title: e.node.title || "Untitled Article",
          handle: e.node.handle || "",
          summary: e.node.summaryHtml || "",
          blogTitle: e.node.blog?.title || "Blog",
          imageUrl: e.node.image?.url || null,
          seoTitle: e.node.seo?.title || "",
          seoDescription: e.node.seo?.description || "",
          hasCustomSeoTitle: Boolean(e.node.seo?.title?.trim()),
        }));
      }
    } catch (artErr) {
      console.warn("Articles fetch error:", artErr.message);
      contentScopeError = true;
    }

    return {
      shop: shopInfo,
      products,
      collections,
      pages,
      articles,
      contentScopeError,
      pagination: {
        currentPage,
        hasNextPage,
        hasPreviousPage,
        startCursor,
        endCursor,
        totalCount,
        totalPages,
      },
    };
  } catch (error) {
    console.error("Bulk optimizer loader error:", error);
    return {
      shop: { name: "Your Store" },
      products: [],
      collections: [],
      pages: [],
      articles: [],
      contentScopeError: false,
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }
};

export default function BulkOptimizer() {
  const loaderData = useLoaderData();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  const shop = loaderData?.shop || { name: "Your Store" };
  const collections = loaderData?.collections || [];
  const pages = loaderData?.pages || [];
  const articles = loaderData?.articles || [];
  const contentScopeError = loaderData?.contentScopeError || false;

  // Resource Switcher: "products" | "collections" | "pages" | "articles"
  const [activeResource, setActiveResource] = useState("products");

  const products = useMemo(() => loaderData?.products || [], [loaderData?.products]);
  const pagination = loaderData?.pagination || {
    currentPage: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
    totalCount: 0,
    totalPages: 0,
  };
  const isPageLoading = navigation.state === "loading";

  const [filter, setFilter] = useState("all"); // "all" | "missing-title" | "missing-desc" | "suboptimal"
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Reset selected IDs when page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [pagination.currentPage]);

  // AI settings
  const [tone, setTone] = useState("High-Converting");
  const [globalKeywords, setGlobalKeywords] = useState("");

  // Bulk execution states
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [proposedUpdates, setProposedUpdates] = useState({}); // { [productId]: { seoTitle, seoDescription } }
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);
  // pendingClearProposals: true = wait for revalidation to idle, then clear proposals
  const [pendingClearProposals, setPendingClearProposals] = useState(false);
  // savedProductData: local cache of what was just saved to Shopify (used for instant status update)
  const [savedProductData, setSavedProductData] = useState({});

  // When revalidation completes, clear proposals (so the freshly-loaded data shows "Optimized")
  useEffect(() => {
    if (revalidator.state === "idle" && pendingClearProposals) {
      setProposedUpdates({});
      setSelectedIds(new Set());
      setSavedProductData({});
      setPendingClearProposals(false);
    }
  }, [revalidator.state, pendingClearProposals]);

  // Sync Metafield Definition to Multiline Text
  const handleSyncMetafield = async () => {
    setIsSyncingMeta(true);
    try {
      const res = await fetch("/api/sync-metafield", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setToastMessage("✅ Target SEO Keywords definition successfully synced to multiline text!");
        revalidator.revalidate();
      } else {
        alert(
          data.result?.error ||
            "Shopify could not delete old definition automatically. If the definition is locked, go to Shopify Admin -> Settings -> Custom data -> Products -> Target SEO Keywords -> click Delete, then click this button again."
        );
      }
    } catch (e) {
      alert("Error contacting sync API: " + e.message);
    } finally {
      setIsSyncingMeta(false);
    }
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search filter
      if (searchQuery.trim() && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Status category filter
      // "Missing Title" means the product has no explicit custom SEO title set in Shopify
      const hasTitle = p.hasCustomSeoTitle;
      const hasDesc = Boolean(p.seoDescription?.trim());
      const isTitleOptimal = isTitleOk(p.seoTitle);
      const isDescOptimal = isDescOk(p.seoDescription);

      if (filter === "missing-title") return !hasTitle;
      if (filter === "missing-desc") return !hasDesc;
      if (filter === "missing-keywords") return !p.keywords || p.keywords.length === 0;
      if (filter === "suboptimal") return !isTitleOptimal || !isDescOptimal;
      if (filter === "optimized") return isTitleOptimal && isDescOptimal;
      return true;
    });
  }, [products, filter, searchQuery]);

  // Counts for pills - use pagination total count for overall stats
  const counts = useMemo(() => {
    const total = pagination.totalCount || products.length;
    // For page-level counts, use current products
    const pageMissingTitle = products.filter((p) => !p.hasCustomSeoTitle).length;
    const pageMissingDesc = products.filter((p) => !p.seoDescription?.trim()).length;
    const pageMissingKeywords = products.filter((p) => !p.keywords || p.keywords.length === 0).length;
    const pageSuboptimal = products.filter(
      (p) => !isTitleOk(p.seoTitle) || !isDescOk(p.seoDescription)
    ).length;
    const pageOptimized = products.length - pageSuboptimal;

    return {
      total,
      missingTitle: pageMissingTitle,
      missingDesc: pageMissingDesc,
      missingKeywords: pageMissingKeywords,
      suboptimal: pageSuboptimal,
      optimized: pageOptimized,
    };
  }, [products, pagination.totalCount]);

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

    const newProposals = { ...proposedUpdates };

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];

      // Simulate AI generation delay for realistic progress feel
      await new Promise((resolve) => setTimeout(resolve, 80));

      let productKeywords = kwList;
      if (productKeywords.length === 0) {
        if (p.keywords && p.keywords.length >= 3) {
          productKeywords = p.keywords;
        } else {
          productKeywords = extractKeywords({
            productTitle: p.title,
            productDescription: p.description,
          });
        }
      }

      const copy = generateSeoCopy({
        productTitle: p.title,
        productDescription: p.description,
        keywords: productKeywords,
        tone,
      });

      newProposals[p.id] = {
        seoTitle: copy.title,
        seoDescription: copy.description,
        keywords: copy.keywords || productKeywords || [],
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

  // Save all proposals to Shopify — saves ALL proposals (regardless of selection)
  const handleSaveBulkToShopify = async () => {
    // Build items from ALL proposals (not just selected ones)
    const itemsToSave = Object.entries(proposedUpdates)
      .filter(([, proposal]) => proposal.seoTitle)
      .map(([productId, proposal]) => ({
        productId,
        seoTitle: proposal.seoTitle,
        seoDescription: proposal.seoDescription || "",
        keywords: proposal.keywords || [],
      }));

    if (itemsToSave.length === 0) {
      alert("No proposals to save. Please generate AI SEO first.");
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
        if (data.keywordsCount > 0) {
          setToastMessage(
            `🎉 Saved ${data.updatedCount || itemsToSave.length} products with multiline target keywords to Shopify!`
          );
        } else if (itemsToSave.some((i) => i.keywords && i.keywords.length > 0)) {
          const reason =
            data.keywordsError ||
            (data.errors && data.errors[0]?.error) ||
            "Target SEO Keywords definition in your store is locked to single-line list.";
          alert(
            `⚠️ Partial Save: Saved ${data.updatedCount || itemsToSave.length} product titles & descriptions, but keywords could not be saved.\n\nReason: ${reason}\n\nTo fix:\n1. Open Shopify Admin → Settings → Custom data → Products\n2. Click "Target SEO Keywords" and click Delete\n3. Return here and click "Force Sync Metafield".`
          );
          setToastMessage(
            `⚠️ Titles & descriptions saved (${data.updatedCount || itemsToSave.length}), but keywords could not be saved.`
          );
        } else {
          setToastMessage(`🎉 Saved ${data.updatedCount || itemsToSave.length} products to Shopify! Refreshing status...`);
        }
        // Build a local cache of what was just saved so rows show "Optimized" immediately
        const justSaved = {};
        for (const item of itemsToSave) {
          justSaved[item.productId] = {
            seoTitle: item.seoTitle,
            seoDescription: item.seoDescription,
            keywords: item.keywords,
          };
        }
        setSavedProductData(justSaved);
        // Trigger revalidation — proposals stay visible until revalidation completes
        revalidator.revalidate();
        setPendingClearProposals(true);
        setIsBulkSaving(false);
      } else {
        alert(`Save failed: ${data.error || "Unknown error"}`);
        setIsBulkSaving(false);
      }
    } catch (err) {
      console.error("Bulk save error:", err);
      alert("Error saving updates to Shopify.");
      setIsBulkSaving(false);
    }
  };

  // Pagination handlers
  const handlePageChange = (newPage, cursor, direction) => {
    if (newPage < 1 || newPage > pagination.totalPages || isPageLoading) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("page", String(newPage));
    if (cursor && newPage > 1) {
      nextParams.set("cursor", cursor);
      nextParams.set("direction", direction);
    } else {
      nextParams.delete("cursor");
      nextParams.delete("direction");
    }
    navigate(`?${nextParams.toString()}`);
  };

  return (
    <s-page full-width heading="🚀 1-Click Bulk SEO Optimizer">
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        s-page {
          display: block;
          width: 100% !important;
          max-width: 100% !important;
        }
        s-section {
          display: block;
          width: 100% !important;
          max-width: 100% !important;
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto", padding: "0 12px", boxSizing: "border-box" }}>

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
            Please wait while we fetch your products
          </div>
        </div>
      )}

      {/* Navigation Breadcrumb & Back Link */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
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
            to="/app/image-alt-optimizer"
            style={{ background: "#f1f5f9", color: "#334155", padding: "6px 12px", borderRadius: "6px", textDecoration: "none", fontSize: "12px", fontWeight: "600" }}
          >
            🖼️ Image ALT Optimizer →
          </Link>
        </div>
      </div>

      {/* RESOURCE SWITCHER TABS */}
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
          onClick={() => setActiveResource("products")}
          style={{
            flex: "1 1 180px",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: activeResource === "products" ? "#ffffff" : "transparent",
            color: activeResource === "products" ? "#0f172a" : "#64748b",
            fontWeight: "800",
            fontSize: "13px",
            cursor: "pointer",
            boxShadow: activeResource === "products" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <span>📦</span> Products ({pagination.totalCount || products.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveResource("collections")}
          style={{
            flex: "1 1 180px",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: activeResource === "collections" ? "#ffffff" : "transparent",
            color: activeResource === "collections" ? "#0f172a" : "#64748b",
            fontWeight: "800",
            fontSize: "13px",
            cursor: "pointer",
            boxShadow: activeResource === "collections" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <span>📁</span> Collections ({collections.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveResource("pages")}
          style={{
            flex: "1 1 180px",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: activeResource === "pages" ? "#ffffff" : "transparent",
            color: activeResource === "pages" ? "#0f172a" : "#64748b",
            fontWeight: "800",
            fontSize: "13px",
            cursor: "pointer",
            boxShadow: activeResource === "pages" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <span>📄</span> Pages ({pages.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveResource("articles")}
          style={{
            flex: "1 1 180px",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: activeResource === "articles" ? "#ffffff" : "transparent",
            color: activeResource === "articles" ? "#0f172a" : "#64748b",
            fontWeight: "800",
            fontSize: "13px",
            cursor: "pointer",
            boxShadow: activeResource === "articles" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <span>📝</span> Blog Posts ({articles.length})
        </button>
      </div>

      {/* RESOURCE VIEW: PRODUCTS */}
      {activeResource === "products" && (
        <>
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
                {pagination.totalCount > 0
                  ? `Showing page ${pagination.currentPage} of ${pagination.totalPages} (${pagination.totalCount} total products)`
                  : "Select multiple products, generate Google-clamped meta tags in seconds, and batch publish."
                }
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSyncMetafield}
                disabled={isSyncingMeta}
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  border: "1px solid rgba(255, 255, 255, 0.3)",
                  color: "#ffffff",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: isSyncingMeta ? "wait" : "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              >
                {isSyncingMeta ? "⏳ Syncing..." : "🔄 Force Sync Metafield"}
              </button>

              <button
                onClick={handleStartBulkGeneration}
                disabled={isBulkGenerating || selectedIds.size === 0}
                style={{
                  background: selectedIds.size > 0 && !isBulkGenerating ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "#475569",
                  color: "#ffffff",
                  fontWeight: "700",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: selectedIds.size > 0 && !isBulkGenerating ? "pointer" : "not-allowed",
                  fontSize: "13px",
                  boxShadow: selectedIds.size > 0 && !isBulkGenerating ? "0 2px 10px rgba(16,185,129,0.35)" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {isBulkGenerating ? (
                  <>
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid #ffffff",
                        borderTop: "2px solid transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    Generating AI SEO...
                  </>
                ) : (
                  `⚡ Generate AI SEO (${selectedIds.size} Selected)`
                )}
              </button>

              {Object.keys(proposedUpdates).length > 0 && (
                <button
                  onClick={handleSaveBulkToShopify}
                  disabled={isBulkSaving}
                  style={{
                    background: isBulkSaving ? "#64748b" : "#0284c7",
                    color: "#ffffff",
                    fontWeight: "700",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: isBulkSaving ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    boxShadow: isBulkSaving ? "none" : "0 2px 10px rgba(2,132,199,0.35)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {isBulkSaving ? (
                    <>
                      <div
                        style={{
                          width: "16px",
                          height: "16px",
                          border: "2px solid #ffffff",
                          borderTop: "2px solid transparent",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      Saving to Shopify...
                    </>
                  ) : (
                    `💾 Save ${Object.keys(proposedUpdates).length} to Shopify`
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Tone & Keyword Settings */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", background: "rgba(255,255,255,0.05)", padding: "16px", borderRadius: "10px" }}>
            <div>
              <label htmlFor="brand-tone" style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px", color: "#cbd5e1" }}>
                Brand Tone:
              </label>
              <select
                id="brand-tone"
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
              <label htmlFor="target-keywords" style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px", color: "#cbd5e1" }}>
                Target Keywords (Optional):
              </label>
              <input
                id="target-keywords"
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

      {/* Short Format Theme Snippet Helper Banner */}
      <s-section>
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "10px",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>🌐</span>
            <div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#166534" }}>
                Display Keywords in SEO Extensions (Detailed SEO, SEO Meta in 1-Click)
              </div>
              <div style={{ fontSize: "12px", color: "#15803d", marginTop: "2px" }}>
                Shopify themes natively show SEO Title & Description. Add a 1-line snippet to also show Keywords.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                const snippet = `{%- if template.name == 'product' and product.metafields.seo.keywords.value != blank -%}\n  {%- assign seo_kw = product.metafields.seo.keywords.value -%}\n  {%- if seo_kw.first -%}\n    <meta name="keywords" content="{{ seo_kw | join: ', ' | strip | escape }}">\n  {%- else -%}\n    <meta name="keywords" content="{{ seo_kw | strip | escape }}">\n  {%- endif -%}\n{%- endif -%}`;
                navigator.clipboard.writeText(snippet);
                setCopiedSnippet(true);
                setToastMessage("📋 Liquid snippet copied to clipboard!");
                setTimeout(() => setCopiedSnippet(false), 3000);
              }}
              style={{
                background: copiedSnippet ? "#16a34a" : "#008060",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "7px 14px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s ease",
              }}
            >
              {copiedSnippet ? "✅ Copied!" : "📋 Copy Theme Code"}
            </button>
            <Link
              to="/app#theme-setup"
              style={{
                fontSize: "12px",
                fontWeight: "700",
                color: "#166534",
                background: "#ffffff",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #86efac",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>📖 View Setup Guide in Dashboard</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </s-section>

      {/* Filter Chips & Selection Bar */}
      <s-section>
        <div
          style={{
            background: "#ffffff",
            padding: "12px 18px",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {[
              { id: "all", label: "All Products", count: `${products.length} of ${pagination.totalCount}` },
              { id: "missing-title", label: "Missing Title", count: counts.missingTitle, icon: "⚠️" },
              { id: "missing-desc", label: "Missing Description", count: counts.missingDesc, icon: "📝" },
              { id: "missing-keywords", label: "Missing Keywords", count: counts.missingKeywords, icon: "🏷️" },
              { id: "suboptimal", label: "Needs Review", count: counts.suboptimal, icon: "🟡" },
              { id: "optimized", label: "Optimized", count: counts.optimized, icon: "✅" },
            ].map((tab) => {
              const isActive = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "20px",
                    border: isActive ? "1.5px solid #008060" : "1px solid #e2e8f0",
                    background: isActive ? "#ecfdf5" : "#f8fafc",
                    color: isActive ? "#065f46" : "#334155",
                    fontSize: "12px",
                    fontWeight: isActive ? "700" : "500",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.icon && <span style={{ fontSize: "12px" }}>{tab.icon}</span>}
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "1px 6px",
                      borderRadius: "10px",
                      background: isActive ? "#10b981" : "#e2e8f0",
                      color: isActive ? "#ffffff" : "#475569",
                      fontWeight: "700",
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Field */}
          <div style={{ position: "relative", minWidth: "240px", flex: "1", maxWidth: "320px" }}>
            <input
              type="text"
              placeholder="🔍 Search products by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                background: "#ffffff",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", padding: "12px 16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <div style={{ fontSize: "13px", color: "#6d7175", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Page <strong>{pagination.currentPage}</strong> of <strong>{pagination.totalPages}</strong></span>
              <span>({pagination.totalCount} total products)</span>
              {isPageLoading && <span style={{ color: "#008060", fontWeight: "600" }}>• Loading...</span>}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => handlePageChange(pagination.currentPage - 1, pagination.startCursor, "prev")}
                disabled={!pagination.hasPreviousPage || isPageLoading}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #c9cccf",
                  background: pagination.hasPreviousPage && !isPageLoading ? "#ffffff" : "#f1f2f3",
                  color: pagination.hasPreviousPage && !isPageLoading ? "#202223" : "#9aa0a6",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: pagination.hasPreviousPage && !isPageLoading ? "pointer" : "not-allowed",
                  boxShadow: pagination.hasPreviousPage && !isPageLoading ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                }}
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(pagination.currentPage + 1, pagination.endCursor, "next")}
                disabled={!pagination.hasNextPage || isPageLoading}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #c9cccf",
                  background: pagination.hasNextPage && !isPageLoading ? "#ffffff" : "#f1f2f3",
                  color: pagination.hasNextPage && !isPageLoading ? "#202223" : "#9aa0a6",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: pagination.hasNextPage && !isPageLoading ? "pointer" : "not-allowed",
                  boxShadow: pagination.hasNextPage && !isPageLoading ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
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
              {selectedIds.size} of {products.length} (this page) selected for bulk action
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #e2e8f0", color: "#475569", textAlign: "left", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  <th style={{ padding: "12px 14px", width: "40px" }}></th>
                  <th style={{ padding: "12px 14px", width: "20%" }}>Product</th>
                  <th style={{ padding: "12px 14px", width: "24%" }}>SEO Title</th>
                  <th style={{ padding: "12px 14px", width: "26%" }}>Meta Description</th>
                  <th style={{ padding: "12px 14px", width: "22%" }}>Target Keywords</th>
                  <th style={{ padding: "12px 14px", width: "8%", textAlign: "right" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  const proposal = proposedUpdates[p.id];
                  // justSaved: data we just wrote to Shopify (exists during revalidation delay)
                  const justSaved = savedProductData[p.id];
                  // Effective data: proposal > just-saved > loader data (stale)
                  const effectiveSeoTitle = proposal ? proposal.seoTitle : (justSaved ? justSaved.seoTitle : p.seoTitle);
                  const effectiveSeoDesc = proposal ? proposal.seoDescription : (justSaved ? justSaved.seoDescription : p.seoDescription);
                  const effectiveHasCustomTitle = proposal ? true : (justSaved ? true : p.hasCustomSeoTitle);

                  const titleToDisplay = effectiveSeoTitle;
                  const descToDisplay = effectiveSeoDesc;

                  const titleLen = titleToDisplay.length;
                  const descLen = descToDisplay.length;
                  // isTitleGood: has a custom SEO title explicitly set AND within char limits
                  const isTitleGood = effectiveHasCustomTitle && isTitleOk(effectiveSeoTitle);
                  const isDescGood = isDescOk(descToDisplay);

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

                      {/* Product Info (Title & Handle only - no duplicate keywords) */}
                      <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                        <div style={{ fontWeight: "700", color: "#0f172a", fontSize: "13px", lineHeight: "1.35", marginBottom: "4px" }}>
                          {p.title}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          Handle: <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: "3px" }}>{p.handle}</code>
                        </div>

                        {proposal && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              marginTop: "8px",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              background: "#dcfce7",
                              color: "#15803d",
                              fontSize: "10px",
                              fontWeight: "700",
                              border: "1px solid #bbf7d0",
                            }}
                          >
                            ✨ AI Proposal Ready
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
                                padding: "8px 10px",
                                borderRadius: "6px",
                                border: `1.5px solid ${isTitleGood ? "#108043" : "#d9381e"}`,
                                fontSize: "12px",
                                boxSizing: "border-box",
                                background: "#ffffff",
                                color: "#0f172a",
                              }}
                            />
                            <div style={{ fontSize: "11px", marginTop: "4px", color: isTitleGood ? "#108043" : "#b7791f", fontWeight: "600" }}>
                              {titleLen}/{TITLE_MAX} chars {isTitleGood ? "✓ Within limit" : `(max ${TITLE_MAX})`}
                            </div>
                          </div>
                        ) : (
                          <div>
                            {effectiveHasCustomTitle ? (
                              <>
                                <div style={{ color: "#0f172a", fontSize: "12px", fontWeight: "500", lineHeight: "1.4" }}>
                                  {effectiveSeoTitle}
                                </div>
                                <div style={{ fontSize: "11px", color: isTitleOk(effectiveSeoTitle) ? "#108043" : "#6d7175", marginTop: "4px", fontWeight: "500" }}>
                                  {effectiveSeoTitle.length} chars {isTitleOk(effectiveSeoTitle) ? "✓" : ""}
                                </div>
                              </>
                            ) : (
                              <div style={{ color: "#d9381e", fontSize: "12px", fontWeight: "600" }}>
                                ⚠️ Missing Custom SEO Title
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
                                padding: "8px 10px",
                                borderRadius: "6px",
                                border: `1.5px solid ${isDescGood ? "#108043" : "#d9381e"}`,
                                fontSize: "12px",
                                boxSizing: "border-box",
                                fontFamily: "inherit",
                                background: "#ffffff",
                                color: "#0f172a",
                              }}
                            />
                            <div style={{ fontSize: "11px", marginTop: "4px", color: isDescGood ? "#108043" : "#b7791f", fontWeight: "600" }}>
                              {descLen}/{DESC_MAX} chars {isDescGood ? "✓ Within limit" : `(max ${DESC_MAX})`}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ color: p.seoDescription ? "#334155" : "#d9381e", fontSize: "12px", lineHeight: "1.4" }}>
                              {p.seoDescription ? `${p.seoDescription.slice(0, 85)}${p.seoDescription.length > 85 ? "..." : ""}` : "⚠️ Missing Meta Description"}
                            </div>
                            {p.seoDescription && (
                              <div style={{ fontSize: "11px", color: isDescGood ? "#108043" : "#6d7175", marginTop: "4px", fontWeight: "500" }}>
                                {p.seoDescription.length} chars {isDescGood ? "✓" : ""}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Target Keywords (Editable if proposed) */}
                      <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                        {proposal ? (
                          <div>
                            <textarea
                              rows={2}
                              value={Array.isArray(proposal.keywords) ? proposal.keywords.join(", ") : String(proposal.keywords || "")}
                              onChange={(e) => {
                                const list = e.target.value.split(",").map((k) => k.trim()).filter(Boolean);
                                handleEditProposal(p.id, "keywords", list);
                              }}
                              placeholder="comma, separated, keywords..."
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                border: "1.5px solid #0284c7",
                                background: "#f0f9ff",
                                fontSize: "12px",
                                boxSizing: "border-box",
                                fontFamily: "inherit",
                                color: "#0f172a",
                              }}
                            />
                            <div style={{ fontSize: "11px", marginTop: "4px", color: "#0284c7", fontWeight: "600" }}>
                              🏷️ {(proposal.keywords || []).length} keywords &bull; comma-separated
                            </div>
                          </div>
                        ) : (
                          <div>
                            {p.keywords && p.keywords.length > 0 ? (
                              <div>
                                <div style={{ color: "#334155", fontSize: "12px", lineHeight: "1.4", fontWeight: "500" }}>
                                  {p.keywords.join(", ")}
                                </div>
                                <div style={{ fontSize: "11px", color: "#0284c7", marginTop: "4px", fontWeight: "600" }}>
                                  ✓ {p.keywords.length} keywords saved
                                </div>
                              </div>
                            ) : (
                              <div style={{ color: "#d9381e", fontSize: "12px", fontWeight: "600" }}>
                                ⚠️ Missing Keywords
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "12px 14px", verticalAlign: "top", textAlign: "right" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: proposal
                              ? "#e0f2fe"
                              : isTitleGood && isDescGood
                              ? "#ecfdf5"
                              : "#fffbeb",
                            color: proposal
                              ? "#0369a1"
                              : isTitleGood && isDescGood
                              ? "#065f46"
                              : "#b45309",
                            border: proposal
                              ? "1px solid #bae6fd"
                              : isTitleGood && isDescGood
                              ? "1px solid #a7f3d0"
                              : "1px solid #fde68a",
                          }}
                        >
                          {proposal ? "Ready" : isTitleGood && isDescGood ? "Optimized" : "Needs SEO"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid #e1e3e5", background: "#f9fafb" }}>
              <div style={{ fontSize: "13px", color: "#6d7175" }}>
                Showing page <strong>{pagination.currentPage}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.totalCount} total products)
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => handlePageChange(pagination.currentPage - 1, pagination.startCursor, "prev")}
                  disabled={!pagination.hasPreviousPage || isPageLoading}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    background: pagination.hasPreviousPage && !isPageLoading ? "#ffffff" : "#f1f2f3",
                    color: pagination.hasPreviousPage && !isPageLoading ? "#202223" : "#9aa0a6",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: pagination.hasPreviousPage && !isPageLoading ? "pointer" : "not-allowed",
                  }}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(pagination.currentPage + 1, pagination.endCursor, "next")}
                  disabled={!pagination.hasNextPage || isPageLoading}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    background: pagination.hasNextPage && !isPageLoading ? "#ffffff" : "#f1f2f3",
                    color: pagination.hasNextPage && !isPageLoading ? "#202223" : "#9aa0a6",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: pagination.hasNextPage && !isPageLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </s-section>
      </>
      )}

      {/* RESOURCE VIEW: COLLECTIONS */}
      {activeResource === "collections" && (
        <BulkCollectionsView
          collections={collections}
          storeName={shop.name}
          onNotify={setToastMessage}
        />
      )}

      {/* RESOURCE VIEW: PAGES */}
      {activeResource === "pages" && (
        <BulkPagesView
          pages={pages}
          storeName={shop.name}
          contentScopeError={contentScopeError}
          onNotify={setToastMessage}
        />
      )}

      {/* RESOURCE VIEW: BLOG ARTICLES */}
      {activeResource === "articles" && (
        <BulkArticlesView
          articles={articles}
          storeName={shop.name}
          contentScopeError={contentScopeError}
          onNotify={setToastMessage}
        />
      )}
      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return null;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
