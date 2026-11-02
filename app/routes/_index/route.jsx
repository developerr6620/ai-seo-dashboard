import fs from "fs";
import path from "path";
import { redirect } from "react-router";

/**
 * Root Route:
 * - If accessed from inside Shopify Admin (has ?shop, ?host, ?embedded, ?id_token),
 *   seamlessly forward directly to the embedded App Dashboard (/app).
 * - If visited directly in a web browser (e.g. https://seooptimizer.zooq.app/),
 *   serve the complete high-converting marketing & store installation website!
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // When loaded inside the Shopify Admin iframe, send merchants directly to their Executive Dashboard
  if (
    url.searchParams.get("shop") ||
    url.searchParams.get("host") ||
    url.searchParams.get("embedded") ||
    url.searchParams.get("id_token")
  ) {
    return redirect(`/app${url.search}`);
  }

  // Standalone browser visitor at https://seooptimizer.zooq.app -> serve the public marketing & install website
  try {
    const buildClientPath = path.resolve(process.cwd(), "build", "client", "index.html");
    const publicPath = path.resolve(process.cwd(), "public", "index.html");
    const targetPath = fs.existsSync(buildClientPath) ? buildClientPath : publicPath;

    if (fs.existsSync(targetPath)) {
      const html = fs.readFileSync(targetPath, "utf-8");
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }
  } catch (err) {
    console.error("Failed to read index.html:", err);
  }

  return redirect(`/app${url.search}`);
};

export default function Index() {
  return null;
}
