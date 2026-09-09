/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useLoaderData, Link, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { isDescOk, isTitleOk } from "../lib/seoCopy";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    // 1. Fetch store info, total products count (unlimited), and products batch
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
          pageInfo {
            hasNextPage
            endCursor
          }
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
    const products = data?.data?.products?.edges?.map((e) => e.node) || [];

    // Calculate REAL, ACCURATE statistics directly on the audited products
    const auditedCount = products.length;
    const withSeoTitle = products.filter((p) => p.seo?.title && p.seo.title.trim().length > 0).length;
    const withSeoDesc = products.filter((p) => p.seo?.description && p.seo.description.trim().length > 0).length;
    const withOptimalTitle = products.filter((p) => isTitleOk(p.seo?.title)).length;
    const withOptimalDesc = products.filter((p) => isDescOk(p.seo?.description)).length;

    const missingTitle = Math.max(0, auditedCount - withSeoTitle);
    const missingDesc = Math.max(0, auditedCount - withSeoDesc);

    const titleCoveragePct = auditedCount > 0 ? Math.round((withSeoTitle / auditedCount) * 100) : 0;
    const descCoveragePct = auditedCount > 0 ? Math.round((withSeoDesc / auditedCount) * 100) : 0;
    const optimalTitlePct = auditedCount > 0 ? Math.round((withOptimalTitle / auditedCount) * 100) : 0;

    // Accurate SEO health score for audited products
    const seoScore = auditedCount > 0
      ? Math.round(((withSeoTitle + withSeoDesc) / (auditedCount * 2)) * 100)
      : 0;

    const isCatalogLarger = totalProducts > auditedCount;

    return {
      shop: {
        name: shop.name || "Your Store",
        domain: shop.myshopifyDomain || "",
        email: shop.email || "",
        plan: shop.plan?.displayName || "Shopify",
      },
      stats: {
        totalProducts,
        auditedCount,
        withSeoTitle,
        withSeoDesc,
        withOptimalTitle,
        withOptimalDesc,
        missingTitle,
        missingDesc,
        titleCoveragePct,
        descCoveragePct,
        optimalTitlePct,
        seoScore,
      },
      allProductsCount: totalProducts,
      isCatalogLarger,
    };
  } catch (error) {
    console.error("Dashboard loader error:", error);
    return {
      shop: { name: "Your Store", domain: "", email: "", plan: "Shopify" },
      stats: {
        totalProducts: 0,
        auditedCount: 0,
        withSeoTitle: 0,
        withSeoDesc: 0,
        withOptimalTitle: 0,
        withOptimalDesc: 0,
        missingTitle: 0,
        missingDesc: 0,
        titleCoveragePct: 0,
        descCoveragePct: 0,
        optimalTitlePct: 0,
        seoScore: 0,
      },
      allProductsCount: 0,
      isCatalogLarger: false,
    };
  }
};

