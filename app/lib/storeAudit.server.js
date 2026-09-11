import fs from "fs";
import path from "path";
import { isTitleOk } from "./seoCopy";

// Persistent JSON cache path (persisted with SQLite DB in prisma/ or /app/data/)
const CACHE_DIR = process.env.NODE_ENV === "production" && fs.existsSync("/app/data")
  ? "/app/data"
  : path.resolve(process.cwd(), "prisma");

function getCacheFilePath(shop) {
  const safeShop = String(shop || "default").replace(/[^a-zA-Z0-9.-]/g, "_");
  return path.join(CACHE_DIR, `audit-stats-${safeShop}.json`);
}

// In-memory cache for fast repeated reads
const memoryCache = new Map();

/**
 * Load cached stats for a shop
 */
export function readCachedStats(shop) {
  if (memoryCache.has(shop)) {
    return memoryCache.get(shop);
  }

  const filePath = getCacheFilePath(shop);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      memoryCache.set(shop, data);
      return data;
    }
  } catch (err) {
    console.warn("Failed to read audit cache file:", err.message);
  }
  return null;
}

/**
 * Save audit stats to memory and persistent JSON
 */
export function writeCachedStats(shop, stats) {
  const filePath = getCacheFilePath(shop);
  memoryCache.set(shop, stats);
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to write audit cache file:", err.message);
  }
}

/**
 * Compute derived metrics given totals and counts
 */
export function computeMetrics(
  totalProducts,
  withSeoTitle,
  withSeoDesc,
  withOptimalTitle,
  withKeywords = 0
) {
  const total = Math.max(0, Number(totalProducts) || 0);
  const titles = Math.min(total, Math.max(0, Number(withSeoTitle) || 0));
  const descs = Math.min(total, Math.max(0, Number(withSeoDesc) || 0));
  const optimal = Math.min(total, Math.max(0, Number(withOptimalTitle) || 0));
  const keywords = Math.min(total, Math.max(0, Number(withKeywords) || 0));

  const missingTitle = Math.max(0, total - titles);
  const missingDesc = Math.max(0, total - descs);
  const missingKeywords = Math.max(0, total - keywords);

  const titleCoveragePct = total > 0 ? Math.round((titles / total) * 100) : 0;
  const descCoveragePct = total > 0 ? Math.round((descs / total) * 100) : 0;
  const optimalTitlePct = total > 0 ? Math.round((optimal / total) * 100) : 0;
  const keywordCoveragePct = total > 0 ? Math.round((keywords / total) * 100) : 0;

  const seoScore = total > 0
    ? Math.round(((titles + descs + keywords) / (total * 3)) * 100)
    : 0;

  return {
    totalProducts: total,
    withSeoTitle: titles,
    withSeoDesc: descs,
    withOptimalTitle: optimal,
    withKeywords: keywords,
    missingTitle,
    missingDesc,
    missingKeywords,
    titleCoveragePct,
    descCoveragePct,
    optimalTitlePct,
    keywordCoveragePct,
    seoScore,
  };
}

/**
 * Check the status of current Bulk Operation and process if COMPLETED
 */
