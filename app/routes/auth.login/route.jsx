import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }) => {
  const clone = request.clone();
  try {
    const formData = await clone.formData();
    let shop = formData.get("shop");
    if (shop && typeof shop === "string" && !shop.includes(".")) {
      formData.set("shop", `${shop.trim()}.myshopify.com`);
    }
  } catch (e) {
    // Ignore formData clone issues
  }

  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const [focused, setFocused] = useState(false);
  const { errors } = actionData || loaderData || {};

  const handleDomainSubmit = () => {
    let cleanShop = shop.trim();
    if (cleanShop && !cleanShop.includes(".")) {
      cleanShop = `${cleanShop}.myshopify.com`;
      setShop(cleanShop);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#fcfbfe",
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "#ffffff",
          border: "1px solid #ede9fe",
          borderRadius: "20px",
          boxShadow: "0 10px 30px -5px rgba(124, 58, 237, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.04)",
          padding: "40px 36px",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)",
            color: "#ffffff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "20px",
            boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>

        <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", marginBottom: "8px", letterSpacing: "-0.4px" }}>
          Log in to SEO Assistant
        </h1>
        <p style={{ fontSize: "14.5px", color: "#64748b", marginBottom: "28px", lineHeight: "1.5" }}>
          Enter your Shopify store domain to access your SEO tools and live score audits.
        </p>

        <Form method="post" onSubmit={handleDomainSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input
            type="hidden"
            name="shop"
            value={shop.includes(".") ? shop : (shop ? `${shop}.myshopify.com` : "")}
          />
          <div style={{ textAlign: "left" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#334155", marginBottom: "6px" }}>
              Shopify Store Domain
            </label>
            <input
              type="text"
              placeholder="develops-test-store.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoComplete="on"
              style={{
                width: "100%",
                padding: "13px 16px",
                borderRadius: "10px",
                border: `1.5px solid ${errors?.shop ? "#ef4444" : focused ? "#7c3aed" : "#cbd5e1"}`,
                fontSize: "14.5px",
                fontFamily: "inherit",
                color: "#0f172a",
                background: "#f8fafc",
                outline: "none",
                boxShadow: focused ? "0 0 0 4px rgba(124, 58, 237, 0.12)" : "none",
                transition: "all 0.2s ease",
                boxSizing: "border-box",
              }}
            />
            {errors?.shop && (
              <div style={{ fontSize: "13px", color: "#ef4444", marginTop: "6px", fontWeight: "600" }}>
                {errors.shop}
              </div>
            )}
          </div>

          <button
            type="submit"
            style={{
              padding: "13px 24px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)",
              color: "#ffffff",
              fontSize: "14.5px",
              fontWeight: "700",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(124, 58, 237, 0.35)",
              transition: "all 0.2s ease",
            }}
          >
            Log in to Store &rarr;
          </button>
        </Form>

        <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #f1f5f9" }}>
          <a
            href="/"
            style={{ fontSize: "13px", color: "#7c3aed", textDecoration: "none", fontWeight: "600" }}
          >
            &larr; Back to App Overview
          </a>
        </div>
      </div>
    </div>
  );
}
