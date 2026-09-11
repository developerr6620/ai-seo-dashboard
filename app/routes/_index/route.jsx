import { redirect, useNavigate } from "react-router";
import { useState } from "react";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  // If request has Shopify params, redirect directly into the embedded Shopify App flow
  if (
    url.searchParams.get("shop") ||
    url.searchParams.get("host") ||
    url.searchParams.get("embedded")
  ) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }
  return { isPublicLanding: true };
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [shopDomain, setShopDomain] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  const handleInstall = (e) => {
    e.preventDefault();
    if (!shopDomain.trim()) return;
    let clean = shopDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!clean.includes(".myshopify.com")) {
      clean = `${clean}.myshopify.com`;
    }
    navigate(`/auth/login?shop=${encodeURIComponent(clean)}`);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f6f6f7",
        color: "#202223",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .feature-card:hover {
          border-color: #008060 !important;
          box-shadow: 0 4px 16px rgba(0,128,96,0.12) !important;
          transform: translateY(-2px);
        }
        .feature-card {
          transition: all 0.2s ease;
        }
        .install-btn:hover {
          background: #006e52 !important;
        }
        .install-btn {
          transition: background 0.2s ease;
        }
      `}</style>

      {/* Header */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e1e3e5",
          padding: "0 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: "60px",
          maxWidth: "1280px",
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #008060 0%, #004c3f 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
            }}
          >
            ⚡
          </div>
          <span style={{ fontSize: "16px", fontWeight: "700", color: "#202223" }}>
            AI SEO Dashboard
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "600",
              background: "#e3f8e0",
              color: "#108043",
              padding: "2px 8px",
              borderRadius: "10px",
              border: "1px solid #bbf7d0",
            }}
          >
            For Shopify
          </span>
        </div>

        <a
          href="#install-section"
          className="install-btn"
          style={{
            color: "#ffffff",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: "600",
            padding: "8px 18px",
            borderRadius: "8px",
            background: "#008060",
            border: "none",
            cursor: "pointer",
          }}
        >
          Install App
        </a>
      </header>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "48px 24px 64px",
          width: "100%",
          boxSizing: "border-box",
          animation: "fadeUp 0.4s ease both",
        }}
      >
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 14px",
              borderRadius: "20px",
              background: "#e3f8e0",
              color: "#108043",
              fontSize: "13px",
              fontWeight: "600",
              marginBottom: "20px",
              border: "1px solid #bbf7d0",
            }}
          >
            🚀 Shopify SEO Automation
          </div>

          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 44px)",
              fontWeight: "800",
              lineHeight: "1.2",
              margin: "0 0 16px 0",
              letterSpacing: "-0.5px",
              color: "#202223",
            }}
          >
            AI-Powered SEO for Your{" "}
            <span style={{ color: "#008060" }}>Shopify Store</span>
          </h1>

          <p
            style={{
              fontSize: "17px",
              lineHeight: "1.6",
              color: "#6d7175",
              maxWidth: "560px",
              margin: "0 auto 36px auto",
            }}
          >
            Instantly audit your catalog, fix missing meta tags, and generate
            optimized Google-ready titles and descriptions — all inside Shopify.
          </p>

          <a
            href="#install-section"
            className="install-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "#008060",
              color: "#ffffff",
              padding: "14px 30px",
              borderRadius: "10px",
              fontSize: "16px",
              fontWeight: "700",
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(0,128,96,0.25)",
            }}
          >
            🛍️ Install on Shopify
          </a>
        </div>

        {/* Features */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            marginBottom: "48px",
          }}
        >
          {[
            {
              icon: "📊",
              title: "Store SEO Health Score",
              desc: "Audit your entire catalog in seconds. Get an instant 0–100 score with actionable gaps highlighted.",
            },
            {
              icon: "⚡",
              title: "AI Title & Description Generator",
              desc: "Generates clean titles under 50 characters and complete meta descriptions under 150 — no cutoffs.",
            },
            {
              icon: "🔍",
              title: "Live Google Preview",
              desc: "See exactly how your listing appears on Google before publishing to Shopify.",
            },
            {
              icon: "🚀",
              title: "Bulk Optimizer",
              desc: "Fix SEO for multiple products at once with batch processing and live progress tracking.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="feature-card"
              style={{
                background: "#ffffff",
                border: "1px solid #e1e3e5",
                borderRadius: "12px",
                padding: "24px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>{f.icon}</div>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "#202223", marginBottom: "8px" }}>
                {f.title}
              </div>
              <div style={{ fontSize: "13px", color: "#6d7175", lineHeight: "1.6" }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Install Section */}
        <div
          id="install-section"
          style={{
            background: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "16px",
            padding: "40px 32px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>🛍️</div>
          <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#202223", margin: "0 0 8px 0" }}>
            Connect Your Shopify Store
          </h2>
          <p style={{ fontSize: "14px", color: "#6d7175", margin: "0 0 28px 0", lineHeight: "1.6" }}>
            Enter your Shopify store domain to install AI SEO Dashboard directly
            into your admin panel.
          </p>

          <form
            onSubmit={handleInstall}
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "10px",
              maxWidth: "460px",
              margin: "0 auto",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              id="shop-domain-input"
              placeholder="your-store.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              style={{
                flex: 1,
                minWidth: "220px",
                padding: "12px 16px",
                borderRadius: "8px",
                background: "#f6f6f7",
                border: `1.5px solid ${inputFocused ? "#008060" : "#c9cccf"}`,
                color: "#202223",
                fontSize: "14px",
                outline: "none",
                transition: "border-color 0.2s ease",
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              id="connect-store-btn"
              className="install-btn"
              style={{
                padding: "12px 24px",
                borderRadius: "8px",
                background: "#008060",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: "700",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Connect Store →
            </button>
          </form>

          <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "16px", marginBottom: 0 }}>
            Free to install • Works with all Shopify plans
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #e1e3e5",
          padding: "20px 24px",
          textAlign: "center",
          fontSize: "13px",
          color: "#9ca3af",
          background: "#ffffff",
        }}
      >
        AI SEO Dashboard &bull; Built for Shopify
      </footer>
    </div>
  );
}
