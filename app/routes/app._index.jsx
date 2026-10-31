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
  IconRefresh,
  IconClock,
  IconCheckCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconSparkles,
  IconTrendingUp,
  IconStore,
  IconInfo,
  IconEdit,
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

    // 2. Retrieve catalog audit metrics
    const currentShop = shopName || shop.myshopifyDomain || "default-store";
    const auditResult = await getStoreAuditStats(admin, currentShop, totalProducts, sampleProducts);

    // 3. Fetch collections SEO & banners
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
                image {
                  url
                  altText
                }
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

    // Alt tag score: evaluate product images and collection banner images
    let totalImages = 0;
    let imagesWithAlt = 0;
    for (const p of sampleProducts) {
      const imgs = p.images?.edges?.map((e) => e.node) || [];
      totalImages += imgs.length;
      imagesWithAlt += imgs.filter((img) => img.altText && img.altText.trim().length > 0).length;
    }
    for (const c of collectionSeoData) {
      if (c.image?.url) {
        totalImages += 1;
        if (c.image?.altText && c.image.altText.trim().length > 0) {
          imagesWithAlt += 1;
        }
      }
    }
    const altScore = totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 100;

    // 7. Weighted global score
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
      stats: { total: 0, withTitle: 0, withDescription: 0, withBoth: 0, missingTitle: 0, missingDescription: 0, score: 0 },
      isAuditing: false,
      lastAuditedAt: null,
      allProductsCount: 0,
      collectionsCount: 0,
      pagesCount: 0,
      articlesCount: 0,
      contentScopeError: false,
      shopDomain: "",
      clientId: "",
      appUrl: "",
      globalSeoScore: 0,
      seoBreakdown: {},
    };
  }
};

