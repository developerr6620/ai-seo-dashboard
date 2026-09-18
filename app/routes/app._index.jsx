/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useEffect, useCallback } from "react";
import { useLoaderData, Link, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getStoreAuditStats } from "../lib/storeAudit.server";
import { ensureKeywordsMetafieldDefinition } from "../lib/metafieldDefinitions.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopName = session?.shop || "";

  // Guarantee that the Target SEO Keywords definition is registered & pinned in Shopify
  await ensureKeywordsMetafieldDefinition(admin, shopName);

  // Helper: compute category score 0–100 (title=40%, desc=35%, keywords=25%)
  function catScore(items) {
    const n = items.length;
    if (n === 0) return null; // null = no items, excluded from global score
    const withTitle = items.filter((i) => i.seo?.title?.trim()).length;
    const withDesc = items.filter((i) => i.seo?.description?.trim()).length;
    const withKw = items.filter((i) => {
      const v = i.keywordsMetafield?.value;
      return Boolean(v && v.trim().length > 0 && v !== "[]" && v !== '""');
    }).length;
    const score = Math.round(((withTitle / n) * 40 + (withDesc / n) * 35 + (withKw / n) * 25));
    return { score, total: n, withTitle, withDesc, withKw };
  }

  try {
    // 1. Fetch store info, products with SEO + images alt, collections, pages, articles
    const response = await admin.graphql(
      `#graphql
      query getDashboardData {
        shop {
          name
          myshopifyDomain
          email
          plan {
            displayName
          }
        }
        productsCount(limit: null) {
          count
        }
        products(first: 250) {
          edges {
            node {
              id
              title
              seo {
                title
                description
              }
              keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                value
              }
              images(first: 10) {
                edges {
                  node {
                    id
                    altText
                  }
                }
              }
            }
          }
        }
      }`
    );

    const data = await response.json();
    const shop = data?.data?.shop || {};
    const totalProducts = data?.data?.productsCount?.count || 0;
    const sampleProducts = data?.data?.products?.edges?.map((e) => e.node) || [];

    // 2. Retrieve catalog audit metrics (product-focused existing system)
    const currentShop = shopName || shop.myshopifyDomain || "default-store";
    const auditResult = await getStoreAuditStats(admin, currentShop, totalProducts, sampleProducts);

    // 3. Fetch collections SEO
    let collectionsCount = 0;
    let collectionSeoData = [];
    try {
      const colRes = await admin.graphql(`
        query getCollectionsSeo {
          collections(first: 100) {
            edges {
              node {
                id
                seo { title description }
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") { value }
              }
            }
          }
        }
      `);
      const colData = await colRes.json();
      collectionSeoData = colData?.data?.collections?.edges?.map((e) => e.node) || [];
      collectionsCount = collectionSeoData.length;
    } catch (e) {
      console.warn("Collections SEO fetch error:", e);
    }

    // 4. Fetch pages SEO
    let pagesCount = 0;
    let pageSeoData = [];
    let articlesCount = 0;
    let articleSeoData = [];
    let contentScopeError = false;
    try {
      const pRes = await admin.graphql(`
        query getPagesSeo {
          pages(first: 100) {
            edges {
              node {
                id
                seo { title description }
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") { value }
              }
            }
          }
        }
      `);
      const pData = await pRes.json();
      if (pData?.errors?.some((e) => e.message?.toLowerCase().includes("access") || e.message?.toLowerCase().includes("scope"))) {
        contentScopeError = true;
      } else {
        pageSeoData = pData?.data?.pages?.edges?.map((e) => e.node) || [];
        pagesCount = pageSeoData.length;
      }
    } catch (e) {
      contentScopeError = true;
    }

    // 5. Fetch articles SEO
    try {
      const aRes = await admin.graphql(`
        query getArticlesSeo {
          articles(first: 100) {
            edges {
              node {
                id
                seo { title description }
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") { value }
              }
            }
          }
        }
      `);
      const aData = await aRes.json();
      if (aData?.errors?.some((e) => e.message?.toLowerCase().includes("access") || e.message?.toLowerCase().includes("scope"))) {
        contentScopeError = true;
      } else {
        articleSeoData = aData?.data?.articles?.edges?.map((e) => e.node) || [];
        articlesCount = articleSeoData.length;
      }
    } catch (e) {
      contentScopeError = true;
    }

    // 6. Compute per-category SEO scores
    const productCat = catScore(sampleProducts);
    const collectionCat = catScore(collectionSeoData);
    const pageCat = catScore(pageSeoData);
    const articleCat = catScore(articleSeoData);

    // Alt tag score: ratio of images with alt text across all products
    let totalImages = 0;
    let imagesWithAlt = 0;
    for (const p of sampleProducts) {
      const imgs = p.images?.edges?.map((e) => e.node) || [];
      totalImages += imgs.length;
      imagesWithAlt += imgs.filter((img) => img.altText && img.altText.trim().length > 0).length;
    }
    const altScore = totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : null;

    // 7. Weighted global score (weights: products 35, collections 20, pages 20, articles 15, alt 10)
    const weights = [
      { cat: productCat, weight: 35 },
      { cat: collectionCat, weight: 20 },
      { cat: pageCat, weight: 20 },
      { cat: articleCat, weight: 15 },
      { cat: altScore !== null ? { score: altScore } : null, weight: 10 },
    ];
    const activeCats = weights.filter((w) => w.cat !== null);
    let globalSeoScore = 0;
    if (activeCats.length > 0) {
      const totalWeight = activeCats.reduce((sum, w) => sum + w.weight, 0);
      globalSeoScore = Math.round(
        activeCats.reduce((sum, w) => sum + (w.cat.score * w.weight), 0) / totalWeight
      );
    }

    return {
      shop: {
        name: shop.name || "Your Store",
        domain: shop.myshopifyDomain || shopName || "",
        email: shop.email || "",
        plan: shop.plan?.displayName || "Shopify",
      },
      stats: auditResult.stats,
      isAuditing: auditResult.isAuditing,
      lastAuditedAt: auditResult.lastAuditedAt,
      allProductsCount: totalProducts,
      collectionsCount,
      pagesCount,
      articlesCount,
      contentScopeError,
      shopDomain: shop.myshopifyDomain || shopName,
      clientId: "cdeb2fd429e5b0cceb3d43906b7f2148",
      // Global comprehensive score
      globalSeoScore,
      seoBreakdown: {
        products: productCat,
        collections: collectionCat,
        pages: pageCat,
        articles: articleCat,
        altTags: altScore !== null ? { score: altScore, totalImages, imagesWithAlt } : null,
      },
    };
  } catch (error) {
    console.error("Dashboard loader error:", error);
    return {
      shop: { name: "Your Store", domain: "", email: "", plan: "Shopify" },
      stats: {
        totalProducts: 0,
        withSeoTitle: 0,
        withSeoDesc: 0,
        withOptimalTitle: 0,
        missingTitle: 0,
        missingDesc: 0,
        titleCoveragePct: 0,
        descCoveragePct: 0,
        optimalTitlePct: 0,
        seoScore: 0,
      },
      isAuditing: false,
      lastAuditedAt: null,
      allProductsCount: 0,
      collectionsCount: 0,
      pagesCount: 0,
      articlesCount: 0,
      contentScopeError: false,
      shopDomain: "",
      clientId: "cdeb2fd429e5b0cceb3d43906b7f2148",
      globalSeoScore: 0,
      seoBreakdown: { products: null, collections: null, pages: null, articles: null, altTags: null },
    };
  }
};

