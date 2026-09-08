import { useState, useMemo } from "react";
import { Link } from "react-router";

// Sample initial products for the interactive demo sandbox
const INITIAL_DEMO_PRODUCTS = [
  {
    id: "gid://shopify/Product/1001",
    title: "AeroGlide Pro Running Shoes",
    handle: "aeroglide-pro-running-shoes",
    description: "Engineered with ultralight carbon fiber plates and responsive foam cushioning for marathon runners seeking peak race day performance.",
    status: "ACTIVE",
    seoTitle: "Running Shoes", // Intentionally short / unoptimized
    seoDescription: "", // Missing
  },
  {
    id: "gid://shopify/Product/1002",
    title: "Nordic Minimalist Oak Desk",
    handle: "nordic-minimalist-oak-desk",
    description: "Handcrafted from sustainably sourced solid white oak with integrated cable management and sleek chamfered edge profiling.",
    status: "ACTIVE",
    seoTitle: "", // Missing
    seoDescription: "", // Missing
  },
  {
    id: "gid://shopify/Product/1003",
    title: "TitanSound ANC Wireless Headphones",
    handle: "titansound-anc-wireless-headphones",
    description: "Hybrid active noise cancelling over-ear headphones with 45-hour battery life, high-res audio certification, and plush memory foam earcups.",
    status: "ACTIVE",
    seoTitle: "TitanSound ANC Wireless Headphones - Official Store", // Good length
    seoDescription: "Shop TitanSound ANC wireless headphones.", // Too short
  },
  {
    id: "gid://shopify/Product/1004",
    title: "Artisan Ceramic Matcha Bowl Set",
    handle: "artisan-ceramic-matcha-bowl-set",
    description: "Traditional Japanese style stoneware chawan crafted by master artisans, complete with bamboo whisk (chasen) and scoop (chashaku).",
    status: "ACTIVE",
    seoTitle: "", // Missing
    seoDescription: "Authentic handmade ceramic matcha bowl set with whisk.", // Too short
  },
  {
    id: "gid://shopify/Product/1005",
    title: "Organic Egyptian Cotton Duvet Cover",
    handle: "organic-egyptian-cotton-duvet-cover",
    description: "GOTS-certified 800 thread count long-staple organic cotton with breathable sateen weave and hidden coconut button closures.",
    status: "ACTIVE",
    seoTitle: "Organic Egyptian Cotton Duvet Cover | Luxury Bedding", // Optimal (53 chars)
    seoDescription: "Experience 5-star hotel luxury with our GOTS-certified 800 thread count Egyptian organic cotton duvet cover. Enjoy free shipping and 100-night sleep guarantee!", // Optimal (160 chars)
  },
];

// Strict clamp functions for SEO criteria
const clampTitle = (raw) => {
  let text = raw.trim();
  if (text.length > 60) text = text.slice(0, 60).trim();
  const suffixes = [" | Official Store", " | Free Shipping", " - Buy Now", " - Best Deal", " - Shop Now", " Online"];
  for (const s of suffixes) {
    if (text.length < 50 && (text + s).length <= 60) text = text + s;
  }
  while (text.length < 50 && text.length + 11 <= 60) text += " - Shop Now";
  if (text.length > 60) text = text.slice(0, 60).trim();
  return text;
};

const clampDesc = (raw) => {
  let text = raw.trim();
  if (text.length > 160) text = text.slice(0, 160).trim();
  const pads = [
    " Order online today for fast express delivery and 100% satisfaction.",
    " Explore great deals, verified reviews, and fast shipping.",
    " Premium quality with hassle-free returns and great support.",
    " Limited stock available - buy online now for the best price!",
    " Shop with confidence and enjoy quick delivery.",
  ];
  for (const p of pads) {
    if (text.length < 150 && (text + p).length <= 160) text = text + p;
  }
  while (text.length < 150) {
    const pad = " Shop now!";
    if ((text + pad).length <= 160) text += pad;
    else break;
  }
  if (text.length > 160) text = text.slice(0, 160).trim();
  return text;
};