export default function Dashboard() {
  const {
    shop,
    stats,
    isAuditing: initialIsAuditing,
    lastAuditedAt,
    allProductsCount,
    collectionsCount,
    pagesCount,
    articlesCount,
    contentScopeError,
    shopDomain,
    clientId,
    appUrl,
    globalSeoScore,
    seoBreakdown,
  } = useLoaderData();

  const navigation = useNavigation();
  const isPageLoading = navigation.state === "loading";

  const [isAuditing, setIsAuditing] = useState(initialIsAuditing);
  const [lastAudit, setLastAudit] = useState(lastAuditedAt);
  const [isTriggering, setIsTriggering] = useState(false);

  // Poll audit status if background audit is active
  useEffect(() => {
    if (!isAuditing) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/store-audit");
        const json = await res.json();
        if (json.success) {
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
  const missingTitles = stats.missingTitle || 0;
  const missingDescriptions = stats.missingDesc || 0;

  const reauthUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId}&scope=write_products,write_files,write_content&redirect_uri=${encodeURIComponent(`${appUrl}/auth/callback`)}`;

  // Full 360-degree circular gauge calculations (radius 40, perimeter 2 * PI * 40 ≈ 251.33)
  const circleRadius = 40;
  const circleCircumference = 2 * Math.PI * circleRadius; // ~251.327
  const strokeOffset = circleCircumference - (circleCircumference * Math.min(Math.max(globalSeoScore || 0, 0), 100)) / 100;
  const gaugeColor = globalSeoScore >= 80 ? "#10b981" : globalSeoScore >= 50 ? "#f59e0b" : "#ef4444";

  const formattedDate = lastAudit
    ? `${new Date(lastAudit).toLocaleDateString()} ${new Date(lastAudit).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Just now";

  return (
    <s-page full-width heading="" inline-size="large" inlineSize="large">
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
        .dash-card {
          background: #ffffff;
          border: 1px solid #edf2f7;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(15, 23, 42, 0.03);
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .dash-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
        }
        .dash-card-clickable {
          cursor: pointer;
        }
        .dash-card-clickable:hover {
          transform: translateY(-2px);
          border-color: #94a3b8;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
        }
        .action-card-dark {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .action-card-dark:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25) !important;
        }
        .action-card-blue {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .action-card-blue:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.3) !important;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto", padding: "4px 8px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* Audit Progress Notification (if currently re-scanning) */}
        {isAuditing && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "12px",
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <IconRefresh size={16} color="#16a34a" spinning={true} />
              <span style={{ fontSize: "13px", fontWeight: "700", color: "#166534" }}>
                Catalog Audit in Progress: Scanning {totalCatalog.toLocaleString()} store products live...
              </span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#15803d" }}>
              Stats will auto-refresh upon completion
            </span>
          </div>
        )}

        {/* Scope Warning Banner if write_content is pending */}
        {contentScopeError && (
          <div
            style={{
              background: "#fffbeb",
              border: "1.5px solid #fde68a",
              borderRadius: "12px",
              padding: "12px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <IconAlertTriangle size={20} color="#d97706" />
              <div>
                <span style={{ fontWeight: "700", fontSize: "13px", color: "#78350f" }}>
                  Permission Update Required:{" "}
                </span>
                <span style={{ color: "#92400e", fontSize: "12px" }}>
                  Grant content permissions to audit and optimize Pages and Blog Articles.
                </span>
              </div>
            </div>
            <a
              href={reauthUrl}
              target="_top"
              style={{
                background: "#b45309",
                color: "#ffffff",
                padding: "6px 14px",
                borderRadius: "6px",
                fontWeight: "700",
                textDecoration: "none",
                fontSize: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              Grant Permission <IconArrowRight size={12} />
            </a>
          </div>
        )}

        {/* =========================================================================
            ROW 1: HERO (Welcome Card + Store SEO Health with Gauge & Illustration)
            ========================================================================= */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "14px",
          }}
        >
          {/* Welcome Card */}
          <div
            className="dash-card"
            style={{
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "#eff6ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <IconStore size={22} color="#2563eb" />
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
                    Welcome back,
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", marginTop: "1px", lineHeight: "1.25" }}>
                    {shop.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                    <span style={{ fontSize: "12px", color: "#475569", fontWeight: "600" }}>{shop.domain}</span>
                  </div>
                </div>
              </div>

              {/* Status Chips */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#475569",
                  }}
                >
                  <IconBox size={13} color="#64748b" />
                  <span><strong>{totalCatalog.toLocaleString()}</strong> Products in catalog</span>
                </span>

                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#475569",
                  }}
                >
                  <IconClock size={13} color="#64748b" />
                  <span>Last updated: {formattedDate}</span>
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", paddingTop: "2px" }}>
              <button
                type="button"
                onClick={handleTriggerReAudit}
                disabled={isAuditing || isTriggering}
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: isAuditing || isTriggering ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  boxShadow: "0 2px 6px rgba(15, 23, 42, 0.15)",
                }}
              >
                <IconRefresh size={13} color="#ffffff" spinning={isAuditing} />
                <span>{isAuditing ? "Scanning Catalog..." : isTriggering ? "Starting..." : "Re-scan Full Catalog"}</span>
              </button>

              <a
                href="#seo-breakdown"
                style={{
                  background: "#ffffff",
                  color: "#334155",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: "700",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <IconTrendingUp size={13} color="#475569" />
                <span>View SEO Health</span>
              </a>
            </div>
          </div>

          {/* Store SEO Health Card (Gauge + Graphic Illustration) */}
          <div
            className="dash-card"
            style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>Store SEO Health</span>
                <span title="Weighted aggregate of Products, Collections, Pages, Blog Articles, and Image Alt text optimization"><IconInfo size={14} color="#94a3b8" /></span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "8px 0",
              }}
            >
              {/* Full Round 360 Circular Progress Gauge */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ position: "relative", width: "108px", height: "108px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="108" height="108" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                    {/* Background Track Circle */}
                    <circle
                      cx="50"
                      cy="50"
                      r={circleRadius}
                      fill="none"
                      stroke="#f1f5f9"
                      strokeWidth="9"
                    />
                    {/* Progress Circle */}
                    <circle
                      cx="50"
                      cy="50"
                      r={circleRadius}
                      fill="none"
                      stroke={gaugeColor}
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray={circleCircumference}
                      strokeDashoffset={strokeOffset}
                      style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }}
                    />
                  </svg>
                  {/* Centered Score */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <span style={{ fontSize: "28px", fontWeight: "900", color: "#0f172a", lineHeight: 1 }}>
                      {globalSeoScore}
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", marginTop: "3px" }}>
                      /100
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    background: globalSeoScore >= 80 ? "#ecfdf5" : globalSeoScore >= 50 ? "#fffbeb" : "#fef2f2",
                    border: `1px solid ${globalSeoScore >= 80 ? "#a7f3d0" : globalSeoScore >= 50 ? "#fde68a" : "#fecaca"}`,
                    color: globalSeoScore >= 80 ? "#059669" : globalSeoScore >= 50 ? "#d97706" : "#dc2626",
                    padding: "3px 12px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: "700",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    marginTop: "8px",
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentColor" }} />
                  {globalSeoScore >= 80 ? "Optimal Health" : globalSeoScore >= 50 ? "Needs Work" : "Action Needed"}
                </div>
              </div>

              {/* Graphic Illustration (Browser & Analytics Search) */}
              <div
                style={{
                  flex: "1 1 auto",
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "136px",
                    height: "92px",
                    background: "linear-gradient(145deg, #f8fafc 0%, #edf2f7 100%)",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    padding: "8px 10px",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "inset 0 1px 2px rgba(255,255,255,0.8), 0 4px 10px rgba(0,0,0,0.02)",
                  }}
                >
                  {/* Browser top pill */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#cbd5e1" }} />
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#cbd5e1" }} />
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#cbd5e1" }} />
                    <div style={{ flex: 1, height: "6px", background: "#ffffff", borderRadius: "3px", marginLeft: "4px", border: "1px solid #e2e8f0" }} />
                  </div>

                  {/* Rising colorful analytics bars */}
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", height: "46px", padding: "0 6px" }}>
                    <div style={{ width: "14px", height: "24px", background: "#10b981", borderRadius: "3px 3px 0 0" }} />
                    <div style={{ width: "14px", height: "36px", background: "#3b82f6", borderRadius: "3px 3px 0 0" }} />
                    <div style={{ width: "14px", height: "46px", background: "#8b5cf6", borderRadius: "3px 3px 0 0" }} />
                  </div>

                  {/* Search magnifier badge */}
                  <div
                    style={{
                      position: "absolute",
                      right: "-6px",
                      top: "20px",
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "#ffffff",
                      border: "1.5px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="7" />
                      <line x1="21" y1="21" x2="16.5" y2="16.5" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            ROW 2: 4 METRIC CARDS (Products, Collections, Pages, Blog Posts)
            ========================================================================= */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "14px",
          }}
        >
          {/* Card 1: Products */}
          <Link to="/app/bulk-optimizer?resource=products" style={{ textDecoration: "none" }}>
            <div className="dash-card dash-card-clickable" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <IconBox size={16} color="#2563eb" />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#334155" }}>Products</span>
                </div>
                <IconArrowRight size={13} color="#94a3b8" />
              </div>

              <div style={{ fontSize: "26px", fontWeight: "900", color: "#0f172a", marginTop: "10px" }}>
                {totalCatalog.toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>
                Store Catalog Products
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#10b981" }}>
                  ↑ {missingTitles === 0 ? "100%" : `${Math.round(((totalCatalog - missingTitles) / (totalCatalog || 1)) * 100)}%`}
                </span>
                <svg width="76" height="22" viewBox="0 0 76 22" fill="none">
                  <path d="M 0 16 Q 18 6, 38 14 T 76 4" stroke="#3b82f6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 0 16 Q 18 6, 38 14 T 76 4 L 76 22 L 0 22 Z" fill="#3b82f6" fillOpacity="0.08" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Card 2: Collections */}
          <Link to="/app/bulk-optimizer?resource=collections" style={{ textDecoration: "none" }}>
            <div className="dash-card dash-card-clickable" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <IconFolder size={16} color="#8b5cf6" />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#334155" }}>Collections</span>
                </div>
                <IconArrowRight size={13} color="#94a3b8" />
              </div>

              <div style={{ fontSize: "26px", fontWeight: "900", color: "#0f172a", marginTop: "10px" }}>
                {collectionsCount.toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>
                Category Collections
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#10b981" }}>
                  ↑ {seoBreakdown?.collections?.score ?? 100}%
                </span>
                <svg width="76" height="22" viewBox="0 0 76 22" fill="none">
                  <path d="M 0 16 Q 18 6, 38 14 T 76 4" stroke="#8b5cf6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 0 16 Q 18 6, 38 14 T 76 4 L 76 22 L 0 22 Z" fill="#8b5cf6" fillOpacity="0.08" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Card 3: Pages */}
          <Link to="/app/bulk-optimizer?resource=pages" style={{ textDecoration: "none" }}>
            <div className="dash-card dash-card-clickable" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <IconFileText size={16} color="#f59e0b" />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#334155" }}>Pages</span>
                </div>
                <IconArrowRight size={13} color="#94a3b8" />
              </div>

              <div style={{ fontSize: "26px", fontWeight: "900", color: "#0f172a", marginTop: "10px" }}>
                {pagesCount.toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>
                Content Pages (About, FAQ, Policies)
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#10b981" }}>
                  ↑ {seoBreakdown?.pages?.score ?? 100}%
                </span>
                <svg width="76" height="22" viewBox="0 0 76 22" fill="none">
                  <path d="M 0 16 Q 18 6, 38 14 T 76 4" stroke="#f59e0b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 0 16 Q 18 6, 38 14 T 76 4 L 76 22 L 0 22 Z" fill="#f59e0b" fillOpacity="0.08" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Card 4: Blog Posts */}
          <Link to="/app/bulk-optimizer?resource=articles" style={{ textDecoration: "none" }}>
            <div className="dash-card dash-card-clickable" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <IconArticle size={16} color="#10b981" />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#334155" }}>Blog Posts</span>
                </div>
                <IconArrowRight size={13} color="#94a3b8" />
              </div>

              <div style={{ fontSize: "26px", fontWeight: "900", color: "#0f172a", marginTop: "10px" }}>
                {articlesCount.toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>
                Editorial Blog Posts & Guides
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#10b981" }}>
                  ↑ {seoBreakdown?.articles?.score ?? 100}%
                </span>
                <svg width="76" height="22" viewBox="0 0 76 22" fill="none">
                  <path d="M 0 16 Q 18 6, 38 14 T 76 4" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 0 16 Q 18 6, 38 14 T 76 4 L 76 22 L 0 22 Z" fill="#10b981" fillOpacity="0.08" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* =========================================================================
            ROW 3: SEO SCORE BREAKDOWN (Clean full width, red gauge removed)
                   & QUICK ACTIONS (2x2 Grid)
            ========================================================================= */}
        <div
          id="seo-breakdown"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "14px",
          }}
        >
          {/* SEO Score Breakdown Card */}
          <div
            className="dash-card"
            style={{
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
            }}
          >
            <div>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a" }}>SEO Score Breakdown</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>Overall store SEO health and performance</div>
              </div>

              {/* Progress rows taking full width (Red duplicate gauge completely removed) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" }}>
                {[
                  {
                    name: "Products",
                    icon: <IconBox size={14} color="#2563eb" />,
                    bg: "#eff6ff",
                    score: seoBreakdown?.products?.score ?? Math.round(((totalCatalog - missingTitles) / (totalCatalog || 1)) * 100),
                    sub: `${seoBreakdown?.products?.withTitle ?? (totalCatalog - missingTitles)} items · ${seoBreakdown?.products?.withTitle ?? (totalCatalog - missingTitles)}/${totalCatalog}`,
                    link: "/app/bulk-optimizer?resource=products",
                  },
                  {
                    name: "Collections",
                    icon: <IconFolder size={14} color="#f59e0b" />,
                    bg: "#fffbeb",
                    score: seoBreakdown?.collections?.score ?? 100,
                    sub: `${collectionsCount} items · ${seoBreakdown?.collections?.withTitle ?? collectionsCount}/${collectionsCount || 1}`,
                    link: "/app/bulk-optimizer?resource=collections",
                  },
                  {
                    name: "Store Pages",
                    icon: <IconFileText size={14} color="#8b5cf6" />,
                    bg: "#f5f3ff",
                    score: seoBreakdown?.pages?.score ?? 100,
                    sub: `${pagesCount} items · ${seoBreakdown?.pages?.withTitle ?? pagesCount}/${pagesCount || 1}`,
                    link: "/app/bulk-optimizer?resource=pages",
                  },
                  {
                    name: "Blog Articles",
                    icon: <IconArticle size={14} color="#10b981" />,
                    bg: "#ecfdf5",
                    score: seoBreakdown?.articles?.score ?? 100,
                    sub: `${articlesCount} items · ${seoBreakdown?.articles?.withTitle ?? articlesCount}/${articlesCount || 1}`,
                    link: "/app/bulk-optimizer?resource=articles",
                  },
                  {
                    name: "Image Alt Tags",
                    icon: <IconImage size={14} color="#06b6d4" />,
                    bg: "#ecfeff",
                    score: seoBreakdown?.altTags?.score ?? 85,
                    sub: `${seoBreakdown?.altTags?.imagesWithAlt ?? 0} of ${seoBreakdown?.altTags?.totalImages ?? 0} images`,
                    link: "/app/image-alt-optimizer",
                  },
                ].map((item) => {
                  const s = Math.min(Math.max(item.score || 0, 0), 100);
                  const barColor = s >= 80 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";
                  return (
                    <Link
                      key={item.name}
                      to={item.link}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "grid",
                        gridTemplateColumns: "130px 1fr 50px",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "26px", height: "26px", borderRadius: "7px", background: item.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {item.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: "#1e293b", whiteSpace: "nowrap" }}>{item.name}</div>
                          <div style={{ fontSize: "10px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.sub}</div>
                        </div>
                      </div>

                      {/* Progress Track */}
                      <div style={{ height: "7px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${s}%`,
                            background: barColor,
                            borderRadius: "4px",
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>

                      {/* Score Value */}
                      <div style={{ textAlign: "right", fontSize: "12px", fontWeight: "800", color: barColor }}>
                        {s}<span style={{ fontSize: "10px", fontWeight: "600", color: "#94a3b8" }}>/100</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Bottom Tip Banner */}
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #dcfce7",
                borderRadius: "10px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                color: "#166534",
                fontWeight: "600",
              }}
            >
              <IconSparkles size={15} color="#10b981" />
              <span>Great job! Your store is well optimized. Keep up the good work!</span>
            </div>
          </div>

          {/* Quick Actions (2x2 Grid) */}
          <div
            className="dash-card"
            style={{
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a" }}>Quick Actions</div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>Optimize your store faster</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginTop: "14px",
                }}
              >
                {/* 1. SEO Bulk Optimizer (Dark Navy Card) */}
                <Link to="/app/bulk-optimizer" style={{ textDecoration: "none" }}>
                  <div
                    className="action-card-dark"
                    style={{
                      background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                      borderRadius: "12px",
                      padding: "14px 16px",
                      color: "#ffffff",
                      height: "100%",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                        <IconRocket size={17} color="#34d399" />
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>SEO Bulk Optimizer</span>
                        <IconArrowRight size={11} color="#94a3b8" />
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", lineHeight: "1.4" }}>
                        Optimize products, collections, pages and more in bulk.
                      </div>
                    </div>
                  </div>
                </Link>

                {/* 2. Image ALT Optimizer (Royal Blue Card) */}
                <Link to="/app/image-alt-optimizer" style={{ textDecoration: "none" }}>
                  <div
                    className="action-card-blue"
                    style={{
                      background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                      borderRadius: "12px",
                      padding: "14px 16px",
                      color: "#ffffff",
                      height: "100%",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                        <IconImage size={17} color="#ffffff" />
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>Image ALT Optimizer</span>
                        <IconArrowRight size={11} color="#bfdbfe" />
                      </div>
                      <div style={{ fontSize: "11px", color: "#dbeafe", marginTop: "4px", lineHeight: "1.4" }}>
                        Audit and fix missing alt texts for images.
                      </div>
                    </div>
                  </div>
                </Link>

                {/* 3. Titles Status (Mint/Green Card) */}
                <Link to="/app/bulk-optimizer?resource=products" style={{ textDecoration: "none" }}>
                  <div
                    style={{
                      background: missingTitles > 0 ? "#fef2f2" : "#f0fdf4",
                      border: `1px solid ${missingTitles > 0 ? "#fecaca" : "#bbf7d0"}`,
                      borderRadius: "12px",
                      padding: "14px 16px",
                      height: "100%",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: missingTitles > 0 ? "#fee2e2" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                        {missingTitles > 0 ? <IconAlertTriangle size={17} color="#dc2626" /> : <IconCheckCircle size={17} color="#16a34a" />}
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: missingTitles > 0 ? "#991b1b" : "#166534", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>{missingTitles > 0 ? `${missingTitles} Missing Titles` : "All Titles Complete"}</span>
                        <IconArrowRight size={11} color="#94a3b8" />
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: "1.4" }}>
                        {missingTitles > 0 ? "Fix missing product SEO titles." : "Ensure all product and collection titles are optimized."}
                      </div>
                    </div>
                  </div>
                </Link>

                {/* 4. Descriptions Status (Lavender/Purple Card) */}
                <Link to="/app/bulk-optimizer?resource=products" style={{ textDecoration: "none" }}>
                  <div
                    style={{
                      background: missingDescriptions > 0 ? "#fffbeb" : "#faf5ff",
                      border: `1px solid ${missingDescriptions > 0 ? "#fed7aa" : "#e9d5ff"}`,
                      borderRadius: "12px",
                      padding: "14px 16px",
                      height: "100%",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: missingDescriptions > 0 ? "#ffedd5" : "#f3e8ff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                        {missingDescriptions > 0 ? <IconAlertTriangle size={17} color="#d97706" /> : <IconEdit size={17} color="#9333ea" />}
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: missingDescriptions > 0 ? "#9a3412" : "#581c87", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>{missingDescriptions > 0 ? `${missingDescriptions} Missing Descs` : "All Descriptions Complete"}</span>
                        <IconArrowRight size={11} color="#94a3b8" />
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: "1.4" }}>
                        {missingDescriptions > 0 ? "Fill meta descriptions for search." : "Ensure all products have meta descriptions for search engines."}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            ROW 4: RECENT ACTIVITY (Full width compact card;
                   the red-boxed promo block on right is completely removed!)
            ========================================================================= */}
        <div
          className="dash-card"
          style={{
            padding: "16px 22px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div>
              <span style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>Recent Activity</span>
              <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "10px" }}>Latest updates and progress</span>
            </div>
            <Link
              to="/app/bulk-optimizer"
              style={{
                fontSize: "12px",
                fontWeight: "700",
                color: "#2563eb",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              View All <IconArrowRight size={11} />
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            {/* 1. Products Optimized */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "10px",
                padding: "10px 14px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconBox size={16} color="#2563eb" />
              </div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#1e293b" }}>Products Optimized</div>
                <div style={{ fontSize: "11px", color: "#10b981", fontWeight: "600" }}>+{totalCatalog - missingTitles} active</div>
              </div>
            </div>

            {/* 2. Collections Optimized */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "10px",
                padding: "10px 14px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconFolder size={16} color="#8b5cf6" />
              </div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#1e293b" }}>Collections Optimized</div>
                <div style={{ fontSize: "11px", color: "#10b981", fontWeight: "600" }}>+{collectionsCount} active</div>
              </div>
            </div>

            {/* 3. Pages Optimized */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "10px",
                padding: "10px 14px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconFileText size={16} color="#f59e0b" />
              </div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#1e293b" }}>Pages Optimized</div>
                <div style={{ fontSize: "11px", color: "#10b981", fontWeight: "600" }}>+{pagesCount} active</div>
              </div>
            </div>

            {/* 4. Blog Posts Optimized */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "10px",
                padding: "10px 14px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconArticle size={16} color="#10b981" />
              </div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#1e293b" }}>Blog Posts Optimized</div>
                <div style={{ fontSize: "11px", color: "#10b981", fontWeight: "600" }}>+{articlesCount} active</div>
              </div>
            </div>
          </div>
        </div>

      </div>

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
              width: "44px",
              height: "44px",
              border: "3px solid #f3f3f3",
              borderTop: "3px solid #2563eb",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "14px",
            }}
          />
          <div style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>
            Loading Dashboard...
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px" }}>
            Analyzing catalog and SEO metrics
          </div>
        </div>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
