import { redirect } from "react-router";
import { useState } from "react";

/**
 * Root Route:
 * - When accessed from inside Shopify Admin (has ?shop, ?host, ?embedded, ?id_token),
 *   seamlessly forwards to the embedded App Dashboard (/app).
 * - When visited directly in a web browser (https://seooptimizer.zooq.app/),
 *   displays the newly styled, high-converting Install Dashboard.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (
    url.searchParams.get("shop") ||
    url.searchParams.get("host") ||
    url.searchParams.get("embedded") ||
    url.searchParams.get("id_token")
  ) {
    return redirect(`/app${url.search}`);
  }
  return null;
};

export default function InstallDashboard() {
  const [shopDomain, setShopDomain] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = (e) => {
    e.preventDefault();
    setError("");
    const raw = shopDomain.trim().toLowerCase();
    if (!raw) {
      setError("Please enter your Shopify store domain.");
      return;
    }

    let clean = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!clean.includes(".")) {
      clean = `${clean}.myshopify.com`;
    }

    if (!clean.includes(".myshopify.com")) {
      setError("Please enter a valid myshopify.com store domain (e.g. your-store.myshopify.com).");
      return;
    }

    // Redirect to Shopify OAuth install login flow
    window.location.href = `/auth/login?shop=${encodeURIComponent(clean)}`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#fcfbfe",
        color: "#0f172a",
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
      }}
    >
      {/* Import Plus Jakarta Sans font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .gradient-text {
          background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #6366f1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .install-card {
          background: #ffffff;
          border: 1px solid #ede9fe;
          border-radius: 20px;
          box-shadow: 0 10px 30px -5px rgba(124, 58, 237, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.04);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .feature-card {
          background: #ffffff;
          border: 1px solid #ede9fe;
          border-radius: 16px;
          padding: 26px 24px;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.04);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .feature-card:hover {
          transform: translateY(-3px);
          border-color: #c4b5fd;
          box-shadow: 0 12px 28px -4px rgba(124, 58, 237, 0.12);
        }

        .btn-gradient {
          background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
          color: #ffffff;
          border: none;
          cursor: pointer;
          font-weight: 700;
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);
          transition: all 0.2s ease;
        }

        .btn-gradient:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(124, 58, 237, 0.45);
        }

        @media (max-width: 767px) {
          .feature-grid {
            grid-template-columns: 1fr !important;
          }
          .header-btn {
            display: none !important;
          }
        }
      `}</style>

      {/* Header */}
      <header
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #ede9fe",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            padding: "16px 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", letterSpacing: "-0.3px" }}>
                AI SEO Dashboard
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                Built Natively for Shopify
              </div>
            </div>
          </div>

          <a
            href="#install-card"
            className="btn-gradient header-btn"
            style={{
              padding: "10px 22px",
              borderRadius: "8px",
              fontSize: "13.5px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Install App
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, maxWidth: "1400px", margin: "0 auto", padding: "64px 32px 80px 32px", width: "100%" }}>
        
        {/* Hero Section */}
        <div style={{ textAlign: "center", maxWidth: "820px", margin: "0 auto 40px auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 16px",
              borderRadius: "50px",
              background: "#f5f3ff",
              border: "1px solid #ede9fe",
              color: "#7c3aed",
              fontSize: "13px",
              fontWeight: "700",
              marginBottom: "20px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z"/>
            </svg>
            AI-Powered SEO for Shopify Stores
          </div>

          <h1
            style={{
              fontSize: "clamp(34px, 4.5vw, 48px)",
              fontWeight: "800",
              lineHeight: "1.18",
              letterSpacing: "-1px",
              color: "#0f172a",
              marginBottom: "18px",
            }}
          >
            Fix Your Store's SEO in <span className="gradient-text">Minutes, Not Months</span>
          </h1>

          <p
            style={{
              fontSize: "17px",
              color: "#475569",
              lineHeight: "1.65",
              margin: "0 auto 36px auto",
              maxWidth: "720px",
            }}
          >
            Generate high-converting SEO titles, click-worthy meta descriptions, targeted keywords, and accessible image ALT text for your entire catalog with one click.
          </p>
        </div>

        {/* Connect Your Shopify Store Card */}
        <div
          id="install-card"
          className="install-card"
          style={{
            maxWidth: "640px",
            margin: "0 auto 64px auto",
            padding: "40px 36px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              background: "#ecfdf5",
              color: "#059669",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.15)",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>

          <h2 style={{ fontSize: "23px", fontWeight: "800", color: "#0f172a", marginBottom: "8px", letterSpacing: "-0.3px" }}>
            Connect Your Shopify Store
          </h2>
          <p style={{ fontSize: "14.5px", color: "#64748b", marginBottom: "26px", lineHeight: "1.5" }}>
            Enter your Shopify store domain to launch the secure Shopify App authorization.
          </p>

          <form onSubmit={handleConnect} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "240px" }}>
                <input
                  type="text"
                  placeholder="your-store.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => {
                    setShopDomain(e.target.value);
                    if (error) setError("");
                  }}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  style={{
                    width: "100%",
                    padding: "14px 18px",
                    borderRadius: "10px",
                    border: `1.5px solid ${error ? "#ef4444" : inputFocused ? "#7c3aed" : "#cbd5e1"}`,
                    fontSize: "14.5px",
                    fontFamily: "inherit",
                    color: "#0f172a",
                    background: "#f8fafc",
                    outline: "none",
                    boxShadow: inputFocused ? "0 0 0 4px rgba(124, 58, 237, 0.12)" : "none",
                    transition: "all 0.2s ease",
                  }}
                />
              </div>

              <button
                type="submit"
                className="btn-gradient"
                style={{
                  padding: "14px 28px",
                  borderRadius: "10px",
                  fontSize: "14.5px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  whiteSpace: "nowrap",
                }}
              >
                <span>Connect Store</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            {error && (
              <div style={{ fontSize: "13px", color: "#ef4444", textAlign: "left", paddingLeft: "4px", fontWeight: "600" }}>
                {error}
              </div>
            )}
          </form>

          <div
            style={{
              marginTop: "22px",
              paddingTop: "16px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "20px",
              fontSize: "12.5px",
              color: "#64748b",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              No coding required
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Theme-friendly metafields
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Works with all Shopify plans
            </span>
          </div>
        </div>

        {/* Feature Cards Section */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", marginBottom: "8px", letterSpacing: "-0.3px" }}>
            Everything You Need for Search Domination
          </h3>
          <p style={{ fontSize: "15px", color: "#64748b" }}>
            Automate tedious SEO work while keeping full editorial control.
          </p>
        </div>

        <div
          className="feature-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "22px",
          }}
        >
          {/* Card 1 */}
          <div className="feature-card">
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "#eff6ff",
                color: "#2563eb",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
              </svg>
            </div>
            <div style={{ fontSize: "17px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
              Live Store SEO Score
            </div>
            <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.6" }}>
              Live 0–100 health audit across Products, Collections, Pages, and Blogs with breakdown progress bars and status indicators.
            </p>
          </div>

          {/* Card 2 */}
          <div className="feature-card">
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "#f5f3ff",
                color: "#7c3aed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div style={{ fontSize: "17px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
              1-Click Bulk Optimizer
            </div>
            <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.6" }}>
              Generate titles (≤ 50 chars), click-worthy descriptions (≤ 150 chars), and keywords in bulk. Inline editing and live character counters.
            </p>
          </div>

          {/* Card 3 */}
          <div className="feature-card">
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "#ecfdf5",
                color: "#059669",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <div style={{ fontSize: "17px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
              Image ALT Optimizer
            </div>
            <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.6" }}>
              Scan product images, theme files, and collection banners. Auto-generate WCAG accessible, keyword-optimized ALT text with smart templates.
            </p>
          </div>

          {/* Card 4 */}
          <div className="feature-card">
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "#fffbeb",
                color: "#d97706",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div style={{ fontSize: "17px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
              Safe & Theme-Friendly
            </div>
            <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.6" }}>
              Dual SEO compatibility writes directly to native SEO fields and theme fallback tags. Chunked bulk saves prevent rate limits.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #ede9fe",
          background: "#ffffff",
          padding: "24px 32px",
          fontSize: "13px",
          color: "#94a3b8",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ fontWeight: "600", color: "#64748b" }}>
            AI SEO Dashboard &bull; Shopify App
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            <a href="/privacy.html" style={{ color: "#64748b", textDecoration: "none" }}>Privacy Policy</a>
            <span>&bull;</span>
            <a href="mailto:developerr6620@gmail.com" style={{ color: "#64748b", textDecoration: "none" }}>Merchant Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
