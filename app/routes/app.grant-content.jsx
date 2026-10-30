import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { scopes, session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  if (scopes?.request) {
    try {
      await scopes.request(["write_content"]);
    } catch (responseOrError) {
      if (responseOrError instanceof Response) {
        throw responseOrError;
      }
    }
  }

  // Direct OAuth authorize URL to prompt Shopify permission screen
  const appUrl = process.env.SHOPIFY_APP_URL || "https://seooptimizer.zooq.app";
  const clientId = process.env.SHOPIFY_API_KEY || "cdeb2fd429e5b0cceb3d43906b7f2148";
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=write_products,write_files,write_content&redirect_uri=${encodeURIComponent(appUrl + "/auth/callback")}`;

  return redirect(authUrl);
};

export default function GrantContent() {
  return null;
}
