import { redirect } from "react-router";
import { useState } from "react";
import { Link } from "react-router";

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
  const [shopDomain, setShopDomain] = useState("");

  const handleInstall = (e) => {
    e.preventDefault();
    if (!shopDomain.trim()) return;
    let clean = shopDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!clean.includes(".myshopify.com")) {
      clean = `${clean}.myshopify.com`;
    }
    window.location.href = `/auth/login?shop=${encodeURIComponent(clean)}`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0b0f19",
        color: "#f3f4f6",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Navigation */}
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1200px",
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              boxShadow: "0 0 20px rgba(16, 185, 129, 0.4)",
            }}
          >
            ⚡
          </div>
          <span style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "-0.5px" }}>
            AI SEO Dashboard
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "600",
              background: "rgba(16,185,129,0.15)",
              color: "#34d399",
              padding: "2px 8px",
              borderRadius: "12px",
              border: "1px solid rgba(16,185,129,0.3)",
            }}
          >
            Shopify Native
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            to="/demo"
            style={{
              color: "#e5e7eb",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: "500",
              padding: "8px 14px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              transition: "all 0.2s ease",
            }}
          >
            ✨ Live Demo
          </Link>
          <a
            href="#install-section"
            style={{
              color: "#ffffff",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: "600",
              padding: "8px 16px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
              boxShadow: "0 2px 10px rgba(5,150,105,0.3)",
              transition: "all 0.2s ease",
            }}
          >
            Install App
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, maxWidth: "1100px", margin: "0 auto", padding: "60px 24px", width: "100%", boxSizing: "border-box" }}>
        <div style={{ textAlign: "center", marginBottom: "50px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 16px",
              borderRadius: "20px",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              color: "#34d399",
              fontSize: "13px",
              fontWeight: "600",
              marginBottom: "24px",
            }}
          >
            <span>🚀 100% Automated SEO for Shopify Merchants</span>
          </div>

          <h1
            style={{
              fontSize: " clamp(32px, 5vw, 54px)",
              fontWeight: "800",
              lineHeight: "1.15",
              margin: "0 0 20px 0",
              letterSpacing: "-1px",
              background: "linear-gradient(180deg, #ffffff 0%, #9ca3af 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Turn Missing Meta Tags Into <br />
            <span style={{ background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Google First-Page Rankings
            </span>
          </h1>

          <p
            style={{
              fontSize: "18px",
              lineHeight: "1.6",
              color: "#9ca3af",
              maxWidth: "680px",
              margin: "0 auto 36px auto",
            }}
          >
            Instantly audit your entire Shopify catalog, calculate your SEO Health Score,
            and generate high-converting, pixel-perfect Google SERP titles and descriptions in one click.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/demo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#ffffff",
                padding: "14px 28px",
                borderRadius: "10px",
                fontSize: "16px",
                fontWeight: "700",
                textDecoration: "none",
                boxShadow: "0 4px 20px rgba(16,185,129,0.35)",
                transition: "transform 0.2s ease",
              }}
            >
              <span>🚀 Launch Live Interactive Demo</span>
              <span>→</span>
            </Link>

            <a
              href="#install-section"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#e5e7eb",
                padding: "14px 24px",
                borderRadius: "10px",
                fontSize: "16px",
                fontWeight: "600",
                textDecoration: "none",
              }}
            >
              🛍️ Install on Shopify
            </a>
          </div>

          <div style={{ marginTop: "16px", fontSize: "13px", color: "#6b7280" }}>
            ✨ No terminal, server setup, or Shopify store login needed to explore the live demo
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "24px",
            marginBottom: "60px",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "28px",
              transition: "border-color 0.2s ease",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>📊</div>
            <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "10px", color: "#ffffff" }}>
              Store-Wide SEO Health Score
            </h3>
            <p style={{ fontSize: "14px", color: "#9ca3af", lineHeight: "1.6", margin: 0 }}>
              Audit your entire catalog in seconds. Get an instant 0–100 score analyzing title lengths, missing meta descriptions, and search optimization gaps.
            </p>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "28px",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>⚡</div>
            <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "10px", color: "#ffffff" }}>
              AI SERP Clamp Engine
            </h3>
            <p style={{ fontSize: "14px", color: "#9ca3af", lineHeight: "1.6", margin: 0 }}>
              Generates complete titles under 50 characters and full-sentence descriptions under 150 characters — no mid-sentence cutoffs.
            </p>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "28px",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔍</div>
            <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "10px", color: "#ffffff" }}>
              Live Google Search Preview
            </h3>
            <p style={{ fontSize: "14px", color: "#9ca3af", lineHeight: "1.6", margin: 0 }}>
              Preview exactly how your product listing appears on desktop and mobile Google Search before saving directly to your Shopify store.
            </p>
          </div>
        </div>

        {/* Live Demo Banner Card */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.05) 100%)",
            border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: "20px",
            padding: "36px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            marginBottom: "60px",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎮</div>
          <h2 style={{ fontSize: "24px", fontWeight: "800", color: "#ffffff", margin: "0 0 10px 0" }}>
            Experience It Live in Your Browser
          </h2>
          <p style={{ fontSize: "15px", color: "#d1d5db", maxWidth: "600px", margin: "0 0 24px 0", lineHeight: "1.6" }}>
            Test out the AI optimizer, tweak brand tone, generate variations, and watch the SEO score change in real time with our interactive sandbox store.
          </p>
          <Link
            to="/demo"
            style={{
              background: "#10b981",
              color: "#ffffff",
              fontWeight: "700",
              fontSize: "15px",
              padding: "12px 28px",
              borderRadius: "8px",
              textDecoration: "none",
              boxShadow: "0 4px 15px rgba(16,185,129,0.4)",
            }}
          >
            Open Interactive Demo →
          </Link>
        </div>

        {/* Merchant Install Section */}
        <div
          id="install-section"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "20px",
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#ffffff", margin: "0 0 8px 0" }}>
            Have a Shopify Store? Connect Now
          </h2>
          <p style={{ fontSize: "14px", color: "#9ca3af", margin: "0 0 24px 0" }}>
            Enter your Shopify store domain to install the AI SEO Dashboard directly into your store admin.
          </p>

          <form
            onSubmit={handleInstall}
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "12px",
              maxWidth: "480px",
              margin: "0 auto",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              placeholder="your-store.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              style={{
                flex: 1,
                minWidth: "240px",
                padding: "12px 16px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#ffffff",
                fontSize: "14px",
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "12px 24px",
                borderRadius: "8px",
                background: "#10b981",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: "700",
                border: "none",
                cursor: "pointer",
                transition: "background 0.2s ease",
              }}
            >
              Connect Store
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "24px",
          textAlign: "center",
          fontSize: "13px",
          color: "#6b7280",
        }}
      >
        AI SEO Dashboard &bull; Built with React Router & Shopify App Bridge &bull; Live 24/7
      </footer>
    </div>
  );
}
