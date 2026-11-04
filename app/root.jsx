import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" type="image/jpeg" href="/app-logo.jpg" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <style>{`
          :root {
            --p-page-width: 100% !important;
            --p-page-max-width: 100% !important;
            --s-page-max-width: 100% !important;
            --s-page-inline-size: 100% !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            background-color: #f8fafc;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            -webkit-font-smoothing: antialiased;
          }
          s-page {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          s-page::part(container),
          s-page::part(page),
          s-page::part(content),
          s-page::part(body),
          .Polaris-Page,
          .Polaris-Page--fullWidth,
          .Polaris-Page__Content,
          div[class*="Polaris-Page"],
          div[class*="Page-Container"] {
            max-width: 100% !important;
            width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
            box-sizing: border-box !important;
          }
        `}</style>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Root boundary caught error:", error);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>SEO Assistant</title>
        <style>{`
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
            box-sizing: border-box;
          }
          .error-card {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 16px;
            padding: 40px 32px;
            max-width: 480px;
            width: 100%;
            text-align: center;
            box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.08);
          }
          .action-btn {
            display: inline-block;
            background: #4f46e5;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 14px;
            margin-top: 20px;
          }
        `}</style>
      </head>
      <body>
        <div className="error-card">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#eef2ff", color: "#4f46e5", display: "inline-flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", margin: "0 0 8px 0" }}>
            SEO Assistant
          </h2>
          <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.5", margin: 0 }}>
            Connect your Shopify store or open the app directly from your Shopify Admin panel.
          </p>
          <a href="/" className="action-btn">
            Go to Installation Page &rarr;
          </a>
        </div>
      </body>
    </html>
  );
}
