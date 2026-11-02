import { redirect } from "react-router";

/**
 * Root Route:
 * When accessed from Shopify Admin (or any redirect), seamlessly forward directly
 * to the embedded App Dashboard (/app).
 * There is no installation page shown inside the installed store.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app${url.search}`);
};

export default function Index() {
  return null;
}
