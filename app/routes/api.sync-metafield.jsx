import { authenticate } from "../shopify.server";
import {
  ensureKeywordsMetafieldDefinition,
  clearVerifiedShops,
} from "../lib/metafieldDefinitions.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  // Force cache clear for this shop
  clearVerifiedShops(shop);

  const result = await ensureKeywordsMetafieldDefinition(admin, shop);
  return Response.json({
    success: result.success,
    result,
    shop,
  });
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  clearVerifiedShops(shop);
  const result = await ensureKeywordsMetafieldDefinition(admin, shop);
  return Response.json({
    success: result.success,
    result,
    shop,
  });
};