export default function DemoPage() {
  const [products, setProducts] = useState(INITIAL_DEMO_PRODUCTS);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "optimizer" | "bulk"
  const [selectedProduct, setSelectedProduct] = useState(products[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Optimizer Form State
  const [keywords, setKeywords] = useState("running shoes, carbon fiber, marathon");
  const [tone, setTone] = useState("High-Converting");
  const [seoTitle, setSeoTitle] = useState(products[0]?.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(products[0]?.seoDescription || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiVariations, setAiVariations] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);
  const [devicePreview, setDevicePreview] = useState("desktop"); // "desktop" | "mobile"

  // Bulk Optimizer State for Demo
  const [selectedBulkIds, setSelectedBulkIds] = useState(new Set(INITIAL_DEMO_PRODUCTS.map((p) => p.id)));
  const [bulkTone, setBulkTone] = useState("High-Converting");
  const [bulkKeywords, setBulkKeywords] = useState("premium, fast shipping, bestseller");
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [bulkProposals, setBulkProposals] = useState({});

  // Filter products for dropdown
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    return products.filter((p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  // Calculate live catalog stats
  const stats = useMemo(() => {
    const total = products.length;
    const withTitle = products.filter((p) => p.seoTitle && p.seoTitle.trim().length > 0).length;
    const withDesc = products.filter((p) => p.seoDescription && p.seoDescription.trim().length > 0).length;
    const optimalTitle = products.filter((p) => (p.seoTitle?.length || 0) >= 50 && (p.seoTitle?.length || 0) <= 60).length;
    const optimalDesc = products.filter((p) => (p.seoDescription?.length || 0) >= 150 && (p.seoDescription?.length || 0) <= 160).length;
    const score = total > 0 ? Math.round(((withTitle + withDesc) / (total * 2)) * 100) : 0;
    return {
      total,
      withTitle,
      withDesc,
      optimalTitle,
      optimalDesc,
      missingTitle: total - withTitle,
      missingDesc: total - withDesc,
      score,
    };
  }, [products]);

  const selectProduct = (prod) => {
    setSelectedProduct(prod);
    setSearchQuery(prod.title);
    setSeoTitle(prod.seoTitle || "");
    setSeoDescription(prod.seoDescription || "");
    setAiVariations([]);
    setIsDropdownOpen(false);
  };

  // Generate AI Variations for Single Optimizer
  const handleGenerateAi = () => {
    if (!selectedProduct) return;
    setIsGenerating(true);
    setTimeout(() => {
      const p = selectedProduct;
      const kw = keywords.trim() ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : [];
      const kwPrimary = kw[0] || "Best Quality";
      const kwSecondary = kw[1] || "Top Rated";

      let vars = [];
      if (tone === "Luxury") {
        vars = [
          {
            title: clampTitle(`The Luxury ${p.title} - ${kwPrimary} Collection`),
            desc: clampDesc(`Indulge in artisanal luxury with our ${p.title}. Crafted for discerning connoisseurs seeking refined ${kwPrimary} and uncompromising elegance.`),
          },
          {
            title: clampTitle(`Exclusive ${p.title} | Premium ${kwSecondary}`),
            desc: clampDesc(`Discover the bespoke craftsmanship of the ${p.title}. Designed with prestige materials, timeless aesthetics, and superior performance.`),
          },
        ];
      } else if (tone === "Urgent / Sales") {
        vars = [
          {
            title: clampTitle(`Flash Sale: ${p.title} - Get 30% Off Today`),
            desc: clampDesc(`Huge limited-time sale on the ${p.title}! Save big with free express delivery and instant checkout. Order before our stock sells out today.`),
          },
          {
            title: clampTitle(`Buy ${p.title} Online - Best Price Guaranteed`),
            desc: clampDesc(`Exclusive discount deal on ${p.title} (${kwPrimary}). Don't miss out on special markdown pricing, top customer reviews, and fast shipping!`),
          },
        ];
      } else {
        // High-Converting Default
        vars = [
          {
            title: clampTitle(`Shop ${p.title} | ${kwPrimary} - Official Store`),
            desc: clampDesc(`Elevate your daily routine with the ${p.title}. Engineered for top-tier ${kwPrimary} and built to last with guaranteed fast shipping.`),
          },
          {
            title: clampTitle(`${p.title} Online - Top Rated ${kwSecondary}`),
            desc: clampDesc(`Discover top-rated ${p.title}. Premium grade craftsmanship meets versatile daily performance. Browse customer reviews and order with confidence!`),
          },
          {
            title: clampTitle(`Best ${p.title} - Free Shipping & Returns`),
            desc: clampDesc(`Upgrade to ${p.title} today. Experience verified customer satisfaction, hassle-free returns, and fast checkout on all online orders.`),
          },
        ];
      }
      setAiVariations(vars);
      setIsGenerating(false);
      setToastMessage("✨ AI SEO variations generated successfully!");
      setTimeout(() => setToastMessage(null), 3000);
    }, 600);
  };

  // Save changes to current demo product in Single Optimizer
  const handleSaveDemo = () => {
    if (!selectedProduct) return;
    const updated = products.map((p) => {
      if (p.id === selectedProduct.id) {
        return {
          ...p,
          seoTitle,
          seoDescription,
        };
      }
      return p;
    });
    setProducts(updated);
    setSelectedProduct({
      ...selectedProduct,
      seoTitle,
      seoDescription,
    });
    setToastMessage("💾 Saved to Demo Catalog! SEO Health Score updated.");
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Bulk Generator Handlers
  const handleToggleBulk = (id) => {
    const next = new Set(selectedBulkIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBulkIds(next);
  };

  const handleSelectAllBulk = () => {
    if (selectedBulkIds.size === products.length) {
      setSelectedBulkIds(new Set());
    } else {
      setSelectedBulkIds(new Set(products.map((p) => p.id)));
    }
  };

  const handleStartBulkGeneration = async () => {
    const targets = products.filter((p) => selectedBulkIds.has(p.id));
    if (targets.length === 0) return;

    setIsBulkGenerating(true);
    setBulkProgress({ current: 0, total: targets.length, percentage: 0 });

    const newProposals = { ...bulkProposals };

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      await new Promise((r) => setTimeout(r, 180)); // Visual progress tick

      let t = "";
      let d = "";

      if (bulkTone === "Luxury") {
        t = clampTitle(`The Luxury ${p.title} - Exclusive Edition`);
        d = clampDesc(`Indulge in artisanal luxury with our ${p.title}. Crafted for discerning shoppers seeking bespoke elegance, verified quality, and timeless style.`);
      } else if (bulkTone === "Urgent / Sales") {
        t = clampTitle(`Flash Sale: ${p.title} - 30% Off Today`);
        d = clampDesc(`Limited time flash sale on the ${p.title}! Enjoy free express delivery, premium customer support, and instant savings before stock runs out today.`);
      } else {
        t = clampTitle(`Buy ${p.title} Online | Official Store`);
        d = clampDesc(`Upgrade your collection with our authentic ${p.title}. Built with premium materials, verified customer reviews, and fast free shipping on all orders.`);
      }

      newProposals[p.id] = { seoTitle: t, seoDescription: d };

      const curr = i + 1;
      setBulkProgress({
        current: curr,
        total: targets.length,
        percentage: Math.round((curr / targets.length) * 100),
      });
    }

    setBulkProposals(newProposals);
    setIsBulkGenerating(false);
    setToastMessage(`⚡ Batch AI generation complete for ${targets.length} products!`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleEditBulkProposal = (productId, field, value) => {
    setBulkProposals((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const handleApplyAllBulkToDemo = () => {
    const updated = products.map((p) => {
      const prop = bulkProposals[p.id];
      if (selectedBulkIds.has(p.id) && prop) {
        return {
          ...p,
          seoTitle: prop.seoTitle,
          seoDescription: prop.seoDescription,
        };
      }
      return p;
    });

    setProducts(updated);
    setToastMessage("🎉 All batch proposals applied! Store SEO Health Score increased to 100%!");
    setActiveTab("overview"); // Auto-switch to health overview so visitor sees the 100% score!
    setTimeout(() => setToastMessage(null), 5000);
  };

  const titleLength = seoTitle.length;
  const descLength = seoDescription.length;
  const isTitleOptimal = titleLength >= 50 && titleLength <= 60;
  const isDescOptimal = descLength >= 150 && descLength <= 160;

  const scoreColor = stats.score >= 80 ? "#10b981" : stats.score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f6f6f7",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, sans-serif",
        color: "#202223",
      }}
    >
      {/* Top Demo Notification Banner */}
      <div
        style={{
          background: "linear-gradient(90deg, #1e293b 0%, #0f172a 100%)",
          color: "#ffffff",
          padding: "10px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "13px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>🌟</span>
          <span style={{ fontWeight: "700", color: "#34d399" }}>LIVE DEMO SANDBOX</span>
          <span style={{ opacity: 0.8 }}>&bull; You are testing real-time AI SEO features with simulated store data.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            to="/"
            style={{ color: "#94a3b8", textDecoration: "none", fontWeight: "500" }}
          >
            ← Back to Home
          </Link>
          <a
            href="/#install-section"
            style={{
              background: "#10b981",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: "700",
              padding: "4px 12px",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          >
            Install on Real Store ↗
          </a>
        </div>
      </div>

      {/* App Header & Navigation */}
      <div
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e1e3e5",
          padding: "16px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "8px",
              background: "#008060",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: "18px",
              fontWeight: "700",
            }}
          >
            ⚡
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#202223" }}>
              AI SEO Dashboard <span style={{ fontSize: "12px", fontWeight: "500", color: "#6d7175" }}>(Demo Store)</span>
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175" }}>
              Store: demo-boutique.myshopify.com
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: "flex", gap: "8px", background: "#f1f2f4", padding: "4px", borderRadius: "8px" }}>
          <button
            onClick={() => setActiveTab("overview")}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              background: activeTab === "overview" ? "#ffffff" : "transparent",
              color: activeTab === "overview" ? "#202223" : "#6d7175",
              boxShadow: activeTab === "overview" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            📊 Store SEO Health
          </button>
          <button
            onClick={() => setActiveTab("optimizer")}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              background: activeTab === "optimizer" ? "#ffffff" : "transparent",
              color: activeTab === "optimizer" ? "#202223" : "#6d7175",
              boxShadow: activeTab === "optimizer" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            ⚡ Single Optimizer
          </button>
          <button
            onClick={() => setActiveTab("bulk")}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              fontSize: "13px",
              fontWeight: "700",
              cursor: "pointer",
              background: activeTab === "bulk" ? "#1e293b" : "transparent",
              color: activeTab === "bulk" ? "#ffffff" : "#6d7175",
              boxShadow: activeTab === "bulk" ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>🚀 1-Click Bulk Tool</span>
            <span style={{ fontSize: "10px", background: "#10b981", color: "#ffffff", padding: "1px 5px", borderRadius: "8px" }}>NEW</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div style={{ maxWidth: "1160px", margin: "24px auto", padding: "0 20px" }}>
        {/* Toast Alert */}
        {toastMessage && (
          <div
            style={{
              background: "#008060",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              marginBottom: "16px",
              boxShadow: "0 4px 12px rgba(0, 128, 96, 0.25)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              style={{ background: "none", border: "none", color: "#ffffff", cursor: "pointer", fontSize: "16px" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: OVERVIEW DASHBOARD */}
        {activeTab === "overview" && (
          <div>
            {/* Header Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #008060 0%, #004c3f 100%)",
                borderRadius: "14px",
                padding: "32px",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "20px",
                marginBottom: "24px",
                boxShadow: "0 4px 20px rgba(0, 76, 63, 0.2)",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", opacity: 0.8, marginBottom: "4px", fontWeight: "600", letterSpacing: "0.5px" }}>
                  SIMULATED STORE OVERVIEW
                </div>
                <div style={{ fontSize: "28px", fontWeight: "800", marginBottom: "6px" }}>
                  Demo Boutique Official
                </div>
                <div style={{ fontSize: "14px", opacity: 0.9, marginBottom: "6px" }}>
                  🌐 demo-boutique.myshopify.com &bull; 🏷️ Shopify Advanced Plan
                </div>
                <div style={{ fontSize: "13px", opacity: 0.75 }}>
                  📦 {stats.total} Products in catalog &bull; Real-time SEO sync active
                </div>
              </div>

              {/* Health Score Circle */}
              <div
                style={{
                  background: "rgba(255,255,255,0.12)",
                  borderRadius: "14px",
                  padding: "20px 32px",
                  textAlign: "center",
                  backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px", fontWeight: "700" }}>
                  STORE SEO HEALTH
                </div>
                <div style={{ fontSize: "52px", fontWeight: "900", lineHeight: 1 }}>
                  {stats.score}
                </div>
                <div style={{ fontSize: "13px", opacity: 0.85 }}>/ 100</div>
                <div style={{ fontSize: "12px", marginTop: "6px", fontWeight: "600" }}>
                  {stats.score >= 80 ? "🟢 Excellent" : stats.score >= 50 ? "🟡 Needs Work" : "🔴 Critical"}
                </div>
              </div>
            </div>

            {/* 4 Stats Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e1e3e5", textAlign: "center" }}>
                <div style={{ fontSize: "28px" }}>📦</div>
                <div style={{ fontSize: "28px", fontWeight: "800", color: "#202223" }}>{stats.total}</div>
                <div style={{ fontSize: "13px", color: "#6d7175" }}>Total Products</div>
              </div>

              <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e1e3e5", textAlign: "center" }}>
                <div style={{ fontSize: "28px" }}>🏷️</div>
                <div style={{ fontSize: "28px", fontWeight: "800", color: "#202223" }}>{stats.withTitle} / {stats.total}</div>
                <div style={{ fontSize: "13px", color: "#6d7175" }}>With SEO Titles</div>
              </div>

              <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e1e3e5", textAlign: "center" }}>
                <div style={{ fontSize: "28px" }}>📝</div>
                <div style={{ fontSize: "28px", fontWeight: "800", color: "#202223" }}>{stats.withDesc} / {stats.total}</div>
                <div style={{ fontSize: "13px", color: "#6d7175" }}>With Meta Descriptions</div>
              </div>

              <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e1e3e5", textAlign: "center" }}>
                <div style={{ fontSize: "28px" }}>🎯</div>
                <div style={{ fontSize: "28px", fontWeight: "800", color: scoreColor }}>{stats.optimalTitle + stats.optimalDesc}</div>
                <div style={{ fontSize: "13px", color: "#6d7175" }}>Strict SERP Clamped</div>
              </div>
            </div>

            {/* Quick Action to Bulk Tool */}
            <div
              style={{
                background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                borderRadius: "12px",
                padding: "20px 24px",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              <div>
                <div style={{ fontSize: "16px", fontWeight: "800", color: "#ffffff" }}>
                  🚀 Want to optimize all {stats.total} products in 10 seconds?
                </div>
                <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "2px" }}>
                  Run the 1-Click Bulk Optimizer to generate and apply all missing tags in batch.
                </div>
              </div>
              <button
                onClick={() => setActiveTab("bulk")}
                style={{
                  background: "#10b981",
                  color: "#ffffff",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  fontWeight: "700",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Open Bulk Optimizer →
              </button>
            </div>

            {/* Catalog Table */}
            <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e1e3e5", overflow: "hidden", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>Catalog Products & SEO Status</h3>
                <button
                  onClick={() => setActiveTab("optimizer")}
                  style={{
                    background: "#008060",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  ⚡ Open Single Optimizer
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e1e3e5", color: "#6d7175", textAlign: "left" }}>
                      <th style={{ padding: "10px" }}>Product</th>
                      <th style={{ padding: "10px" }}>SEO Title</th>
                      <th style={{ padding: "10px" }}>Meta Description</th>
                      <th style={{ padding: "10px" }}>Status</th>
                      <th style={{ padding: "10px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const hasTitle = Boolean(p.seoTitle?.trim());
                      const hasDesc = Boolean(p.seoDescription?.trim());
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid #f1f2f4" }}>
                          <td style={{ padding: "12px 10px", fontWeight: "600" }}>{p.title}</td>
                          <td style={{ padding: "12px 10px", color: hasTitle ? "#202223" : "#ef4444" }}>
                            {hasTitle ? `${p.seoTitle.slice(0, 30)}... (${p.seoTitle.length} chars)` : "❌ Missing"}
                          </td>
                          <td style={{ padding: "12px 10px", color: hasDesc ? "#202223" : "#ef4444" }}>
                            {hasDesc ? `${p.seoDescription.slice(0, 35)}... (${p.seoDescription.length} chars)` : "❌ Missing"}
                          </td>
                          <td style={{ padding: "12px 10px" }}>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "10px",
                                fontSize: "11px",
                                fontWeight: "600",
                                background: hasTitle && hasDesc ? "#e3f8e0" : "#fff4e5",
                                color: hasTitle && hasDesc ? "#108043" : "#b7791f",
                              }}
                            >
                              {hasTitle && hasDesc ? "Optimized" : "Needs Work"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>
                            <button
                              onClick={() => {
                                selectProduct(p);
                                setActiveTab("optimizer");
                              }}
                              style={{
                                background: "none",
                                border: "1px solid #c9cccf",
                                padding: "4px 10px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                            >
                              Optimize →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SINGLE AI SEO OPTIMIZER */}
        {activeTab === "optimizer" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
            {/* Left Column: Product Selection & AI Controls */}
            <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e1e3e5", padding: "24px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "800", margin: "0 0 16px 0" }}>
                ⚡ Product SEO Optimizer
              </h2>

              {/* Product Selector Dropdown */}
              <div style={{ marginBottom: "20px", position: "relative" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                  Select Product to Optimize:
                </label>
                <div
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  style={{
                    padding: "10px 14px",
                    border: "1px solid #c9cccf",
                    borderRadius: "8px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fdfdfd",
                  }}
                >
                  <span style={{ fontWeight: "600", fontSize: "14px" }}>{selectedProduct?.title || "Choose product..."}</span>
                  <span>▼</span>
                </div>

                {isDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#ffffff",
                      border: "1px solid #c9cccf",
                      borderRadius: "8px",
                      marginTop: "4px",
                      maxHeight: "220px",
                      overflowY: "auto",
                      zIndex: 50,
                      boxShadow: "0 6px 16px rgba(0,0,0,0.1)",
                    }}
                  >
                    {products.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => selectProduct(p)}
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          borderBottom: "1px solid #f1f2f4",
                          fontSize: "13px",
                          background: p.id === selectedProduct?.id ? "#f4f6f8" : "#ffffff",
                        }}
                      >
                        <div style={{ fontWeight: "600" }}>{p.title}</div>
                        <div style={{ fontSize: "11px", color: "#6d7175" }}>
                          {p.seoTitle ? `Title: ${p.seoTitle.slice(0, 25)}...` : "⚠️ Missing Title"} &bull;{" "}
                          {p.seoDescription ? "✓ Has Description" : "⚠️ Missing Description"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Target Keywords Input */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                  Target Search Keywords:
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g. running shoes, lightweight, free shipping"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #c9cccf",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Tone Selector */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                  AI Brand Voice & Tone:
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["High-Converting", "Luxury", "Urgent / Sales", "Friendly"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: tone === t ? "1px solid #008060" : "1px solid #c9cccf",
                        background: tone === t ? "#e3f8e0" : "#ffffff",
                        color: tone === t ? "#008060" : "#202223",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Generation Button */}
              <button
                onClick={handleGenerateAi}
                disabled={isGenerating}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #008060 0%, #004c3f 100%)",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: "700",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "0 2px 8px rgba(0, 128, 96, 0.3)",
                }}
              >
                {isGenerating ? "🤖 Generating Perfect Meta Tags..." : "✨ Generate AI SERP Variations"}
              </button>

              {/* AI Variations Preview */}
              {aiVariations.length > 0 && (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#008060", marginBottom: "10px" }}>
                    Select an AI Variation to Apply:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {aiVariations.map((v, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setSeoTitle(v.title);
                          setSeoDescription(v.desc);
                        }}
                        style={{
                          padding: "12px",
                          borderRadius: "8px",
                          border: "1px solid #c9cccf",
                          cursor: "pointer",
                          background: "#f9fafb",
                          transition: "border 0.2s",
                        }}
                      >
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#1a0dab", marginBottom: "4px" }}>
                          {v.title}
                        </div>
                        <div style={{ fontSize: "12px", color: "#4d5156", lineHeight: "1.4" }}>
                          {v.desc}
                        </div>
                        <div style={{ fontSize: "11px", color: "#108043", marginTop: "6px", fontWeight: "600" }}>
                          Title: {v.title.length}/60 chars &bull; Desc: {v.desc.length}/160 chars (Optimal)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Live Google SERP Preview & Manual Adjustments */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* SERP Preview Card */}
              <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e1e3e5", padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "18px" }}>🔍</span>
                    <span style={{ fontSize: "15px", fontWeight: "700" }}>Google SERP Snippet Preview</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", background: "#f1f2f4", padding: "2px", borderRadius: "6px" }}>
                    <button
                      onClick={() => setDevicePreview("desktop")}
                      style={{
                        padding: "4px 8px",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "600",
                        cursor: "pointer",
                        background: devicePreview === "desktop" ? "#ffffff" : "transparent",
                        boxShadow: devicePreview === "desktop" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      🖥️ Desktop
                    </button>
                    <button
                      onClick={() => setDevicePreview("mobile")}
                      style={{
                        padding: "4px 8px",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "600",
                        cursor: "pointer",
                        background: devicePreview === "mobile" ? "#ffffff" : "transparent",
                        boxShadow: devicePreview === "mobile" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      📱 Mobile
                    </button>
                  </div>
                </div>

                {/* Google Snippet Simulation */}
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #dadce0",
                    borderRadius: devicePreview === "mobile" ? "12px" : "8px",
                    padding: devicePreview === "mobile" ? "14px" : "16px",
                    maxWidth: devicePreview === "mobile" ? "360px" : "100%",
                    margin: "0 auto",
                    boxShadow: "0 1px 6px rgba(32,33,36,0.08)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "#008060",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        fontSize: "10px",
                      }}
                    >
                      🛍️
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "#202124", fontWeight: "500" }}>Demo Boutique</div>
                      <div style={{ fontSize: "11px", color: "#5f6368" }}>
                        https://demo-boutique.com › products › {selectedProduct?.handle || "product"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: devicePreview === "mobile" ? "17px" : "19px",
                      lineHeight: "1.3",
                      color: "#1a0dab",
                      fontWeight: "400",
                      marginBottom: "4px",
                      wordBreak: "break-word",
                    }}
                  >
                    {seoTitle.trim() || selectedProduct?.title || "Product Title"}
                  </div>

                  <div style={{ fontSize: "13px", lineHeight: "1.4", color: "#4d5156", wordBreak: "break-word" }}>
                    {seoDescription.trim() || "No meta description provided. Google will auto-generate a snippet from random page text."}
                  </div>
                </div>
              </div>

              {/* Edit Inputs Card */}
              <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e1e3e5", padding: "24px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: "700", margin: "0 0 16px 0" }}>
                  Fine-Tune Meta Tags
                </h3>

                {/* Title Input & Meter */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label style={{ fontSize: "13px", fontWeight: "600" }}>SEO Title</label>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "700",
                        color: isTitleOptimal ? "#108043" : titleLength > 60 ? "#d9381e" : "#b7791f",
                      }}
                    >
                      {titleLength}/60 chars {isTitleOptimal ? "✓ Optimal (50-60)" : titleLength > 60 ? "⚠️ Truncated" : "(Too Short)"}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${isTitleOptimal ? "#108043" : "#c9cccf"}`,
                      fontSize: "13px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Description Input & Meter */}
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label style={{ fontSize: "13px", fontWeight: "600" }}>Meta Description</label>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "700",
                        color: isDescOptimal ? "#108043" : descLength > 160 ? "#d9381e" : "#b7791f",
                      }}
                    >
                      {descLength}/160 chars {isDescOptimal ? "✓ Optimal (150-160)" : descLength > 160 ? "⚠️ Truncated" : "(Too Short)"}
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${isDescOptimal ? "#108043" : "#c9cccf"}`,
                      fontSize: "13px",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveDemo}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    background: "#008060",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: "700",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0, 128, 96, 0.2)",
                  }}
                >
                  💾 Save to Demo Store & Update Health Score
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 1-CLICK BULK OPTIMIZER */}
        {activeTab === "bulk" && (
          <div>
            {/* Bulk Controls Bar */}
            <div
              style={{
                background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                borderRadius: "14px",
                padding: "24px",
                color: "#ffffff",
                marginBottom: "24px",
                boxShadow: "0 4px 16px rgba(15, 23, 42, 0.3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "12px", opacity: 0.8, fontWeight: "600", letterSpacing: "0.5px", color: "#34d399" }}>
                    BATCH AI OPTIMIZER
                  </div>
                  <h2 style={{ fontSize: "22px", fontWeight: "800", margin: "4px 0 6px 0" }}>
                    1-Click Catalog Bulk Generator
                  </h2>
                  <div style={{ fontSize: "13px", opacity: 0.85 }}>
                    Optimize all products at once. AI strictly calculates optimal 50–60 char titles and 150–160 char descriptions.
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={handleStartBulkGeneration}
                    disabled={isBulkGenerating || selectedBulkIds.size === 0}
                    style={{
                      background: selectedBulkIds.size > 0 ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "#475569",
                      color: "#ffffff",
                      fontWeight: "700",
                      padding: "10px 18px",
                      borderRadius: "8px",
                      border: "none",
                      cursor: selectedBulkIds.size > 0 && !isBulkGenerating ? "pointer" : "not-allowed",
                      fontSize: "13px",
                      boxShadow: selectedBulkIds.size > 0 ? "0 2px 10px rgba(16,185,129,0.35)" : "none",
                    }}
                  >
                    {isBulkGenerating ? "🤖 Generating..." : `⚡ Start AI Generation (${selectedBulkIds.size} Selected)`}
                  </button>

                  {Object.keys(bulkProposals).length > 0 && (
                    <button
                      onClick={handleApplyAllBulkToDemo}
                      style={{
                        background: "#0284c7",
                        color: "#ffffff",
                        fontWeight: "700",
                        padding: "10px 18px",
                        borderRadius: "8px",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "13px",
                        boxShadow: "0 2px 10px rgba(2,132,199,0.35)",
                      }}
                    >
                      💾 Apply All Proposals to Demo Catalog
                    </button>
                  )}
                </div>
              </div>

              {/* Tone & Keywords */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", background: "rgba(255,255,255,0.05)", padding: "16px", borderRadius: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px", color: "#cbd5e1" }}>
                    Brand Voice & Tone:
                  </label>
                  <select
                    value={bulkTone}
                    onChange={(e) => setBulkTone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "#ffffff",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  >
                    <option value="High-Converting" style={{ background: "#1e293b", color: "#ffffff" }}>High-Converting & Clear</option>
                    <option value="Luxury" style={{ background: "#1e293b", color: "#ffffff" }}>Luxury & Artisanal</option>
                    <option value="Urgent / Sales" style={{ background: "#1e293b", color: "#ffffff" }}>Urgent / Discount Sales</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px", color: "#cbd5e1" }}>
                    Target Keywords:
                  </label>
                  <input
                    type="text"
                    value={bulkKeywords}
                    onChange={(e) => setBulkKeywords(e.target.value)}
                    placeholder="e.g. premium, fast shipping, bestseller"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "#ffffff",
                      fontSize: "13px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Progress Bar */}
              {isBulkGenerating && (
                <div style={{ marginTop: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "#34d399" }}>
                    <span>🤖 Processing catalog with AI SERP engine...</span>
                    <span>{bulkProgress.current} / {bulkProgress.total} ({bulkProgress.percentage}%)</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: "8px", height: "8px", overflow: "hidden" }}>
                    <div
                      style={{
                        background: "linear-gradient(90deg, #10b981, #34d399)",
                        height: "100%",
                        width: `${bulkProgress.percentage}%`,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Table */}
            <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e1e3e5", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #e1e3e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="bulk-select-all"
                    checked={selectedBulkIds.size === products.length}
                    onChange={handleSelectAllBulk}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="bulk-select-all" style={{ fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                    Select All ({products.length} products)
                  </label>
                </div>
                <span style={{ fontSize: "12px", color: "#6d7175" }}>
                  {selectedBulkIds.size} of {products.length} selected
                </span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e1e3e5", color: "#6d7175", textAlign: "left" }}>
                      <th style={{ padding: "10px 14px", width: "36px" }}></th>
                      <th style={{ padding: "10px 14px", width: "20%" }}>Product</th>
                      <th style={{ padding: "10px 14px", width: "35%" }}>SEO Title</th>
                      <th style={{ padding: "10px 14px", width: "35%" }}>Meta Description</th>
                      <th style={{ padding: "10px 14px", width: "10%", textAlign: "right" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const isSelected = selectedBulkIds.has(p.id);
                      const prop = bulkProposals[p.id];
                      const titleToDisplay = prop ? prop.seoTitle : p.seoTitle;
                      const descToDisplay = prop ? prop.seoDescription : p.seoDescription;

                      const titleLen = titleToDisplay.length;
                      const descLen = descToDisplay.length;
                      const isTitleGood = titleLen >= 50 && titleLen <= 60;
                      const isDescGood = descLen >= 150 && descLen <= 160;

                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: "1px solid #f1f2f4",
                            background: isSelected ? "#f0fdf4" : "#ffffff",
                          }}
                        >
                          <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleBulk(p.id)}
                              style={{ cursor: "pointer", width: "16px", height: "16px" }}
                            />
                          </td>

                          <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                            <div style={{ fontWeight: "700", color: "#202223" }}>{p.title}</div>
                            {prop && (
                              <span
                                style={{
                                  display: "inline-block",
                                  marginTop: "6px",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "#e0f2fe",
                                  color: "#0369a1",
                                  fontSize: "10px",
                                  fontWeight: "700",
                                }}
                              >
                                Proposal Ready
                              </span>
                            )}
                          </td>

                          <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                            {prop ? (
                              <div>
                                <input
                                  type="text"
                                  value={prop.seoTitle}
                                  onChange={(e) => handleEditBulkProposal(p.id, "seoTitle", e.target.value)}
                                  style={{
                                    width: "100%",
                                    padding: "6px 8px",
                                    borderRadius: "6px",
                                    border: `1px solid ${isTitleGood ? "#108043" : "#d9381e"}`,
                                    fontSize: "12px",
                                    boxSizing: "border-box",
                                  }}
                                />
                                <div style={{ fontSize: "11px", marginTop: "4px", color: isTitleGood ? "#108043" : "#b7791f", fontWeight: "600" }}>
                                  {titleLen}/60 chars {isTitleGood ? "✓ Optimal" : "(50-60 target)"}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ color: p.seoTitle ? "#202223" : "#d9381e", fontSize: "12px" }}>
                                  {p.seoTitle || "❌ Missing Title"}
                                </div>
                                {p.seoTitle && (
                                  <div style={{ fontSize: "11px", color: isTitleGood ? "#108043" : "#6d7175", marginTop: "2px" }}>
                                    {p.seoTitle.length} chars {isTitleGood ? "✓" : ""}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                            {prop ? (
                              <div>
                                <textarea
                                  rows={2}
                                  value={prop.seoDescription}
                                  onChange={(e) => handleEditBulkProposal(p.id, "seoDescription", e.target.value)}
                                  style={{
                                    width: "100%",
                                    padding: "6px 8px",
                                    borderRadius: "6px",
                                    border: `1px solid ${isDescGood ? "#108043" : "#d9381e"}`,
                                    fontSize: "12px",
                                    boxSizing: "border-box",
                                    fontFamily: "inherit",
                                  }}
                                />
                                <div style={{ fontSize: "11px", marginTop: "4px", color: isDescGood ? "#108043" : "#b7791f", fontWeight: "600" }}>
                                  {descLen}/160 chars {isDescGood ? "✓ Optimal" : "(150-160 target)"}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ color: p.seoDescription ? "#4a4a4a" : "#d9381e", fontSize: "12px", lineHeight: "1.4" }}>
                                  {p.seoDescription ? `${p.seoDescription.slice(0, 60)}...` : "❌ Missing Description"}
                                </div>
                                {p.seoDescription && (
                                  <div style={{ fontSize: "11px", color: isDescGood ? "#108043" : "#6d7175", marginTop: "2px" }}>
                                    {p.seoDescription.length} chars {isDescGood ? "✓" : ""}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          <td style={{ padding: "12px 14px", verticalAlign: "top", textAlign: "right" }}>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "10px",
                                fontSize: "11px",
                                fontWeight: "600",
                                background: prop ? "#e0f2fe" : isTitleGood && isDescGood ? "#e3f8e0" : "#fff4e5",
                                color: prop ? "#0369a1" : isTitleGood && isDescGood ? "#108043" : "#b7791f",
                              }}
                            >
                              {prop ? "Ready" : isTitleGood && isDescGood ? "Optimized" : "Needs Work"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
