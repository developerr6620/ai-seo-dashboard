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

  try {
    // 1. Fetch store info, exact total products count, and sample products
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

    return {
      shop: {
        name: shop.name || "Your Store",
        domain: shop.myshopifyDomain || "",
        email: shop.email || "",
        plan: shop.plan?.displayName || "Shopify",
      },
      stats: auditResult.stats,
      isAuditing: auditResult.isAuditing,
      lastAuditedAt: auditResult.lastAuditedAt,
      allProductsCount: totalProducts,
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
    };
  }
};

export default function Dashboard() {
  const { shop, stats: initialStats, allProductsCount, isAuditing: initialIsAuditing, lastAuditedAt: initialLastAudit } = useLoaderData();
  const navigation = useNavigation();
  const isPageLoading = navigation.state === "loading";

  const [stats, setStats] = useState(initialStats);
  const [isAuditing, setIsAuditing] = useState(initialIsAuditing);
  const [lastAudit, setLastAudit] = useState(initialLastAudit);
  const [isTriggering, setIsTriggering] = useState(false);

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
    <s-page heading={`Welcome, ${shop.name}`}>
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
              {stats.seoScore}
            </div>
            <div style={{ fontSize: "13px", opacity: 0.85 }}>/ 100</div>
            <div style={{ fontSize: "12px", marginTop: "6px", fontWeight: "600" }}>
              {stats.seoScore >= 80 ? "🟢 Excellent" : stats.seoScore >= 50 ? "🟡 Needs Work" : "🔴 Critical"}
            </div>
            <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.8 }}>
              Based on all {totalCatalog.toLocaleString()} catalog products
            </div>
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

      {/* Storefront & SEO Extension Connection */}
      <s-section heading="🌐 Storefront & SEO Extension Connection">
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            border: "1px solid #e1e3e5",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#202223" }}>
                Display Keywords in SEO Chrome Extensions & Live Storefront
              </div>
              <div style={{ fontSize: "13px", color: "#616161", marginTop: "4px" }}>
                Shopify themes natively output Title and Meta Description, but require 1 snippet in <code>theme.liquid</code> to output <code>&lt;meta name=&quot;keywords&quot;&gt;</code>.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const snippet = `{%- if template.name == 'product' and product.metafields.seo.keywords.value != blank -%}\n  {%- assign seo_kw = product.metafields.seo.keywords.value -%}\n  {%- if seo_kw.first -%}\n    <meta name="keywords" content="{{ seo_kw | join: ', ' | strip | escape }}">\n  {%- else -%}\n    <meta name="keywords" content="{{ seo_kw | strip | escape }}">\n  {%- endif -%}\n{%- endif -%}`;
                navigator.clipboard.writeText(snippet);
                alert("Copied Liquid snippet to clipboard!");
              }}
              style={{
                background: "#008060",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              📋 Copy Liquid Snippet
            </button>
          </div>

          <div style={{ background: "#0f172a", color: "#38bdf8", padding: "12px 16px", borderRadius: "8px", fontFamily: "monospace", fontSize: "12px", overflowX: "auto", whiteSpace: "pre-wrap", marginBottom: "14px" }}>
            {`{%- if template.name == 'product' and product.metafields.seo.keywords.value != blank -%}\n  {%- assign seo_kw = product.metafields.seo.keywords.value -%}\n  {%- if seo_kw.first -%}\n    <meta name="keywords" content="{{ seo_kw | join: ', ' | strip | escape }}">\n  {%- else -%}\n    <meta name="keywords" content="{{ seo_kw | strip | escape }}">\n  {%- endif -%}\n{%- endif -%}`}
          </div>

          <div style={{ fontSize: "12px", color: "#334155", background: "#f8fafc", padding: "12px 16px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <strong>How to connect in 10 seconds:</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0, lineHeight: "1.6" }}>
              <li>In Shopify Admin, navigate to <strong>Online Store</strong> → <strong>Themes</strong>.</li>
              <li>Click the <strong>⋯</strong> button on your active theme → <strong>Edit code</strong>.</li>
              <li>Open <strong>layout/theme.liquid</strong> and locate <code>&lt;meta name=&quot;description&quot; ...&gt;</code> (inside the <code>&lt;head&gt;</code> tag).</li>
              <li>Paste the snippet directly below it and click <strong>Save</strong>.</li>
            </ol>
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
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