export async function checkAndProcessBulkOperation(admin, shop, totalCatalogProducts) {
  const query = `#graphql
    query getCurrentBulkOperation {
      currentBulkOperation(type: QUERY) {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    const json = await response.json();
    const op = json?.data?.currentBulkOperation;

    if (!op) {
      return { status: "NONE", op: null };
    }

    if (op.status === "RUNNING" || op.status === "CREATED") {
      return { status: "RUNNING", op };
    }

    if (op.status === "COMPLETED" && op.url) {
      // Check if we have already processed this exact bulk operation ID
      const cached = readCachedStats(shop);
      if (cached && cached.bulkOperationId === op.id) {
        const updated = {
          ...cached,
          ...computeMetrics(
            totalCatalogProducts || cached.totalProducts,
            cached.withSeoTitle,
            cached.withSeoDesc,
            cached.withOptimalTitle,
            cached.withKeywords || 0
          ),
        };
        return { status: "COMPLETED", op, stats: updated };
      }

      // Download and parse JSONL
      console.log(`[StoreAudit] Downloading bulk operation JSONL from Shopify for ${shop}...`);
      const fileRes = await fetch(op.url);
      if (!fileRes.ok) {
        throw new Error(`Failed to download bulk file: ${fileRes.statusText}`);
      }

      const fileText = await fileRes.text();
      const lines = fileText.split("\n");

      let count = 0;
      let withTitle = 0;
      let withDesc = 0;
      let withOptimal = 0;
      let withKw = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const item = JSON.parse(trimmed);
          // Only process Product nodes
          if (!item.id || !item.id.includes("/Product/")) continue;
          count++;

          const hasTitle = Boolean(item.seo?.title && item.seo.title.trim().length > 0);
          const hasDesc = Boolean(item.seo?.description && item.seo.description.trim().length > 0);
          const isOptimal = isTitleOk(item.seo?.title);
          const hasKeywords = Boolean(
            item.keywordsMetafield?.value &&
            item.keywordsMetafield.value !== "[]" &&
            item.keywordsMetafield.value !== '""'
          );

          if (hasTitle) withTitle++;
          if (hasDesc) withDesc++;
          if (isOptimal) withOptimal++;
          if (hasKeywords) withKw++;
        } catch (e) {
          // ignore malformed lines
        }
      }

      const total = totalCatalogProducts || count || 1;
      const metrics = computeMetrics(total, withTitle, withDesc, withOptimal, withKw);

      const stats = {
        ...metrics,
        bulkOperationId: op.id,
        lastAuditedAt: op.completedAt || new Date().toISOString(),
        status: "COMPLETED",
      };

      writeCachedStats(shop, stats);
      console.log(`[StoreAudit] Successfully audited ${count} products for ${shop}:`, stats);
      return { status: "COMPLETED", op, stats };
    }

    return { status: op.status, op };
  } catch (err) {
    console.error("[StoreAudit] Error checking bulk operation:", err);
    return { status: "ERROR", error: err.message };
  }
}

/**
 * Trigger a new Bulk Operation to audit all products
 */
export async function triggerBulkAudit(admin, shop) {
  const mutation = `#graphql
    mutation runCatalogAudit($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation {
          id
          status
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const bulkQuery = `
    {
      products {
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
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: { query: bulkQuery },
    });
    const json = await response.json();
    const errors = json?.data?.bulkOperationRunQuery?.userErrors || [];

    if (errors.length > 0) {
      const errorMsg = errors.map((e) => e.message).join(", ");
      console.warn("[StoreAudit] Bulk operation user error:", errorMsg);
      return { success: false, error: errorMsg };
    }

    const op = json?.data?.bulkOperationRunQuery?.bulkOperation;
    console.log(`[StoreAudit] Triggered bulk operation ${op?.id} for ${shop}`);
    return { success: true, operation: op };
  } catch (err) {
    console.error("[StoreAudit] Failed to trigger bulk audit:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Helper to compute initial preliminary stats while bulk operation is scanning
 */
function computePreliminaryStats(total, sampleProducts = []) {
  const sampleCount = sampleProducts.length;
  let withTitle = 0;
  let withDesc = 0;
  let withOptimal = 0;
  let withKw = 0;

  if (sampleCount > 0) {
    withTitle = sampleProducts.filter((p) => p.seo?.title && p.seo.title.trim().length > 0).length;
    withDesc = sampleProducts.filter((p) => p.seo?.description && p.seo.description.trim().length > 0).length;
    withOptimal = sampleProducts.filter((p) => isTitleOk(p.seo?.title)).length;
    withKw = sampleProducts.filter((p) => {
      const val = p.keywordsMetafield?.value;
      return Boolean(val && val.trim().length > 0 && val !== "[]" && val !== '""');
    }).length;
  }

  return computeMetrics(total, withTitle, withDesc, withOptimal, withKw);
}

/**
 * Get store audit stats - reads cache, checks bulk operation, or initiates audit
 */
export async function getStoreAuditStats(admin, shop, totalCatalogProducts, firstBatchProducts = []) {
  const total = Number(totalCatalogProducts) || 0;

  // 1. Check if we have cached stats
  const cached = readCachedStats(shop);
  if (cached && cached.status === "COMPLETED") {
    const stats = {
      ...cached,
      ...computeMetrics(
        total > 0 ? total : cached.totalProducts,
        cached.withSeoTitle,
        cached.withSeoDesc,
        cached.withOptimalTitle,
        cached.withKeywords || 0
      ),
    };
    return {
      stats,
      isAuditing: false,
      lastAuditedAt: cached.lastAuditedAt || null,
    };
  }

  // 2. Check current bulk operation in Shopify
  const bulkResult = await checkAndProcessBulkOperation(admin, shop, total);
  if (bulkResult.status === "COMPLETED" && bulkResult.stats) {
    return {
      stats: bulkResult.stats,
      isAuditing: false,
      lastAuditedAt: bulkResult.stats.lastAuditedAt || null,
    };
  }

  if (bulkResult.status === "RUNNING") {
    const preliminary = computePreliminaryStats(total, firstBatchProducts);
    return {
      stats: preliminary,
      isAuditing: true,
      lastAuditedAt: null,
    };
  }

  // 3. Trigger full audit
  console.log(`[StoreAudit] Initiating full catalog audit for ${shop}...`);
  await triggerBulkAudit(admin, shop);

  const preliminary = computePreliminaryStats(total, firstBatchProducts);
  return {
    stats: preliminary,
    isAuditing: true,
    lastAuditedAt: null,
  };
}

/**
 * Update cached stats when an SEO change is saved via Single or Bulk Optimizer
 */
export function updateAuditStatsOnSave(
  shop,
  { addedTitles = 0, addedDescs = 0, addedOptimal = 0, addedKeywords = 0 }
) {
  const cached = readCachedStats(shop);
  if (!cached) return;

  const newTitles = Math.min(cached.totalProducts, cached.withSeoTitle + addedTitles);
  const newDescs = Math.min(cached.totalProducts, cached.withSeoDesc + addedDescs);
  const newOptimal = Math.min(cached.totalProducts, cached.withOptimalTitle + addedOptimal);
  const newKeywords = Math.min(cached.totalProducts, (cached.withKeywords || 0) + addedKeywords);

  const updated = {
    ...cached,
    ...computeMetrics(cached.totalProducts, newTitles, newDescs, newOptimal, newKeywords),
    lastAuditedAt: new Date().toISOString(),
  };

  writeCachedStats(shop, updated);
}
