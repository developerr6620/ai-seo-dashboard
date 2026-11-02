import fs from "fs";
import path from "path";
import { redirect } from "react-router";

/**
 * Root Route:
 * - If accessed from within Shopify Admin (with ?shop, ?host, ?embedded, etc.),
 *   seamlessly forward to the embedded App Dashboard.
 * - If visited directly by a browser (e.g. https://seooptimizer.zooq.app/),
 *   serve the public marketing landing page!
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // If accessed from within Shopify Admin iframe, redirect to /app
  if (
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.has("embedded") ||
    url.searchParams.has("id_token")
  ) {
    return redirect(`/app${url.search}`);
  }

  // Otherwise, serve the public marketing landing page HTML
  try {
    const htmlPath = path.resolve(process.cwd(), "public", "index.html");
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, "utf-8");
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }
  } catch (err) {
    console.error("Failed to load landing page HTML:", err);
  }

  return redirect(`/app${url.search}`);
};

export default function Index() {
  return null;
}
