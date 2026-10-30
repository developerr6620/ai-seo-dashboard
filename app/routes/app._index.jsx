/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useEffect, useCallback } from "react";
import { useLoaderData, Link, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getStoreAuditStats } from "../lib/storeAudit.server";
import { ensureKeywordsMetafieldDefinition } from "../lib/metafieldDefinitions.server";
import {
  IconBox,
  IconFolder,
  IconFileText,
  IconArticle,
  IconImage,
  IconRocket,
  IconGlobe,
  IconTag,
  IconRefresh,
  IconCheckCircle,
  IconAlertTriangle,
  IconArrowRight,
} from "../components/Icons";


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
      const pRes = await admin.graphql(
        `#graphql
        query getPagesSeo {
          pages(first: 100) {
            edges {
              node {
                id
                title
                seoTitle: metafield(namespace: "global", key: "title_tag") {
                  value
                }
                seoTitleMetafield: metafield(namespace: "seo", key: "title") {
                  value
                }
                seoDesc: metafield(namespace: "global", key: "description_tag") {
                  value
                }
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                  value
                }
              }
            }
          }
        }`
      );
      const pData = await pRes.json();
      if (pData?.errors?.some((e) => {
        const msg = (e.message || "").toLowerCase();
        return msg.includes("write_content") || msg.includes("read_content") || (msg.includes("access") && !msg.includes("field"));
      })) {
        contentScopeError = true;
      } else if (pData?.data?.pages?.edges) {
        pageSeoData = pData.data.pages.edges.map((e) => {
          const rawTitle = e.node.seoTitle?.value || e.node.seoTitleMetafield?.value || "";
          const rawDesc = e.node.seoDesc?.value || "";
          const effectiveTitle = rawTitle || (rawDesc ? (e.node.title?.length <= 50 ? e.node.title : e.node.title?.slice(0, 50)) : "");
          return {
            id: e.node.id,
            title: e.node.title || "Untitled Page",
            seo: {
              title: effectiveTitle,
              description: rawDesc,
            },
            keywordsMetafield: e.node.keywordsMetafield,
          };
        });
        pagesCount = pageSeoData.length;
      }
    } catch (e) {
      console.warn("Pages fetch error:", e);
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("write_content") || msg.includes("read_content") || (msg.includes("access") && !msg.includes("field"))) {
        contentScopeError = true;
      }
    }

    // 5. Fetch articles SEO
    try {
      const aRes = await admin.graphql(
        `#graphql
        query getArticlesSeo {
          articles(first: 100) {
            edges {
              node {
                id
                title
                seoTitle: metafield(namespace: "global", key: "title_tag") {
                  value
                }
                seoTitleMetafield: metafield(namespace: "seo", key: "title") {
                  value
                }
                seoDesc: metafield(namespace: "global", key: "description_tag") {
                  value
                }
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                  value
                }
              }
            }
          }
        }`
      );
      const aData = await aRes.json();
      if (aData?.errors?.some((e) => {
        const msg = (e.message || "").toLowerCase();
        return msg.includes("write_content") || msg.includes("read_content") || (msg.includes("access") && !msg.includes("field"));
      })) {
        contentScopeError = true;
      } else if (aData?.data?.articles?.edges) {
        articleSeoData = aData.data.articles.edges.map((e) => {
          const rawTitle = e.node.seoTitle?.value || e.node.seoTitleMetafield?.value || "";
          const rawDesc = e.node.seoDesc?.value || "";
          const effectiveTitle = rawTitle || (rawDesc ? (e.node.title?.length <= 50 ? e.node.title : e.node.title?.slice(0, 50)) : "");
          return {
            id: e.node.id,
            title: e.node.title || "Untitled Article",
            seo: {
              title: effectiveTitle,
              description: rawDesc,
            },
            keywordsMetafield: e.node.keywordsMetafield,
          };
        });
        articlesCount = articleSeoData.length;
      }
    } catch (e) {
      console.warn("Articles fetch error:", e);
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("write_content") || msg.includes("read_content") || (msg.includes("access") && !msg.includes("field"))) {
        contentScopeError = true;
      }
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
      clientId: process.env.SHOPIFY_API_KEY || "cdeb2fd429e5b0cceb3d43906b7f2148",
      appUrl: process.env.SHOPIFY_APP_URL || "https://seooptimizer.zooq.app",
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
      clientId: process.env.SHOPIFY_API_KEY || "cdeb2fd429e5b0cceb3d43906b7f2148",
      appUrl: process.env.SHOPIFY_APP_URL || "https://seooptimizer.zooq.app",
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
    clientId = "",
    appUrl = "https://seooptimizer.zooq.app",
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

  const pagesCount = initialPagesCount;
  const articlesCount = initialArticlesCount;
  const [dashToast, setDashToast] = useState(null);

  const reauthUrl = shopDomain ? `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId || "cdeb2fd429e5b0cceb3d43906b7f2148"}&scope=write_products,write_files,write_content&redirect_uri=${encodeURIComponent((appUrl || "https://seooptimizer.zooq.app") + "/auth/callback")}` : "#";

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
        .hub-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .hub-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08) !important;
          border-color: #cbd5e1 !important;
        }
        .action-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .action-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25) !important;
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
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <IconRefresh size={13} color="#166534" spinning={true} /> Auditing catalog live...
            </div>
          </div>
        </s-section>
      )}

      {/* Store Overview Banner */}
      <s-section>
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            borderRadius: "14px",
            padding: "28px 32px",
            color: "#ffffff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "20px",
            boxShadow: "0 4px 20px rgba(15, 23, 42, 0.15)",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              Connected Shopify Store
            </div>
            <div style={{ fontSize: "26px", fontWeight: "800", marginBottom: "8px", color: "#f8fafc" }}>
              {shop.name}
            </div>
            <div style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "6px", display: "flex", alignItems: "center", gap: "7px" }}>
              <IconGlobe size={15} color="#94a3b8" /> {shop.domain}
            </div>
            <div style={{ fontSize: "13px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <IconBox size={14} color="#94a3b8" /> <strong>{totalCatalog.toLocaleString()}</strong> Products in catalog
              </span>
              <span>•</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <IconTag size={14} color="#94a3b8" /> {shop.plan} Plan
              </span>
            </div>

            {/* Audit Actions & Timestamp */}
            <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleTriggerReAudit}
                disabled={isAuditing || isTriggering}
                style={{
                  background: isAuditing ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.15)",
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                  color: "#ffffff",
                  borderRadius: "8px",
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: isAuditing || isTriggering ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  transition: "all 0.2s ease",
                }}
              >
                <IconRefresh size={14} color="#ffffff" spinning={isAuditing} />
                <span>{isAuditing ? "Scanning Catalog..." : isTriggering ? "Starting..." : "Re-scan Full Catalog"}</span>
              </button>
              {lastAudit && (
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                  Last audited: {new Date(lastAudit).toLocaleDateString()} {new Date(lastAudit).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>

          {/* Overall SEO Score Ring */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.07)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "14px",
              padding: "20px 28px",
              textAlign: "center",
              minWidth: "170px",
            }}
          >
            <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "6px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              Store SEO Health
            </div>
            <div
              style={{
                fontSize: "52px",
                fontWeight: "900",
                lineHeight: 1,
                color: globalSeoScore >= 80 ? "#4ade80" : globalSeoScore >= 50 ? "#fbbf24" : "#f87171",
              }}
            >
              {globalSeoScore}
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: "700" }}>/ 100</div>
            <div
              style={{
                fontSize: "11px",
                marginTop: "8px",
                fontWeight: "700",
                padding: "3px 10px",
                borderRadius: "20px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: globalSeoScore >= 80 ? "rgba(74, 222, 128, 0.15)" : globalSeoScore >= 50 ? "rgba(251, 191, 36, 0.15)" : "rgba(248, 113, 113, 0.15)",
                color: globalSeoScore >= 80 ? "#4ade80" : globalSeoScore >= 50 ? "#fbbf24" : "#f87171",
              }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentColor" }} />
              {globalSeoScore >= 80 ? "Optimal Health" : globalSeoScore >= 50 ? "Needs Optimization" : "Critical Gaps"}
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
              padding: "16px 20px",
              color: "#92400e",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <IconAlertTriangle size={24} color="#d97706" />
              <div>
                <div style={{ fontWeight: "800", fontSize: "14px", color: "#78350f" }}>
                  Action Required: Shopify Content Permission Pending
                </div>
                <div style={{ marginTop: "2px", color: "#92400e", fontSize: "12px" }}>
                  To access and optimize Pages and Blog Articles, please grant updated content permissions.
                </div>
              </div>
            </div>
            <a
              href={reauthUrl}
              target="_top"
              style={{
                background: "#b45309",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "8px",
                fontWeight: "700",
                textDecoration: "none",
                fontSize: "12px",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              Grant Permission <IconArrowRight size={13} />
            </a>
          </div>
        </s-section>
      )}

      {/* Storewide Catalog Hub */}
      <s-section heading="Storewide SEO Catalog Hub">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Products */}
          <div
            className="hub-card"
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconBox size={22} color="#0284c7" />
                </div>
                <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "3px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: "800" }}>
                  PRODUCTS
                </span>
              </div>
              <div style={{ fontSize: "30px", fontWeight: "900", color: "#0f172a", marginTop: "12px" }}>
                {totalCatalog.toLocaleString()}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                Store Catalog Products
              </div>
            </div>
            <Link
              to="/app/bulk-optimizer?resource=products"
              style={{
                background: "#f8fafc",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                padding: "9px 14px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "12px",
                textDecoration: "none",
                textAlign: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              Bulk Optimize Products <IconArrowRight size={13} />
            </Link>
          </div>

          {/* Collections */}
          <div
            className="hub-card"
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconFolder size={22} color="#d97706" />
                </div>
                <span style={{ background: "#fef3c7", color: "#92400e", padding: "3px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: "800" }}>
                  COLLECTIONS
                </span>
              </div>
              <div style={{ fontSize: "30px", fontWeight: "900", color: "#0f172a", marginTop: "12px" }}>
                {collectionsCount.toLocaleString()}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                Category Collections
              </div>
            </div>
            <Link
              to="/app/bulk-optimizer?resource=collections"
              style={{
                background: "#f8fafc",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                padding: "9px 14px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "12px",
                textDecoration: "none",
                textAlign: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              Bulk Optimize Collections <IconArrowRight size={13} />
            </Link>
          </div>

          {/* Store Pages */}
          <div
            className="hub-card"
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#faf5ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconFileText size={22} color="#7c3aed" />
                </div>
                <span style={{ background: "#ede9fe", color: "#5b21b6", padding: "3px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: "800" }}>
                  PAGES
                </span>
              </div>
              <div style={{ fontSize: "30px", fontWeight: "900", color: "#0f172a", marginTop: "12px" }}>
                {pagesCount.toLocaleString()}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                Content Pages (About, FAQ, Policies)
              </div>
            </div>
            <Link
              to="/app/bulk-optimizer?resource=pages"
              style={{
                background: "#f8fafc",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                padding: "9px 14px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "12px",
                textDecoration: "none",
                textAlign: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              Bulk Optimize Pages <IconArrowRight size={13} />
            </Link>
          </div>

          {/* Blog Articles */}
          <div
            className="hub-card"
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#f0fdfa", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconArticle size={22} color="#0f766e" />
                </div>
                <span style={{ background: "#ccfbf1", color: "#0f766e", padding: "3px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: "800" }}>
                  BLOG POSTS
                </span>
              </div>
              <div style={{ fontSize: "30px", fontWeight: "900", color: "#0f172a", marginTop: "12px" }}>
                {articlesCount.toLocaleString()}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                Editorial Blog Posts & Guides
              </div>
            </div>
            <Link
              to="/app/bulk-optimizer?resource=articles"
              style={{
                background: "#f8fafc",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                padding: "9px 14px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "12px",
                textDecoration: "none",
                textAlign: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              Bulk Optimize Articles <IconArrowRight size={13} />
            </Link>
          </div>
        </div>
      </s-section>

      {/* Comprehensive SEO Score Breakdown */}
      <s-section heading="SEO Score Breakdown by Resource">
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div
            style={{
              background: "#0f172a",
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
                Weighted evaluation: Products (35%) · Collections (20%) · Pages (20%) · Blog Articles (15%) · Alt Tags (10%)
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
              <span
                style={{
                  fontSize: "44px",
                  fontWeight: "900",
                  color: globalSeoScore >= 80 ? "#4ade80" : globalSeoScore >= 50 ? "#fbbf24" : "#f87171",
                  lineHeight: 1,
                }}
              >
                {globalSeoScore}
              </span>
              <span style={{ fontSize: "16px", color: "#64748b", fontWeight: "700" }}>/100</span>
            </div>
          </div>

          {/* Category rows */}
          <div style={{ padding: "4px 0" }}>
            {[
              {
                label: "Products",
                icon: <IconBox size={16} color="#0284c7" />,
                weight: "35 pts",
                data: seoBreakdown?.products,
                color: "#0284c7",
                link: "/app/bulk-optimizer?resource=products",
              },
              {
                label: "Collections",
                icon: <IconFolder size={16} color="#d97706" />,
                weight: "20 pts",
                data: seoBreakdown?.collections,
                color: "#d97706",
                link: "/app/bulk-optimizer?resource=collections",
              },
              {
                label: "Store Pages",
                icon: <IconFileText size={16} color="#7c3aed" />,
                weight: "20 pts",
                data: seoBreakdown?.pages,
                color: "#7c3aed",
                link: "/app/bulk-optimizer?resource=pages",
              },
              {
                label: "Blog Articles",
                icon: <IconArticle size={16} color="#0e7490" />,
                weight: "15 pts",
                data: seoBreakdown?.articles,
                color: "#0e7490",
                link: "/app/bulk-optimizer?resource=articles",
              },
            ].map(({ label, icon, weight, data, color, link }) => {
              const score = data?.score ?? null;
              const n = data?.total ?? 0;
              return (
                <div
                  key={label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "170px 1fr 110px 90px",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 24px",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {icon}
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>{label}</div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>Weight: {weight}</div>
                    </div>
                  </div>
                  <div>
                    {score !== null ? (
                      <>
                        <div style={{ height: "7px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", marginBottom: "5px" }}>
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
                          fontSize: "20px",
                          fontWeight: "900",
                          color: score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626",
                        }}
                      >
                        {score}
                        <span style={{ fontSize: "11px", fontWeight: "600", color: "#94a3b8" }}>/100</span>
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
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        fontSize: "11px",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      Optimize <IconArrowRight size={11} />
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
                    gridTemplateColumns: "170px 1fr 110px 90px",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 24px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <IconImage size={16} color="#059669" />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>Image Alt Tags</div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>Weight: 10 pts</div>
                    </div>
                  </div>
                  <div>
                    {score !== null ? (
                      <>
                        <div style={{ height: "7px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", marginBottom: "5px" }}>
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
                          fontSize: "20px",
                          fontWeight: "900",
                          color: score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626",
                        }}
                      >
                        {score}
                        <span style={{ fontSize: "11px", fontWeight: "600", color: "#94a3b8" }}>/100</span>
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
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        fontSize: "11px",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      Optimize <IconArrowRight size={11} />
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </s-section>

      {/* Quick Actions & Health Gaps */}
      <s-section heading="Optimization Tools & Catalog Alerts">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {/* SEO Bulk Optimizer */}
          <Link to="/app/bulk-optimizer" style={{ textDecoration: "none" }}>
            <div
              className="action-card"
              style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                borderRadius: "12px",
                padding: "24px",
                cursor: "pointer",
                color: "#ffffff",
                boxShadow: "0 4px 14px rgba(15, 23, 42, 0.2)",
                border: "1px solid rgba(255,255,255,0.08)",
                height: "100%",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                  <IconRocket size={22} color="#34d399" />
                </div>
                <div style={{ fontSize: "16px", fontWeight: "800", marginBottom: "6px", color: "#f8fafc" }}>SEO Bulk Optimizer</div>
                <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.45" }}>
                  Batch generate and save meta titles, descriptions, and keywords across products, collections, pages, and blogs.
                </div>
              </div>
              <div style={{ marginTop: "16px", fontSize: "12px", fontWeight: "700", color: "#34d399", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                Launch Bulk Tool <IconArrowRight size={13} />
              </div>
            </div>
          </Link>

          {/* Image ALT Text Optimizer */}
          <Link to="/app/image-alt-optimizer" style={{ textDecoration: "none" }}>
            <div
              className="action-card"
              style={{
                background: "linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)",
                borderRadius: "12px",
                padding: "24px",
                cursor: "pointer",
                color: "#ffffff",
                boxShadow: "0 4px 14px rgba(30, 64, 175, 0.25)",
                border: "1px solid rgba(255,255,255,0.12)",
                height: "100%",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                  <IconImage size={22} color="#93c5fd" />
                </div>
                <div style={{ fontSize: "16px", fontWeight: "800", marginBottom: "6px", color: "#f8fafc" }}>Image ALT Optimizer</div>
                <div style={{ fontSize: "13px", color: "#bfdbfe", lineHeight: "1.45" }}>
                  Audit product images and store media to generate descriptive, accessibility-compliant alt texts with 1 click.
                </div>
              </div>
              <div style={{ marginTop: "16px", fontSize: "12px", fontWeight: "700", color: "#93c5fd", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                Optimize Images Now <IconArrowRight size={13} />
              </div>
            </div>
          </Link>

          {/* Title Status Card */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              border: `1.5px solid ${missingTitles > 0 ? "#fecaca" : "#bbf7d0"}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: missingTitles > 0 ? "#fee2e2" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                {missingTitles > 0 ? <IconAlertTriangle size={22} color="#dc2626" /> : <IconCheckCircle size={22} color="#16a34a" />}
              </div>
              <div style={{ fontSize: "16px", fontWeight: "800", marginBottom: "6px", color: missingTitles > 0 ? "#991b1b" : "#166534" }}>
                {missingTitles > 0 ? "Title Gaps Detected" : "All Titles Complete"}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.45" }}>
                {missingTitles > 0
                  ? `${missingTitles.toLocaleString()} products are currently missing SEO meta titles.`
                  : "Every product in your catalog has an SEO title set."}
              </div>
            </div>
            {missingTitles > 0 && (
              <Link
                to="/app/bulk-optimizer?resource=products"
                style={{
                  marginTop: "16px",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#dc2626",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Resolve Missing Titles <IconArrowRight size={12} />
              </Link>
            )}
          </div>

          {/* Meta Description Status Card */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              border: `1.5px solid ${missingDescriptions > 0 ? "#fed7aa" : "#bbf7d0"}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: missingDescriptions > 0 ? "#ffedd5" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                {missingDescriptions > 0 ? <IconAlertTriangle size={22} color="#d97706" /> : <IconCheckCircle size={22} color="#16a34a" />}
              </div>
              <div style={{ fontSize: "16px", fontWeight: "800", marginBottom: "6px", color: missingDescriptions > 0 ? "#9a3412" : "#166534" }}>
                {missingDescriptions > 0 ? "Description Gaps" : "All Descriptions Complete"}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.45" }}>
                {missingDescriptions > 0
                  ? `${missingDescriptions.toLocaleString()} products missing meta descriptions.`
                  : "All products have meta descriptions set for search engines."}
              </div>
            </div>
            {missingDescriptions > 0 && (
              <Link
                to="/app/bulk-optimizer?resource=products"
                style={{
                  marginTop: "16px",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#d97706",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Resolve Missing Descriptions <IconArrowRight size={12} />
              </Link>
            )}
          </div>
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
