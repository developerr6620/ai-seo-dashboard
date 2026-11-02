import { redirect } from "react-router";

/**
 * Root Route:
 * When an installed store opens the app from Shopify Admin (with ?shop, ?host, ?appLoadId, etc.)
 * or a merchant accesses the root URL, seamlessly forward them straight to the embedded App Dashboard.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app${url.search}`);
};

export default function Index() {
  return null;
}
