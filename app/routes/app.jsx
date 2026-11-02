import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");
  const idToken = url.searchParams.get("id_token");

  // If accessed directly in a standalone browser without Shopify embedding context,
  // gracefully redirect back to the home / installation page instead of throwing an App Bridge 200 bounce
  if (!shop && !host && !embedded && !idToken && !request.headers.get("authorization")) {
    return redirect("/");
  }

  try {
    await authenticate.admin(request);
  } catch (err) {
    if (err instanceof Response) {
      throw err;
    }
    return redirect("/");
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/bulk-optimizer">SEO Bulk Optimizer</s-link>
        <s-link href="/app/image-alt-optimizer">Image ALT Optimizer</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  try {
    return boundary.error(error);
  } catch (e) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "36px 28px",
            maxWidth: "440px",
            textAlign: "center",
            boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", margin: "0 0 10px 0" }}>
            Shopify Session Required
          </h2>
          <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.5", margin: "0 0 20px 0" }}>
            This page must be opened from inside your Shopify Admin, or connect your store using the installation page.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              background: "#4f46e5",
              color: "#ffffff",
              padding: "10px 20px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            Go to Installation Page &rarr;
          </a>
        </div>
      </div>
    );
  }
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
