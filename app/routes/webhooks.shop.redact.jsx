import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory GDPR Webhook: shop/redact
 * Triggered 48 hours after a merchant uninstalls the app to delete all remaining store data.
 */
export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`[Compliance] Received ${topic} for ${shop}`);

  try {
    if (shop) {
      await db.session.deleteMany({ where: { shop } });
      console.log(`[Compliance] Successfully purged sessions for ${shop}`);
    }
  } catch (error) {
    console.error(`[Compliance] Error purging data for ${shop}:`, error);
  }

  return new Response(null, { status: 200 });
};

