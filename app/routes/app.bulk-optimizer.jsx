/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useMemo, useEffect } from "react";
import { useLoaderData, useNavigate, useNavigation, useSearchParams, redirect, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureKeywordsMetafieldDefinition } from "../lib/metafieldDefinitions.server";
import {
  BulkProductsView,
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

  const url = new URL(request.url);

  // If user requested to grant/update missing scopes
  if (url.searchParams.get("grant_scopes") === "1") {
    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=cdeb2fd429e5b0cceb3d43906b7f2148&scope=write_products,write_metaobjects,write_metaobject_definitions,write_files,write_content&redirect_uri=${encodeURIComponent("https://ai-seo-dashboard.onrender.com/auth/callback")}`;
    return redirect(authUrl);
  }

  // Guarantee that the Target SEO Keywords definition is registered & pinned in Shopify
  await ensureKeywordsMetafieldDefinition(admin, shop);
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
                keywordsMetafield: metafield(namespace: "seo", key: "keywords") {
                  value
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
        keywords: parseMetafieldKeywords(e.node.keywordsMetafield?.value),
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
                seoTitle: metafield(namespace: "global", key: "title_tag") {
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
      const pageData = await pageRes.json();
      if (pageData?.errors?.some((e) => {
        const msg = (e.message || "").toLowerCase();
        return msg.includes("write_content") || msg.includes("read_content") || (msg.includes("access") && !msg.includes("field"));
      })) {
        contentScopeError = true;
      } else if (pageData?.data?.pages?.edges) {
        pages = pageData.data.pages.edges.map((e) => ({
          id: e.node.id,
          title: e.node.title || "Untitled Page",
          handle: e.node.handle || "",
          bodySummary: e.node.bodySummary || "",
          seoTitle: e.node.seoTitle?.value || "",
          seoDescription: e.node.seoDesc?.value || "",
          keywords: parseMetafieldKeywords(e.node.keywordsMetafield?.value),
          hasCustomSeoTitle: Boolean(e.node.seoTitle?.value?.trim()),
        }));
      }
    } catch (pageErr) {
      console.warn("Pages fetch error:", pageErr.message);
      const msg = (pageErr.message || "").toLowerCase();
      if (msg.includes("write_content") || msg.includes("read_content") || (msg.includes("access") && !msg.includes("field"))) {
        contentScopeError = true;
      }
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
                summary
                blog {
                  title
                }
                image {
                  url
                }
                seoTitle: metafield(namespace: "global", key: "title_tag") {
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
      const artData = await artRes.json();
      if (artData?.errors?.some((e) => {
        const msg = (e.message || "").toLowerCase();
        return msg.includes("write_content") || msg.includes("read_content") || (msg.includes("access") && !msg.includes("field"));
      })) {
        contentScopeError = true;
      } else if (artData?.data?.articles?.edges) {
        articles = artData.data.articles.edges.map((e) => ({
          id: e.node.id,
          title: e.node.title || "Untitled Article",
          handle: e.node.handle || "",
          summary: (e.node.summary || "").replace(/<[^>]*>/g, "").slice(0, 160),
          blogTitle: e.node.blog?.title || "Blog",
          imageUrl: e.node.image?.url || null,
          seoTitle: e.node.seoTitle?.value || "",
          seoDescription: e.node.seoDesc?.value || "",
          keywords: parseMetafieldKeywords(e.node.keywordsMetafield?.value),
          hasCustomSeoTitle: Boolean(e.node.seoTitle?.value?.trim()),
        }));
      }
    } catch (artErr) {
      console.warn("Articles fetch error:", artErr.message);
      const msg = (artErr.message || "").toLowerCase();
      if (msg.includes("write_content") || msg.includes("read_content") || (msg.includes("access") && !msg.includes("field"))) {
        contentScopeError = true;
      }
    }

    return {
      shop: shopInfo,
      shopDomain: shop,
      clientId: "cdeb2fd429e5b0cceb3d43906b7f2148",
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
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const shop = loaderData?.shop || { name: "Your Store" };
  const shopDomain = loaderData?.shopDomain || "develops-test-store.myshopify.com";
  const clientId = loaderData?.clientId || "cdeb2fd429e5b0cceb3d43906b7f2148";
  const collections = loaderData?.collections || [];
  const pages = loaderData?.pages || [];
  const articles = loaderData?.articles || [];
  const contentScopeError = loaderData?.contentScopeError || false;

  // Resource Switcher: "products" | "collections" | "pages" | "articles"
  const resFromQuery = searchParams.get("resource");
  const [activeResource, setActiveResource] = useState(
    resFromQuery && ["products", "collections", "pages", "articles"].includes(resFromQuery)
      ? resFromQuery
      : "products"
  );

  useEffect(() => {
    const res = searchParams.get("resource");
    if (res && ["products", "collections", "pages", "articles"].includes(res) && res !== activeResource) {
      setActiveResource(res);
    }
  }, [searchParams]);

  const handleSelectResource = (resKey) => {
    setActiveResource(resKey);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("resource", resKey);
    setSearchParams(newParams, { replace: true });
  };

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
  const [toastMessage, setToastMessage] = useState(null);

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

  useEffect(() => {
    const expandLayout = () => {
      document.querySelectorAll("s-page").forEach((el) => {
        el.setAttribute("inline-size", "large");
        el.setAttribute("inlineSize", "large");
        if (el.shadowRoot) {
          const id = "bulk-fullwidth-style";
          if (!el.shadowRoot.getElementById(id)) {
            const style = document.createElement("style");
            style.id = id;
            style.textContent = `
              :host { max-width: 100% !important; width: 100% !important; }
              .container, .content, .page, [class*="container"], [class*="page"], [class*="layout"] {
                max-width: 100% !important;
                width: 100% !important;
                padding-left: 8px !important;
                padding-right: 8px !important;
                margin: 0 !important;
              }
            `;
            el.shadowRoot.appendChild(style);
          }
        }
      });
    };
    expandLayout();
    const interval = setInterval(expandLayout, 300);
    const timeout = setTimeout(() => clearInterval(interval), 2500);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <s-page inline-size="large" inlineSize="large" full-width heading="🚀 1-Click Bulk SEO Optimizer">
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        :root {
          --p-page-width: 100% !important;
          --p-page-max-width: 100% !important;
          --s-page-max-width: 100% !important;
          --s-page-inline-size: 100% !important;
        }
        body, html {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        s-page {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        s-page::part(container),
        s-page::part(page),
        s-page::part(content),
        s-page::part(body),
        .Polaris-Page,
        .Polaris-Page--fullWidth,
        .Polaris-Page__Content,
        div[class*="Polaris-Page"],
        div[class*="Page-Container"] {
          max-width: 100% !important;
          width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          padding-left: 8px !important;
          padding-right: 8px !important;
          box-sizing: border-box !important;
        }
        s-section {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: "100%", margin: "0", padding: "0 8px 30px 8px", boxSizing: "border-box" }}>

      {/* Toast Notification */}
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
            type="button"
            onClick={() => setToastMessage(null)}
            style={{
              background: "none",
              border: "none",
              color: "#ffffff",
              fontSize: "16px",
              cursor: "pointer",
              marginLeft: "12px",
            }}
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
          onClick={() => handleSelectResource("products")}
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
          onClick={() => handleSelectResource("collections")}
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
          onClick={() => handleSelectResource("pages")}
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
          onClick={() => handleSelectResource("articles")}
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
        <BulkProductsView
          products={products}
          pagination={pagination}
          onPageChange={handlePageChange}
          storeName={shop.name}
          onNotify={setToastMessage}
        />
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
          shopDomain={shopDomain}
          clientId={clientId}
          contentScopeError={contentScopeError}
          onNotify={setToastMessage}
        />
      )}

      {/* RESOURCE VIEW: BLOG ARTICLES */}
      {activeResource === "articles" && (
        <BulkArticlesView
          articles={articles}
          storeName={shop.name}
          shopDomain={shopDomain}
          clientId={clientId}
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