export default function Dashboard() {
  const { shop, stats, allProductsCount, isCatalogLarger } = useLoaderData();
  const navigation = useNavigation();
  const isPageLoading = navigation.state === "loading";

  return (
    <s-page heading={`👋 Welcome back, ${shop.name}`}>
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
              📦 <strong>{allProductsCount.toLocaleString()}</strong> Products in catalog &nbsp;|&nbsp; 🏷️ {shop.plan} Plan
            </div>
            {isCatalogLarger && (
              <div style={{ fontSize: "12px", marginTop: "8px", background: "rgba(255,255,255,0.15)", padding: "4px 10px", borderRadius: "6px", display: "inline-block" }}>
                🔍 Showing audited stats for <strong>{stats.auditedCount}</strong> products in your catalog
              </div>
            )}
          </div>

          {/* Overall SEO Score Ring */}
          <div
            style={{
              background: "rgba(255,255,255,0.12)",
              borderRadius: "14px",
              padding: "20px 28px",
              textAlign: "center",
              backdropFilter: "blur(10px)",
              minWidth: "160px",
            }}
          >
            <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px", fontWeight: "600" }}>
              {isCatalogLarger ? "AUDITED BATCH HEALTH" : "STORE SEO HEALTH"}
            </div>
            <div style={{ fontSize: "52px", fontWeight: "900", lineHeight: 1 }}>
              {stats.seoScore}
            </div>
            <div style={{ fontSize: "13px", opacity: 0.85 }}>/ 100</div>
            <div style={{ fontSize: "12px", marginTop: "6px", fontWeight: "600" }}>
              {stats.seoScore >= 80 ? "🟢 Excellent" : stats.seoScore >= 50 ? "🟡 Needs Work" : "🔴 Critical"}
            </div>
            <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.75 }}>
              Based on {stats.auditedCount} audited products
            </div>
          </div>
        </div>
      </s-section>

      {/* 4 Stats Cards Row */}
      <s-section heading="📊 SEO Performance Overview">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📦</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#202223" }}>
              {stats.totalProducts.toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "4px" }}>Total Catalog Products</div>
            {isCatalogLarger && (
              <div style={{ fontSize: "11px", color: "#008060", marginTop: "4px", fontWeight: "600" }}>
                ({stats.auditedCount} audited)
              </div>
            )}
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
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>🏷️</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#108043" }}>
              {stats.withSeoTitle}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "4px" }}>Have SEO Title</div>
            {stats.missingTitle > 0 ? (
              <div style={{ fontSize: "11px", color: "#d9381e", marginTop: "4px", fontWeight: "600" }}>
                ⚠️ {stats.missingTitle} missing {isCatalogLarger ? `(in ${stats.auditedCount} audited)` : ""}
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "#108043", marginTop: "4px", fontWeight: "600" }}>
                ✓ All {stats.auditedCount} audited have titles
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
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📝</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#108043" }}>
              {stats.withSeoDesc}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "4px" }}>Have Meta Description</div>
            {stats.missingDesc > 0 ? (
              <div style={{ fontSize: "11px", color: "#d9381e", marginTop: "4px", fontWeight: "600" }}>
                ⚠️ {stats.missingDesc} missing {isCatalogLarger ? `(in ${stats.auditedCount} audited)` : ""}
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "#108043", marginTop: "4px", fontWeight: "600" }}>
                ✓ All {stats.auditedCount} audited have descriptions
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
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎯</div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#008060" }}>
              {stats.withOptimalTitle}
            </div>
            <div style={{ fontSize: "13px", color: "#616161", marginTop: "4px" }}>Perfect SEO Length</div>
            <div style={{ fontSize: "11px", color: "#6d7175", marginTop: "4px" }}>
              (title ≤ 50 chars)
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
          {isCatalogLarger && (
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
                ℹ️ <strong>Audited Scope:</strong> Showing accurate measurements from <strong>{stats.auditedCount}</strong> of <strong>{stats.totalProducts.toLocaleString()}</strong> products in your catalog.
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
          )}

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
              {stats.withSeoTitle} of {stats.auditedCount} audited products have SEO title
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
              {stats.withSeoDesc} of {stats.auditedCount} audited products have meta description
            </div>
          </div>

          {/* Optimal Title Length Coverage */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#202223" }}>🎯 Title Within Limit (≤ 50 chars)</span>
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
              {stats.withOptimalTitle} of {stats.auditedCount} audited products have perfectly sized titles
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
            <div style={{ position: "absolute", top: "12px", right: "12px", background: "#10b981", color: "#ffffff", fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "10px" }}>
              NEW
            </div>
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>🚀</div>
            <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "6px" }}>1-Click Bulk Optimizer</div>
            <div style={{ fontSize: "13px", opacity: 0.85, lineHeight: "1.4" }}>
              Batch optimize 10+ products at once with live progress and side-by-side review.
            </div>
            <div style={{ marginTop: "12px", fontSize: "13px", fontWeight: "600", color: "#34d399" }}>
              Launch Bulk Tool →
            </div>
            </button>
          </Link>

          {/* Start Single SEO Optimizer */}
          <Link to="/app/seo-optimizer" style={{ textDecoration: "none" }}>
            <button
              style={{
                background: "linear-gradient(135deg, #008060, #004c3f)",
                borderRadius: "12px",
                padding: "24px",
                cursor: "pointer",
                color: "#ffffff",
                boxShadow: "0 4px 12px rgba(0,128,96,0.3)",
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
              background: stats.missingTitle > 0 ? "#fbeae5" : "#e3f8e0",
              borderRadius: "12px",
              padding: "24px",
              border: `1.5px solid ${stats.missingTitle > 0 ? "#d9381e" : "#108043"}`,
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>
              {stats.missingTitle > 0 ? "🚨" : "✅"}
            </div>
            <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "6px", color: stats.missingTitle > 0 ? "#d9381e" : "#108043" }}>
              {stats.missingTitle > 0 ? "SEO Gaps Detected" : "All Titles Complete!"}
            </div>
            <div style={{ fontSize: "13px", color: "#4a4a4a" }}>
              {stats.missingTitle > 0
                ? `${stats.missingTitle} products are missing SEO titles. Use the optimizer to fix them now.`
                : "All your products have SEO titles. Check meta descriptions next!"}
            </div>
          </div>

          {/* Meta Desc Alert */}
          <div
            style={{
              background: stats.missingDesc > 0 ? "#fff4e5" : "#e3f8e0",
              borderRadius: "12px",
              padding: "24px",
              border: `1.5px solid ${stats.missingDesc > 0 ? "#b7791f" : "#108043"}`,
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>
              {stats.missingDesc > 0 ? "⚠️" : "✅"}
            </div>
            <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "6px", color: stats.missingDesc > 0 ? "#b7791f" : "#108043" }}>
              {stats.missingDesc > 0 ? "Meta Gaps Detected" : "All Descriptions Set!"}
            </div>
            <div style={{ fontSize: "13px", color: "#4a4a4a" }}>
              {stats.missingDesc > 0
                ? `${stats.missingDesc} products missing meta descriptions. Click SEO Optimizer to fix.`
                : "All your products have meta descriptions. Great SEO coverage!"}
            </div>
          </div>
        </div>
      </s-section>

      {/* How It Works */}
      <s-section heading="💡 How AI SEO Content Master Works">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          {[
            { step: "1", icon: "🔍", title: "Search Your Catalog", desc: "Find any product from your full store catalog using the live search field." },
            { step: "2", icon: "🤖", title: "Generate AI Content", desc: "Choose tone, audience & keywords. AI writes a title under 50 chars and a complete description under 150 chars." },
            { step: "3", icon: "🎯", title: "Pick the Best Variation", desc: "Select from 3 AI-generated variations that best match your brand voice." },
            { step: "4", icon: "💾", title: "Save to Shopify", desc: "One click publishes your optimized SEO title & meta description directly into Shopify catalog." },
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
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>{item.icon}</div>
              <div
                style={{
                  background: "#008060",
                  color: "#ffffff",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
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
              <div style={{ fontSize: "15px", fontWeight: "700", color: "#202223", marginBottom: "6px" }}>
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
