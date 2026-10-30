import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR Webhook: customers/redact
 * Triggered when a customer requests deletion of their personal data.
 * Since this app does not store customer personal data, return 200 OK.
 */
export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`[Compliance] Received ${topic} for ${shop}`);
  return new Response(null, { status: 200 });
};

