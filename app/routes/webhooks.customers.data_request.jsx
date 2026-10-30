import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR Webhook: customers/data_request
 * Triggered when a customer requests their stored personal data.
 * Since this app does not store customer personal data, return 200 OK.
 */
export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`[Compliance] Received ${topic} for ${shop}`);
  return new Response(null, { status: 200 });
};