export default function Dashboard() {
  const {
    shop,
    stats: initialStats,
    allProductsCount,
    collectionsCount = 0,
    pagesCount: initialPagesCount = 0,
    articlesCount: initialArticlesCount = 0,
    contentScopeError = false,
    shopDomain = "",
    clientId = "cdeb2fd429e5b0cceb3d43906b7f2148",
    isAuditing: initialIsAuditing,
    lastAuditedAt: initialLastAudit,
    globalSeoScore: initialGlobalScore = 0,
    seoBreakdown: initialBreakdown = {},
  } = useLoaderData();
  const navigation = useNavigation();
  const isPageLoading = navigation.state === "loading";

  const [stats, setStats] = useState(initialStats);
  const [isAuditing, setIsAuditing] = useState(initialIsAuditing);
  const [lastAudit, setLastAudit] = useState(initialLastAudit);
  const [isTriggering, setIsTriggering] = useState(false);
  const globalSeoScore = initialGlobalScore;
  const seoBreakdown = initialBreakdown;

  const [pagesCount, setPagesCount] = useState(initialPagesCount);
  const [articlesCount, setArticlesCount] = useState(initialArticlesCount);
  const [isCreatingPages, setIsCreatingPages] = useState(false);
  const [isCreatingArticle, setIsCreatingArticle] = useState(false);
  const [dashToast, setDashToast] = useState(null);

  const reauthUrl = `https://${shopDomain || "develops-test-store.myshopify.com"}/admin/oauth/authorize?client_id=${clientId || "cdeb2fd429e5b0cceb3d43906b7f2148"}&scope=write_products,write_metaobjects,write_metaobject_definitions,write_files,write_content&redirect_uri=${encodeURIComponent("https://ai-seo-dashboard.onrender.com/auth/callback")}`;

  const handleCreateStarterPages = async () => {
    setIsCreatingPages(true);
    try {
      const res = await fetch("/api/create-starter-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName: shop.name }),
      });
      const data = await res.json();
      if (data.success && data.pages?.length > 0) {
        setPagesCount((prev) => prev + data.pages.length);
        setDashToast(`🎉 Successfully created ${data.pages.length} essential SEO pages in Shopify!`);
      } else {
        setDashToast(`⚠️ ${data.error || "Could not create pages"}`);
      }
    } catch (err) {
      setDashToast(`⚠️ Error: ${err.message}`);
    } finally {
      setIsCreatingPages(false);
      setTimeout(() => setDashToast(null), 5000);
    }
  };

  const handleCreateStarterArticle = async () => {
    setIsCreatingArticle(true);
    try {
      const res = await fetch("/api/create-starter-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType: "article", storeName: shop.name }),
      });
      const data = await res.json();
      if (data.success && data.articles?.length > 0) {
        setArticlesCount((prev) => prev + data.articles.length);
        setDashToast(`🎉 Successfully created starter blog article in Shopify!`);
      } else {
        setDashToast(`⚠️ ${data.error || "Could not create article"}`);
      }
    } catch (err) {
      setDashToast(`⚠️ Error: ${err.message}`);
    } finally {
      setIsCreatingArticle(false);
      setTimeout(() => setDashToast(null), 5000);
    }
  };

  // Poll for audit completion if background scan is in progress
  useEffect(() => {
    if (!isAuditing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/store-audit");
        const json = await res.json();
        if (json.success) {
          if (json.stats) {
            setStats(json.stats);
          }
          if (!json.isAuditing) {
            setIsAuditing(false);
            if (json.lastAuditedAt) {
              setLastAudit(json.lastAuditedAt);
            }
          }
        }
      } catch (err) {
        console.warn("Polling audit status failed:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isAuditing]);

  // Trigger manual catalog re-scan
  const handleTriggerReAudit = useCallback(async () => {
    if (isAuditing || isTriggering) return;
    setIsTriggering(true);
    try {
      const res = await fetch("/api/store-audit", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setIsAuditing(true);
      }
    } catch (err) {
      console.error("Failed to trigger re-audit:", err);
    } finally {
      setIsTriggering(false);
    }
  }, [isAuditing, isTriggering]);

  const totalCatalog = allProductsCount || stats.totalProducts || 0;
  const missingTitles = stats.missingTitle;
  const missingDescriptions = stats.missingDesc;

  return (
    <s-page full-width heading={`Welcome, ${shop.name}`}>
      <style>{`
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
      {/* Background Audit Progress Banner */}
      {isAuditing && (
        <s-section>
          <div
            style={{
              background: "linear-gradient(90deg, #f0fdf4 0%, #dcfce7 100%)",
              border: "1.5px solid #22c55e",
              borderRadius: "12px",
              padding: "16px 22px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              boxShadow: "0 4px 12px rgba(34, 197, 94, 0.15)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  border: "3px solid #bbf7d0",
                  borderTop: "3px solid #16a34a",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              <div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#166534" }}>
                  Full Catalog SEO Audit in Progress
                </div>
                <div style={{ fontSize: "12px", color: "#15803d", marginTop: "2px" }}>
                  Analyzing all {totalCatalog.toLocaleString()} products in your store. Stats will refresh automatically once completed.
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: "700",
                color: "#166534",
                background: "#ffffff",
                padding: "6px 14px",
                borderRadius: "20px",
                border: "1px solid #86efac",
              }}
            >
              Auditing catalog live...
            </div>
          </div>
        </s-section>
      )}

      {/* Store Overview Banner */}
      <s-section>
        <div
          style={{
            background: "linear-gradient(135deg, #008060 0%, #004c3f 100%)",
            borderRadius: "14px",
            padding: "32px",
            color: "#ffffff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", opacity: 0.8, marginBottom: "4px", fontWeight: "500", letterSpacing: "0.5px" }}>
              CONNECTED SHOPIFY STORE
            </div>
            <div style={{ fontSize: "26px", fontWeight: "800", marginBottom: "6px" }}>
              {shop.name}
            </div>
            <div style={{ fontSize: "14px", opacity: 0.85, marginBottom: "4px" }}>
              🌐 {shop.domain}
            </div>
            <div style={{ fontSize: "13px", opacity: 0.85 }}>
              📦 <strong>{totalCatalog.toLocaleString()}</strong> Products in catalog &nbsp;|&nbsp; 🏷️ {shop.plan} Plan
            </div>

            {/* Audit Actions & Timestamp */}
            <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleTriggerReAudit}
                disabled={isAuditing || isTriggering}
                style={{
                  background: isAuditing ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.22)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  color: "#ffffff",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: isAuditing || isTriggering ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "background 0.2s ease",
                }}
              >
                <span>{isAuditing ? "⏳ Scanning Catalog..." : isTriggering ? "Starting..." : "🔄 Re-scan Full Catalog"}</span>
              </button>
              {lastAudit && (
                <span style={{ fontSize: "11px", opacity: 0.85 }}>
                  Last audited: {new Date(lastAudit).toLocaleDateString()} {new Date(lastAudit).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>

          {/* Overall SEO Score Ring */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.12)",
              borderRadius: "14px",
              padding: "20px 28px",
              textAlign: "center",
              backdropFilter: "blur(10px)",
              minWidth: "160px",
            }}
          >
            <div style={{ fontSize: "12px", opacity: 0.9, marginBottom: "6px", fontWeight: "700", letterSpacing: "0.5px" }}>
              STORE SEO HEALTH
            </div>
            <div style={{ fontSize: "52px", fontWeight: "900", lineHeight: 1 }}>
              {globalSeoScore}
            </div>
            <div style={{ fontSize: "13px", opacity: 0.85 }}>/ 100</div>
            <div style={{ fontSize: "12px", marginTop: "6px", fontWeight: "600" }}>
              {globalSeoScore >= 80 ? "🟢 Excellent" : globalSeoScore >= 50 ? "🟡 Needs Work" : "🔴 Critical"}
            </div>
            <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.8 }}>
              Products · Collections · Pages · Blogs · Alt Tags
            </div>
          </div>
        </div>
      </s-section>

      {/* Scope Warning Banner if write_content is pending */}
      {contentScopeError && (
        <s-section>
          <div
            style={{
              background: "#fffbeb",
              border: "1.5px solid #fde68a",
              borderRadius: "12px",
              padding: "18px 22px",
              color: "#92400e",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "14px",
              boxShadow: "0 2px 8px rgba(251, 191, 36, 0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "26px" }}>⚠️</span>
              <div>
                <div style={{ fontWeight: "800", fontSize: "15px", color: "#78350f" }}>
                  Action Required: Shopify Content Permission Pending
                </div>
                <div style={{ marginTop: "2px", color: "#92400e", fontSize: "13px" }}>
                  To access, audit, and optimize Online Store Pages and Blog Articles, please grant the updated content permission in Shopify.
                </div>
              </div>
            </div>
            <a
              href={reauthUrl}
              target="_top"
              style={{
                background: "linear-gradient(135deg, #b45309 0%, #92400e 100%)",
                color: "#ffffff",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "700",
                textDecoration: "none",
                fontSize: "13px",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(180, 83, 9, 0.35)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🔑 Grant Permission in Shopify →
            </a>
          </div>
        </s-section>
      )}

      {/* Toast Notification */}
      {dashToast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: "#1e293b",
            color: "#ffffff",
            padding: "14px 22px",
            borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            zIndex: 9999,
            fontSize: "14px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span>{dashToast}</span>
        </div>
      )}

      {/* Multi-Resource Hub */}
      <s-section heading="🚀 Storewide SEO Catalog Hub">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Products */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "28px" }}>📦</span>
                <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "800" }}>
                  PRODUCTS
                </span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
                {totalCatalog.toLocaleString()}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                Store Catalog Products
              </div>
            </div>
            <Link
              to="/app/bulk-optimizer?resource=products"
              style={{
                background: "#f1f5f9",
                color: "#0f172a",
                padding: "8px 14px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "12px",
                textDecoration: "none",
                textAlign: "center",
                display: "block",
              }}
            >
              ⚡ Bulk Optimize Products →
            </Link>
          </div>

          {/* Collections */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "28px" }}>📁</span>
                <span style={{ background: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "800" }}>
                  COLLECTIONS
                </span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
                {collectionsCount.toLocaleString()}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                Category Collections
              </div>
            </div>
            <Link
              to="/app/bulk-optimizer?resource=collections"
              style={{
                background: "#f1f5f9",
                color: "#0f172a",
                padding: "8px 14px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "12px",
                textDecoration: "none",
                textAlign: "center",
                display: "block",
              }}
            >
              ⚡ Bulk Optimize Collections →
            </Link>
          </div>

          {/* Store Pages */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "28px" }}>📄</span>
                <span style={{ background: "#ede9fe", color: "#5b21b6", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "800" }}>
                  STORE PAGES
                </span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
                {pagesCount}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                {pagesCount > 0 ? "Content Pages (About, Contact, FAQ)" : "0 Pages in Shopify"}
              </div>
            </div>
            {pagesCount > 0 ? (
              <Link
                to="/app/bulk-optimizer?resource=pages"
                style={{
                  background: "#4338ca",
                  color: "#ffffff",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontWeight: "700",
                  fontSize: "12px",
                  textDecoration: "none",
                  textAlign: "center",
                  display: "block",
                }}
              >
                ⚡ Bulk Optimize Pages →
              </Link>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <button
                  type="button"
                  disabled={isCreatingPages}
                  onClick={handleCreateStarterPages}
                  style={{
                    background: "linear-gradient(135deg, #4338ca 0%, #3730a3 100%)",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    fontWeight: "700",
                    fontSize: "12px",
                    cursor: isCreatingPages ? "wait" : "pointer",
                    textAlign: "center",
                  }}
                >
                  {isCreatingPages ? "⏳ Creating Pages..." : "⚡ 1-Click: Create Essential Pages"}
                </button>
                <Link
                  to="/app/bulk-optimizer?resource=pages"
                  style={{
                    color: "#4338ca",
                    fontSize: "11px",
                    fontWeight: "600",
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  View in Bulk Optimizer →
                </Link>
              </div>
            )}
          </div>

          {/* Blog Articles */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "28px" }}>📝</span>
                <span style={{ background: "#ccfbf1", color: "#0f766e", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "800" }}>
                  BLOG POSTS
                </span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
                {articlesCount}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                {articlesCount > 0 ? "Editorial Blog Articles" : "0 Blog Articles in Shopify"}
              </div>
            </div>
            {articlesCount > 0 ? (
              <Link
                to="/app/bulk-optimizer?resource=articles"
                style={{
                  background: "#0e7490",
                  color: "#ffffff",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontWeight: "700",
                  fontSize: "12px",
                  textDecoration: "none",
                  textAlign: "center",
                  display: "block",
                }}
              >
                ⚡ Bulk Optimize Articles →
              </Link>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <button
                  type="button"
                  disabled={isCreatingArticle}
                  onClick={handleCreateStarterArticle}
                  style={{
                    background: "linear-gradient(135deg, #0e7490 0%, #0369a1 100%)",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    fontWeight: "700",
                    fontSize: "12px",
                    cursor: isCreatingArticle ? "wait" : "pointer",
                    textAlign: "center",
                  }}
                >
                  {isCreatingArticle ? "⏳ Creating Article..." : "⚡ 1-Click: Create Starter Article"}
                </button>
                <Link
                  to="/app/bulk-optimizer?resource=articles"
                  style={{
                    color: "#0e7490",
                    fontSize: "11px",
                    fontWeight: "600",
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  View in Bulk Optimizer →
                </Link>
              </div>
            )}
          </div>
        </div>
      </s-section>

      {/* 4 Stats Cards Row */}
      <s-section heading="📊 SEO Performance Overview">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Total Products */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "15px" }}>📦</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#202223" }}>
              {totalCatalog.toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "10px" }}>Total Catalog Products</div>
            <div style={{ fontSize: "11px", color: "#008060", marginTop: "4px", fontWeight: "600" }}>
              Full Store Catalog
            </div>
          </div>

          {/* With SEO Title */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "15px" }}>🏷️</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#108043" }}>
              {stats.withSeoTitle.toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "10px" }}>Have SEO Title</div>
            {missingTitles > 0 ? (
              <div style={{ fontSize: "11px", color: "#d9381e", marginTop: "4px", fontWeight: "600" }}>
                ⚠️ {missingTitles.toLocaleString()} missing (from {totalCatalog.toLocaleString()})
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "#108043", marginTop: "4px", fontWeight: "600" }}>
                ✓ All {totalCatalog.toLocaleString()} products have titles
              </div>
            )}
          </div>

          {/* With Meta Description */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "15px" }}>📝</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#108043" }}>
              {stats.withSeoDesc.toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "10px" }}>Have Meta Description</div>
            {missingDescriptions > 0 ? (
              <div style={{ fontSize: "11px", color: "#d9381e", marginTop: "4px", fontWeight: "600" }}>
                ⚠️ {missingDescriptions.toLocaleString()} missing (from {totalCatalog.toLocaleString()})
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "#108043", marginTop: "4px", fontWeight: "600" }}>
                ✓ All {totalCatalog.toLocaleString()} products have descriptions
              </div>
            )}
          </div>

          {/* Target Keywords */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "15px" }}>🏷️</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#0284c7" }}>
              {(stats.withKeywords || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "10px" }}>Have Target Keywords</div>
            {(stats.missingKeywords || 0) > 0 ? (
              <div style={{ fontSize: "11px", color: "#d9381e", marginTop: "4px", fontWeight: "600" }}>
                ⚠️ {(stats.missingKeywords || 0).toLocaleString()} missing (from {totalCatalog.toLocaleString()})
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "#108043", marginTop: "4px", fontWeight: "600" }}>
                ✓ All {totalCatalog.toLocaleString()} products have keywords
              </div>
            )}
          </div>

          {/* Optimal Length */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "15px" }}>🎯</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#008060" }}>
              {stats.withOptimalTitle.toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "10px" }}>Perfect SEO Length</div>
            <div style={{ fontSize: "11px", color: "#6d7175", marginTop: "4px" }}>
              (title ≤ 50 chars) &bull; {stats.optimalTitlePct}% of catalog
            </div>
          </div>
        </div>
      </s-section>

      {/* Comprehensive SEO Score Breakdown */}
      <s-section heading="🎯 SEO Score Breakdown — All Resources">
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              padding: "18px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ fontSize: "15px", fontWeight: "800", color: "#ffffff" }}>
                Overall Store SEO Health Score
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                Weighted across Products · Collections · Pages · Blog Articles · Alt Tags
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
              <span
                style={{
                  fontSize: "48px",
                  fontWeight: "900",
                  color: globalSeoScore >= 80 ? "#4ade80" : globalSeoScore >= 50 ? "#fbbf24" : "#f87171",
                  lineHeight: 1,
                }}
              >
                {globalSeoScore}
              </span>
              <span style={{ fontSize: "18px", color: "#64748b", fontWeight: "700" }}>/100</span>
            </div>
          </div>

          {/* Category rows */}
          <div style={{ padding: "8px 0" }}>
            {[
              {
                label: "📦 Products",
                weight: "35 pts",
                data: seoBreakdown?.products,
                color: "#0284c7",
                link: "/app/bulk-optimizer?resource=products",
              },
              {
                label: "📁 Collections",
                weight: "20 pts",
                data: seoBreakdown?.collections,
                color: "#d97706",
                link: "/app/bulk-optimizer?resource=collections",
              },
              {
                label: "📄 Pages",
                weight: "20 pts",
                data: seoBreakdown?.pages,
                color: "#7c3aed",
                link: "/app/bulk-optimizer?resource=pages",
              },
              {
                label: "📝 Blog Articles",
                weight: "15 pts",
                data: seoBreakdown?.articles,
                color: "#0e7490",
                link: "/app/bulk-optimizer?resource=articles",
              },
            ].map(({ label, weight, data, color, link }) => {
              const score = data?.score ?? null;
              const n = data?.total ?? 0;
              return (
                <div
                  key={label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr 120px 80px",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 24px",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>{label}</div>
                    <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>Weight: {weight}</div>
                  </div>
                  <div>
                    {score !== null ? (
                      <>
                        <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", marginBottom: "5px" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${score}%`,
                              background: score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444",
                              borderRadius: "4px",
                              transition: "width 0.5s ease",
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          {n} item{n !== 1 ? "s" : ""} · Title: {data.withTitle}/{n} · Desc: {data.withDesc}/{n} · Keywords: {data.withKw}/{n}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>No items found</div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {score !== null ? (
                      <span
                        style={{
                          fontSize: "22px",
                          fontWeight: "900",
                          color: score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626",
                        }}
                      >
                        {score}
                        <span style={{ fontSize: "12px", fontWeight: "600", color: "#94a3b8" }}>/100</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: "13px", color: "#cbd5e1" }}>—</span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Link
                      to={link}
                      style={{
                        background: color,
                        color: "#ffffff",
                        padding: "5px 10px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        fontSize: "11px",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      Fix →
                    </Link>
                  </div>
                </div>
              );
            })}

            {/* Alt Tags row */}
            {(() => {
              const altData = seoBreakdown?.altTags;
              const score = altData?.score ?? null;
              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr 120px 80px",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 24px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>🖼️ Image Alt Tags</div>
                    <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>Weight: 10 pts</div>
                  </div>
                  <div>
                    {score !== null ? (
                      <>
                        <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", marginBottom: "5px" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${score}%`,
                              background: score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444",
                              borderRadius: "4px",
                              transition: "width 0.5s ease",
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          {altData.imagesWithAlt} of {altData.totalImages} product images have alt text
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>No product images found</div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {score !== null ? (
                      <span
                        style={{
                          fontSize: "22px",
                          fontWeight: "900",
                          color: score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626",
                        }}
                      >
                        {score}
                        <span style={{ fontSize: "12px", fontWeight: "600", color: "#94a3b8" }}>/100</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: "13px", color: "#cbd5e1" }}>—</span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Link
                      to="/app/image-alt-optimizer"
                      style={{
                        background: "#059669",
                        color: "#ffffff",
                        padding: "5px 10px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        fontSize: "11px",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      Fix →
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </s-section>

      {/* SEO Progress Bars */}
      <s-section heading="📈 SEO Coverage Breakdown">
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            border: "1px solid #e1e3e5",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "13px", color: "#166534" }}>
              ℹ️ <strong>Catalog Scope:</strong> Accurate real-time measurements across all <strong>{totalCatalog.toLocaleString()}</strong> products in your store.
            </div>
            <Link
              to="/app/bulk-optimizer"
              style={{
                fontSize: "12px",
                fontWeight: "700",
                color: "#15803d",
                textDecoration: "underline",
              }}
            >
              Browse & Optimize All Pages in Bulk Optimizer →
            </Link>
          </div>

          {/* Title Coverage */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#202223" }}>🏷️ SEO Title Coverage</span>
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#108043" }}>
                {stats.titleCoveragePct}%
              </span>
            </div>
            <div style={{ background: "#f1f2f3", borderRadius: "8px", height: "10px", overflow: "hidden" }}>
              <div
                style={{
                  background: "#008060",
                  height: "100%",
                  borderRadius: "8px",
                  width: `${stats.titleCoveragePct}%`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "4px" }}>
              {stats.withSeoTitle.toLocaleString()} of {totalCatalog.toLocaleString()} products have SEO title
            </div>
          </div>

          {/* Description Coverage */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#202223" }}>📝 Meta Description Coverage</span>
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#108043" }}>
                {stats.descCoveragePct}%
              </span>
            </div>
            <div style={{ background: "#f1f2f3", borderRadius: "8px", height: "10px", overflow: "hidden" }}>
              <div
                style={{
                  background: "#5c6ac4",
                  height: "100%",
                  borderRadius: "8px",
                  width: `${stats.descCoveragePct}%`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "4px" }}>
              {stats.withSeoDesc.toLocaleString()} of {totalCatalog.toLocaleString()} products have meta description
            </div>
          </div>

          {/* Target Keywords Coverage */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#202223" }}>🎯 Target Keywords Coverage</span>
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#0284c7" }}>
                {stats.keywordCoveragePct || 0}%
              </span>
            </div>
            <div style={{ background: "#f1f2f3", borderRadius: "8px", height: "10px", overflow: "hidden" }}>
              <div
                style={{
                  background: "#0284c7",
                  height: "100%",
                  borderRadius: "8px",
                  width: `${stats.keywordCoveragePct || 0}%`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "4px" }}>
              {(stats.withKeywords || 0).toLocaleString()} of {totalCatalog.toLocaleString()} products have target keywords
            </div>
          </div>

          {/* Optimal Title Length Coverage */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#202223" }}>📏 Title Within Limit (≤ 50 chars)</span>
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#108043" }}>
                {stats.optimalTitlePct}%
              </span>
            </div>
            <div style={{ background: "#f1f2f3", borderRadius: "8px", height: "10px", overflow: "hidden" }}>
              <div
                style={{
                  background: "#f49342",
                  height: "100%",
                  borderRadius: "8px",
                  width: `${stats.optimalTitlePct}%`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "4px" }}>
              {stats.withOptimalTitle.toLocaleString()} of {totalCatalog.toLocaleString()} products have perfectly sized titles
            </div>
          </div>
        </div>
      </s-section>

      {/* Quick Actions */}
      <s-section heading="🚀 Quick Actions">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {/* 1-Click Bulk Optimizer */}
          <Link to="/app/bulk-optimizer" style={{ textDecoration: "none" }}>
            <button
              type="button"
              style={{
                background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                borderRadius: "12px",
                padding: "24px",
                cursor: "pointer",
                color: "#ffffff",
                boxShadow: "0 4px 16px rgba(15, 23, 42, 0.4)",
                border: "1px solid rgba(255,255,255,0.1)",
                position: "relative",
                overflow: "hidden",
                width: "100%",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>🚀</div>
              <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "6px" }}>1-Click Bulk Optimizer</div>
              <div style={{ fontSize: "13px", opacity: 0.85, lineHeight: "1.4" }}>
                Batch optimize products at once with live progress and side-by-side review.
              </div>
              <div style={{ marginTop: "12px", fontSize: "13px", fontWeight: "600", color: "#34d399" }}>
                Launch Bulk Tool →
              </div>
            </button>
          </Link>

          {/* Start Single SEO Optimizer */}
          <Link to="/app/seo-optimizer" style={{ textDecoration: "none" }}>
            <button
              type="button"
              style={{
                background: "linear-gradient(135deg, #008060, #004c3f)",
                borderRadius: "12px",
                padding: "24px",
                cursor: "pointer",
                color: "#ffffff",
                boxShadow: "0 4px 12px rgba(0,128,96,0.3)",
                border: "none",
                width: "100%",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>⚡</div>
              <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "6px" }}>Single Optimizer</div>
              <div style={{ fontSize: "13px", opacity: 0.85 }}>
                Fine-tune titles & descriptions one-by-one with Google SERP preview.
              </div>
              <div style={{ marginTop: "12px", fontSize: "13px", fontWeight: "600", opacity: 0.9 }}>
                Open Single Tool →
              </div>
            </button>
          </Link>

          {/* Image ALT Text Optimizer */}
          <Link to="/app/image-alt-optimizer" style={{ textDecoration: "none" }}>
            <button
              type="button"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
                borderRadius: "12px",
                padding: "24px",
                cursor: "pointer",
                color: "#ffffff",
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                border: "1px solid rgba(255,255,255,0.15)",
                width: "100%",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>🖼️</div>
              <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "6px" }}>Image ALT Optimizer</div>
              <div style={{ fontSize: "13px", opacity: 0.85, lineHeight: "1.4" }}>
                AI-generate and bulk-apply descriptive, accessible ALT text for product images.
              </div>
              <div style={{ marginTop: "12px", fontSize: "13px", fontWeight: "600", color: "#93c5fd" }}>
                Optimize Images Now →
              </div>
            </button>
          </Link>

          {/* Missing SEO Alert */}
          <div
            style={{
              background: missingTitles > 0 ? "#fbeae5" : "#e3f8e0",
              borderRadius: "12px",
              padding: "24px",
              border: `1.5px solid ${missingTitles > 0 ? "#d9381e" : "#108043"}`,
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>
              {missingTitles > 0 ? "🚨" : "✅"}
            </div>
            <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "6px", color: missingTitles > 0 ? "#d9381e" : "#108043" }}>
              {missingTitles > 0 ? "SEO Gaps Detected" : "All Titles Complete!"}
            </div>
            <div style={{ fontSize: "13px", color: "#4a4a4a" }}>
              {missingTitles > 0
                ? `${missingTitles.toLocaleString()} products are missing SEO titles. Use the optimizer to fix them now.`
                : "All your products have SEO titles. Check meta descriptions next!"}
            </div>
          </div>

          {/* Meta Desc Alert */}
          <div
            style={{
              background: missingDescriptions > 0 ? "#fff4e5" : "#e3f8e0",
              borderRadius: "12px",
              padding: "24px",
              border: `1.5px solid ${missingDescriptions > 0 ? "#b7791f" : "#108043"}`,
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>
              {missingDescriptions > 0 ? "⚠️" : "✅"}
            </div>
            <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "6px", color: missingDescriptions > 0 ? "#b7791f" : "#108043" }}>
              {missingDescriptions > 0 ? "Meta Gaps Detected" : "All Descriptions Set!"}
            </div>
            <div style={{ fontSize: "13px", color: "#4a4a4a" }}>
              {missingDescriptions > 0
                ? `${missingDescriptions.toLocaleString()} products missing meta descriptions. Click SEO Optimizer to fix.`
                : "All your products have meta descriptions. Great SEO coverage!"}
            </div>
          </div>
        </div>
      </s-section>



      {/* How It Works */}
      <s-section heading="How It Works">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          {[
            { step: "1", icon: "🔍", title: "Search & Select", desc: "Find any product from your store catalog using the live search field." },
            { step: "2", icon: "🤖", title: "Generate AI SEO", desc: "Choose a tone, add optional keywords, and let AI generate 1 optimized title and meta description instantly." },
            { step: "3", icon: "✏️", title: "Review & Tweak", desc: "Preview the Google snippet, adjust the text if needed, and confirm the SEO score is green." },
            { step: "4", icon: "💾", title: "Save to Shopify", desc: "One click publishes your optimized SEO directly to your Shopify product catalog." },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                padding: "20px",
                border: "1px solid #e1e3e5",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "26px", marginBottom: "10px" }}>{item.icon}</div>
              <div
                style={{
                  background: "#008060",
                  color: "#ffffff",
                  borderRadius: "50%",
                  width: "22px",
                  height: "22px",
                  fontSize: "12px",
                  fontWeight: "800",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "10px",
                }}
              >
                {item.step}
              </div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#202223", marginBottom: "6px" }}>
                {item.title}
              </div>
              <div style={{ fontSize: "13px", color: "#616161", lineHeight: "1.5" }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
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
            Loading Dashboard...
          </div>
          <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "4px" }}>
            Please wait while we analyze your store SEO
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
