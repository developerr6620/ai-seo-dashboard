import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <style>{`
          :root {
            --p-page-width: 100% !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            background-color: #f8fafc;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            -webkit-font-smoothing: antialiased;
          }
          s-page {
            display: block;
            width: 100% !important;
            max-width: 100% !important;
          }
          s-page::part(container),
          s-page::part(page),
          .Polaris-Page,
          .Polaris-Page--fullWidth {
            max-width: 100% !important;
            width: 100% !important;
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
