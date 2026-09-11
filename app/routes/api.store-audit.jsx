import { authenticate } from "../shopify.server";
import {
  checkAndProcessBulkOperation,
  triggerBulkAudit,
  readCachedStats,
} from "../lib/storeAudit.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Get latest total count
    const countRes = await admin.graphql(
      `#graphql
      query getCount {
        productsCount(limit: null) {
          count
        }
      }`
    );
    const countJson = await countRes.json();
    const totalCount = countJson?.data?.productsCount?.count || 0;

    // Check bulk operation status
    const result = await checkAndProcessBulkOperation(admin, shop, totalCount);

    const cached = readCachedStats(shop);
    const isAuditing = result.status === "RUNNING" || result.status === "CREATED";

    return Response.json({
      success: true,
      status: result.status,
      isAuditing,
      stats: result.stats || cached || null,
      lastAuditedAt: result.stats?.lastAuditedAt || cached?.lastAuditedAt || null,
    });
  } catch (error) {
    console.error("[api.store-audit] Loader error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const res = await triggerBulkAudit(admin, shop);
    return Response.json(res);
  } catch (error) {
    console.error("[api.store-audit] Action error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
};
