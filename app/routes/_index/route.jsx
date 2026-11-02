import { redirect, useNavigate } from "react-router";
import { useState } from "react";

/**
 * Root Route:
 * - When accessed from inside Shopify Admin (has ?shop, ?host, ?embedded, ?id_token),
 *   seamlessly forward to the embedded App Dashboard (/app).
 * - When visited directly in a web browser (e.g. https://seooptimizer.zooq.app/),
 *   display the official App Installation Webpage where merchants can connect their store.
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
  return { isPublicLanding: true };
};

export default function InstallLandingPage() {
  const navigate = useNavigate();
  const [shopDomain, setShopDomain] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [error, setError] = useState("");

  const handleInstall = (e) => {
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
        backgroundColor: "#f8fafc",
        color: "#0f172a",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .landing-container {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .feature-box:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
          border-color: #6366f1;
        }
        .feature-box {
          transition: all 0.25s ease;
        }
        .install-submit-btn:hover {
          background: #4338ca !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
        }
        .install-submit-btn:active {
          transform: translateY(0);
        }
        .install-submit-btn {
          transition: all 0.2s ease;
        }
      `}</style>

      {/* Navigation Header */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: "1140px",
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 2px 6px rgba(79, 70, 229, 0.3)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "17px", fontWeight: "700", color: "#0f172a", letterSpacing: "-0.01em" }}>
                AI SEO Dashboard
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "500" }}>
                Built Natively for Shopify
              </div>
            </div>
          </div>

          <a
            href="#install-card"
            style={{
              background: "#008060",
              color: "#ffffff",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: "600",
              padding: "9px 18px",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Install App
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="landing-container" style={{ flex: 1, maxWidth: "1140px", margin: "0 auto", padding: "48px 24px 64px", width: "100%" }}>
        {/* Hero Section */}
        <div style={{ textAlign: "center", maxWidth: "760px", margin: "0 auto 40px auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "999px",
              background: "#eef2ff",
              color: "#4338ca",
              fontSize: "12px",
              fontWeight: "600",
              marginBottom: "20px",
              border: "1px solid #c7d2fe",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z"/>
            </svg>
            AI-Powered SEO for Shopify Stores
          </div>

          <h1
            style={{
              fontSize: "clamp(32px, 4.5vw, 46px)",
              fontWeight: "800",
              lineHeight: "1.15",
              margin: "0 0 18px 0",
              color: "#0f172a",
              letterSpacing: "-0.03em",
            }}
          >
            Fix Your Store's SEO in <span style={{ color: "#4f46e5" }}>Minutes</span>, Not Months
          </h1>

          <p
            style={{
              fontSize: "17px",
              color: "#475569",
              lineHeight: "1.6",
              margin: "0 0 32px 0",
              fontWeight: "400",
            }}
          >
            Generate high-converting SEO titles, click-worthy meta descriptions, targeted keywords, and accessible image ALT text for your entire catalog with one click.
          </p>
        </div>

        {/* Installation Connect Card */}
        <div
          id="install-card"
          style={{
            maxWidth: "600px",
            margin: "0 auto 56px auto",
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #cbd5e1",
            boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.08)",
            padding: "36px 32px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "#ecfdf5",
              color: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>

          <h2 style={{ fontSize: "21px", fontWeight: "700", color: "#0f172a", margin: "0 0 8px 0" }}>
            Connect Your Shopify Store
          </h2>
          <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 24px 0", lineHeight: "1.5" }}>
            Enter your Shopify store domain to launch the secure Shopify App authorization.
          </p>

          <form onSubmit={handleInstall} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "240px", position: "relative" }}>
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
                    padding: "13px 16px",
                    borderRadius: "10px",
                    border: `1.5px solid ${error ? "#ef4444" : inputFocused ? "#4f46e5" : "#cbd5e1"}`,
                    fontSize: "14px",
                    outline: "none",
                    background: "#f8fafc",
                    color: "#0f172a",
                    boxShadow: inputFocused ? "0 0 0 3px rgba(79, 70, 229, 0.15)" : "none",
                    transition: "all 0.2s ease",
                  }}
                />
              </div>

              <button
                type="submit"
                className="install-submit-btn"
                style={{
                  background: "#4f46e5",
                  color: "#ffffff",
                  fontWeight: "600",
                  fontSize: "14px",
                  padding: "13px 24px",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
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
              <div style={{ fontSize: "13px", color: "#ef4444", textAlign: "left", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}
          </form>

          <div
            style={{
              marginTop: "20px",
              paddingTop: "16px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "20px",
              fontSize: "12px",
              color: "#64748b",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              No coding required
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Theme-friendly metafields
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Works with all Shopify plans
            </span>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <h3 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", margin: "0 0 8px 0" }}>
            Everything You Need for Search Domination
          </h3>
          <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
            Automate tedious SEO work while keeping full editorial control.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "20px",
            marginBottom: "48px",
          }}
        >
          {/* Card 1 */}
          <div
            className="feature-box"
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "#eff6ff",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
              </svg>
            </div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
              Live Store SEO Score
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6", margin: 0 }}>
              Live 0–100 health audit across Products, Collections, Pages, and Blogs with breakdown progress bars and status indicators.
            </p>
          </div>

          {/* Card 2 */}
          <div
            className="feature-box"
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "#f5f3ff",
                color: "#7c3aed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
              1-Click Bulk Optimizer
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6", margin: 0 }}>
              Generate titles (≤ 50 chars), click-worthy descriptions (≤ 150 chars), and keywords in bulk. Inline editing and live character counters.
            </p>
          </div>

          {/* Card 3 */}
          <div
            className="feature-box"
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "#ecfdf5",
                color: "#059669",
                display: "flex",
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
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
              Image ALT Optimizer
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6", margin: 0 }}>
              Scan product images, theme files, and collection banners. Auto-generate WCAG accessible, keyword-optimized ALT text with smart templates.
            </p>
          </div>

          {/* Card 4 */}
          <div
            className="feature-box"
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "#fffbeb",
                color: "#d97706",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
              Safe & Theme-Friendly
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6", margin: 0 }}>
              Dual SEO compatibility writes directly to native SEO fields and theme fallback tags. Chunked bulk saves prevent rate limits.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #e2e8f0",
          background: "#ffffff",
          padding: "24px",
          textAlign: "center",
          fontSize: "13px",
          color: "#94a3b8",
        }}
      >
        <div style={{ maxWidth: "1140px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ fontWeight: "500", color: "#64748b" }}>
            AI SEO Dashboard &bull; Shopify App
          </div>
          <div>
            Fast &bull; Safe &bull; Native
          </div>
        </div>
      </footer>
    </div>
  );
}
