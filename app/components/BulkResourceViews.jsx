/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useMemo } from "react";
import {
  TITLE_MAX,
  DESC_MAX,
  isTitleOk,
  isDescOk,
  generateCollectionSeoCopy,
  generatePageSeoCopy,
  generateArticleSeoCopy,
} from "../lib/seoCopy";

// ============================================================================
// 1. BULK COLLECTIONS VIEW
// ============================================================================
export function BulkCollectionsView({
  collections: initialCollections,
  storeName,
  onNotify,
}) {
  const [collections, setCollections] = useState(initialCollections);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // "all" | "missing-title" | "missing-desc" | "optimized"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [presetVariant, setPresetVariant] = useState(0); // 0 | 1 | 2
  const [drafts, setDrafts] = useState({}); // { [id]: { seoTitle, seoDescription } }
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });

  const getTitle = (c) => (drafts[c.id]?.seoTitle !== undefined ? drafts[c.id].seoTitle : c.seoTitle || "");
  const getDesc = (c) => (drafts[c.id]?.seoDescription !== undefined ? drafts[c.id].seoDescription : c.seoDescription || "");
  const isDirty = (c) => drafts[c.id] !== undefined;

  // Filter & search
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return collections.filter((c) => {
      const match = !q || c.title.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q);
      if (!match) return false;

      const t = getTitle(c);
      const d = getDesc(c);
      const hasT = Boolean(t.trim());
      const hasD = Boolean(d.trim());

      if (filterMode === "missing-title") return !hasT;
      if (filterMode === "missing-desc") return !hasD;
      if (filterMode === "optimized") return hasT && hasD && isTitleOk(t) && isDescOk(d);
      return true;
    });
  }, [collections, searchQuery, filterMode, drafts]);

  // Statistics
  const stats = useMemo(() => {
    let missingTitle = 0;
    let missingDesc = 0;
    let optimized = 0;
    collections.forEach((c) => {
      const t = getTitle(c);
      const d = getDesc(c);
      if (!t.trim()) missingTitle++;
      if (!d.trim()) missingDesc++;
      if (t.trim() && d.trim() && isTitleOk(t) && isDescOk(d)) optimized++;
    });
    return {
      total: collections.length,
      missingTitle,
      missingDesc,
      optimized,
    };
  }, [collections, drafts]);

  // Bulk Generate
  const handleGenerate = (targetCollections) => {
    if (targetCollections.length === 0) return;
    setIsGenerating(true);

    const newDrafts = { ...drafts };
    targetCollections.forEach((c) => {
      const generated = generateCollectionSeoCopy({
        title: c.title,
        description: c.description,
        storeName,
        variant: presetVariant,
      });
      newDrafts[c.id] = {
        seoTitle: generated.title,
        seoDescription: generated.description,
      };
    });

    setDrafts(newDrafts);
    setIsGenerating(false);
    onNotify?.(`✨ Generated SEO for ${targetCollections.length} collections! Click "Save to Shopify" to apply.`);
  };

  // Bulk Save
  const handleSave = async (itemsToSave) => {
    if (itemsToSave.length === 0) {
      onNotify?.("No changes to save.");
      return;
    }

    setIsSaving(true);
    setSaveProgress({ current: 0, total: itemsToSave.length });

    const CHUNK = 10;
    let savedCount = 0;

    for (let i = 0; i < itemsToSave.length; i += CHUNK) {
      const chunk = itemsToSave.slice(i, i + CHUNK);
      try {
        const res = await fetch("/api/save-seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceType: "collection",
            items: chunk.map((c) => ({
              id: c.id,
              seoTitle: getTitle(c),
              seoDescription: getDesc(c),
            })),
          }),
        });
        const d = await res.json();
        if (d.success) {
          savedCount += d.updatedCount || chunk.length;
          // Update collection state
          setCollections((prev) =>
            prev.map((c) => {
              const matched = chunk.find((item) => item.id === c.id);
              if (matched) {
                return {
                  ...c,
                  seoTitle: getTitle(c),
                  seoDescription: getDesc(c),
                  hasCustomSeoTitle: true,
                };
              }
              return c;
            })
          );
        }
      } catch (err) {
        console.error("Save collections error:", err);
      }
      setSaveProgress({ current: Math.min(i + CHUNK, itemsToSave.length), total: itemsToSave.length });
    }

    setIsSaving(false);
    onNotify?.(`🎉 Successfully saved ${savedCount} collections to Shopify!`);
  };

  const dirtyCollections = collections.filter(isDirty);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Control Hero */}
      <div
        style={{
          background: "linear-gradient(135deg, #065f46 0%, #047857 100%)",
          borderRadius: "14px",
          padding: "22px 24px",
          color: "#ffffff",
          boxShadow: "0 4px 16px rgba(6, 95, 70, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", color: "#a7f3d0" }}>
              COLLECTION SEO WORKBENCH
            </div>
            <h3 style={{ fontSize: "20px", fontWeight: "800", margin: "4px 0" }}>
              Bulk Collection Meta Tags ({stats.total} Collections)
            </h3>
            <div style={{ fontSize: "13px", opacity: 0.9 }}>
              Auto-generate search-clamped titles & descriptions for high-ranking category landing pages.
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={isGenerating || selectedIds.size === 0}
              onClick={() => handleGenerate(collections.filter((c) => selectedIds.has(c.id)))}
              style={{
                background: selectedIds.size > 0 ? "#ffffff" : "rgba(255,255,255,0.2)",
                color: selectedIds.size > 0 ? "#065f46" : "rgba(255,255,255,0.6)",
                border: "none",
                borderRadius: "8px",
                padding: "9px 16px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
              }}
            >
              ⚡ Generate for Selected ({selectedIds.size})
            </button>

            <button
              type="button"
              disabled={isGenerating}
              onClick={() => handleGenerate(collections.filter((c) => !getTitle(c).trim() || !getDesc(c).trim()))}
              style={{
                background: "#10b981",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "9px 16px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
            >
              ⚡ 1-Click: Generate All Missing ({stats.missingTitle + stats.missingDesc})
            </button>

            {dirtyCollections.length > 0 && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave(dirtyCollections)}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "9px 18px",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: isSaving ? "wait" : "pointer",
                  boxShadow: "0 2px 10px rgba(2,132,199,0.35)",
                }}
              >
                {isSaving
                  ? `💾 Saving (${saveProgress.current}/${saveProgress.total})...`
                  : `💾 Save ${dirtyCollections.length} to Shopify`}
              </button>
            )}
          </div>
        </div>

        {/* Tone Preset Switcher */}
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#d1fae5" }}>Copy Preset:</span>
          {[
            { id: 0, label: "⚡ Converting & Deals", sample: "[Collection] Collection | Store" },
            { id: 1, label: "🛍️ Selection & Online", sample: "Shop [Collection] Online | Store" },
            { id: 2, label: "✨ Curated & Quality", sample: "Best [Collection] Deals | Store" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetVariant(p.id)}
              style={{
                background: presetVariant === p.id ? "#ffffff" : "rgba(255,255,255,0.15)",
                color: presetVariant === p.id ? "#065f46" : "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "5px 12px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ flex: "1 1 280px", maxWidth: "420px" }}>
          <input
            type="text"
            placeholder="🔍 Search collections by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              background: "#ffffff",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: `All (${stats.total})` },
            { id: "missing-title", label: `⚠️ Missing Title (${stats.missingTitle})`, warn: stats.missingTitle > 0 },
            { id: "missing-desc", label: `⚠️ Missing Description (${stats.missingDesc})`, warn: stats.missingDesc > 0 },
            { id: "optimized", label: `✅ Optimized (${stats.optimized})` },
          ].map((f) => {
            const isSel = filterMode === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                style={{
                  background: isSel ? "#0f172a" : "#ffffff",
                  color: isSel ? "#ffffff" : f.warn ? "#ea580c" : "#475569",
                  border: `1.5px solid ${isSel ? "#0f172a" : f.warn ? "#fdba74" : "#cbd5e1"}`,
                  borderRadius: "7px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Select All Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "600", color: "#334155", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedIds(new Set([...selectedIds, ...filtered.map((c) => c.id)]));
              } else {
                const fSet = new Set(filtered.map((c) => c.id));
                setSelectedIds(new Set([...selectedIds].filter((id) => !fSet.has(id))));
              }
            }}
          />
          Select All Filtered ({filtered.length})
        </label>

        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            style={{ background: "none", border: "none", color: "#64748b", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}
          >
            Clear Selection ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
              <th style={{ width: "40px", padding: "12px 14px" }}></th>
              <th style={{ width: "240px", padding: "12px 14px" }}>Collection</th>
              <th style={{ width: "320px", padding: "12px 14px" }}>SEO Title (Max {TITLE_MAX})</th>
              <th style={{ padding: "12px 14px" }}>SEO Description (Max {DESC_MAX})</th>
              <th style={{ width: "100px", padding: "12px 14px", textAlign: "right" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  No collections match your current search/filter.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const isSelected = selectedIds.has(c.id);
                const titleVal = getTitle(c);
                const descVal = getDesc(c);
                const dirty = isDirty(c);
                const titleLen = titleVal.length;
                const descLen = descVal.length;

                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: isSelected ? "#f0fdf4" : dirty ? "#fefce8" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 14px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: "700", color: "#0f172a" }}>{c.title}</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>/{c.handle}</div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          value={titleVal}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [c.id]: {
                                seoTitle: e.target.value,
                                seoDescription: getDesc(c),
                              },
                            }))
                          }
                          placeholder={`Enter SEO title (max ${TITLE_MAX})...`}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: "12px",
                            borderRadius: "6px",
                            border: `1px solid ${titleLen > TITLE_MAX ? "#ef4444" : "#cbd5e1"}`,
                            boxSizing: "border-box",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            marginTop: "3px",
                            color: titleLen === 0 ? "#94a3b8" : titleLen <= TITLE_MAX ? "#16a34a" : "#ef4444",
                          }}
                        >
                          {titleLen} / {TITLE_MAX} characters
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ position: "relative" }}>
                        <textarea
                          rows={2}
                          value={descVal}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [c.id]: {
                                seoTitle: getTitle(c),
                                seoDescription: e.target.value,
                              },
                            }))
                          }
                          placeholder={`Enter SEO description (max ${DESC_MAX})...`}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: "12px",
                            borderRadius: "6px",
                            border: `1px solid ${descLen > DESC_MAX ? "#ef4444" : "#cbd5e1"}`,
                            boxSizing: "border-box",
                            resize: "vertical",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            marginTop: "3px",
                            color: descLen === 0 ? "#94a3b8" : descLen <= DESC_MAX ? "#16a34a" : "#ef4444",
                          }}
                        >
                          {descLen} / {DESC_MAX} characters
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      {dirty ? (
                        <span style={{ background: "#fef08a", color: "#854d0e", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Unsaved
                        </span>
                      ) : titleLen > 0 && descLen > 0 && isTitleOk(titleVal) && isDescOk(descVal) ? (
                        <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Optimized
                        </span>
                      ) : (
                        <span style={{ background: "#fee2e2", color: "#991b1b", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Missing
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// 2. BULK PAGES VIEW (Online Store -> Pages)
// ============================================================================
export function BulkPagesView({
  pages: initialPages,
  storeName,
  contentScopeError,
  onNotify,
}) {
  const [pages, setPages] = useState(initialPages);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [presetVariant, setPresetVariant] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });

  const getTitle = (p) => (drafts[p.id]?.seoTitle !== undefined ? drafts[p.id].seoTitle : p.seoTitle || "");
  const getDesc = (p) => (drafts[p.id]?.seoDescription !== undefined ? drafts[p.id].seoDescription : p.seoDescription || "");
  const isDirty = (p) => drafts[p.id] !== undefined;

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return pages.filter((p) => {
      const match = !q || p.title.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q);
      if (!match) return false;

      const t = getTitle(p);
      const d = getDesc(p);
      const hasT = Boolean(t.trim());
      const hasD = Boolean(d.trim());

      if (filterMode === "missing-title") return !hasT;
      if (filterMode === "missing-desc") return !hasD;
      if (filterMode === "optimized") return hasT && hasD && isTitleOk(t) && isDescOk(d);
      return true;
    });
  }, [pages, searchQuery, filterMode, drafts]);

  const stats = useMemo(() => {
    let missingTitle = 0;
    let missingDesc = 0;
    let optimized = 0;
    pages.forEach((p) => {
      const t = getTitle(p);
      const d = getDesc(p);
      if (!t.trim()) missingTitle++;
      if (!d.trim()) missingDesc++;
      if (t.trim() && d.trim() && isTitleOk(t) && isDescOk(d)) optimized++;
    });
    return {
      total: pages.length,
      missingTitle,
      missingDesc,
      optimized,
    };
  }, [pages, drafts]);

  const handleGenerate = (targetPages) => {
    if (targetPages.length === 0) return;
    setIsGenerating(true);

    const newDrafts = { ...drafts };
    targetPages.forEach((p) => {
      const generated = generatePageSeoCopy({
        title: p.title,
        body: p.bodySummary,
        storeName,
        variant: presetVariant,
      });
      newDrafts[p.id] = {
        seoTitle: generated.title,
        seoDescription: generated.description,
      };
    });

    setDrafts(newDrafts);
    setIsGenerating(false);
    onNotify?.(`✨ Generated SEO for ${targetPages.length} pages! Click "Save to Shopify" to apply.`);
  };

  const handleSave = async (itemsToSave) => {
    if (itemsToSave.length === 0) return;
    setIsSaving(true);
    setSaveProgress({ current: 0, total: itemsToSave.length });

    const CHUNK = 10;
    let savedCount = 0;

    for (let i = 0; i < itemsToSave.length; i += CHUNK) {
      const chunk = itemsToSave.slice(i, i + CHUNK);
      try {
        const res = await fetch("/api/save-seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceType: "page",
            items: chunk.map((p) => ({
              id: p.id,
              seoTitle: getTitle(p),
              seoDescription: getDesc(p),
            })),
          }),
        });
        const d = await res.json();
        if (d.success) {
          savedCount += d.updatedCount || chunk.length;
          setPages((prev) =>
            prev.map((p) => {
              const matched = chunk.find((item) => item.id === p.id);
              if (matched) {
                return {
                  ...p,
                  seoTitle: getTitle(p),
                  seoDescription: getDesc(p),
                  hasCustomSeoTitle: true,
                };
              }
              return p;
            })
          );
        }
      } catch (err) {
        console.error("Save pages error:", err);
      }
      setSaveProgress({ current: Math.min(i + CHUNK, itemsToSave.length), total: itemsToSave.length });
    }

    setIsSaving(false);
    onNotify?.(`🎉 Successfully saved ${savedCount} pages to Shopify!`);
  };

  const dirtyPages = pages.filter(isDirty);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Scope Warning Banner if write_content is pending */}
      {contentScopeError && (
        <div
          style={{
            background: "#fffbeb",
            border: "1.5px solid #fde68a",
            borderRadius: "10px",
            padding: "14px 18px",
            color: "#92400e",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "20px" }}>⚠️</span>
          <div>
            <strong>Shopify Content Permission Pending:</strong> To access and save Online Store Pages, please reload the app in your Shopify Admin to accept the newly added <code>write_content</code> permission.
          </div>
        </div>
      )}

      {/* Control Hero */}
      <div
        style={{
          background: "linear-gradient(135deg, #4338ca 0%, #3730a3 100%)",
          borderRadius: "14px",
          padding: "22px 24px",
          color: "#ffffff",
          boxShadow: "0 4px 16px rgba(67, 56, 202, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", color: "#c7d2fe" }}>
              ONLINE STORE PAGES SEO
            </div>
            <h3 style={{ fontSize: "20px", fontWeight: "800", margin: "4px 0" }}>
              Bulk Store Pages ({stats.total} Pages)
            </h3>
            <div style={{ fontSize: "13px", opacity: 0.9 }}>
              Optimize About Us, Contact, FAQ, and policy pages for brand authority and trust on Google.
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={isGenerating || selectedIds.size === 0}
              onClick={() => handleGenerate(pages.filter((p) => selectedIds.has(p.id)))}
              style={{
                background: selectedIds.size > 0 ? "#ffffff" : "rgba(255,255,255,0.2)",
                color: selectedIds.size > 0 ? "#4338ca" : "rgba(255,255,255,0.6)",
                border: "none",
                borderRadius: "8px",
                padding: "9px 16px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
              }}
            >
              ⚡ Generate for Selected ({selectedIds.size})
            </button>

            <button
              type="button"
              disabled={isGenerating}
              onClick={() => handleGenerate(pages.filter((p) => !getTitle(p).trim() || !getDesc(p).trim()))}
              style={{
                background: "#6366f1",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "9px 16px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              ⚡ 1-Click: Generate All Missing ({stats.missingTitle + stats.missingDesc})
            </button>

            {dirtyPages.length > 0 && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave(dirtyPages)}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "9px 18px",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: isSaving ? "wait" : "pointer",
                }}
              >
                {isSaving
                  ? `💾 Saving (${saveProgress.current}/${saveProgress.total})...`
                  : `💾 Save ${dirtyPages.length} to Shopify`}
              </button>
            )}
          </div>
        </div>

        {/* Tone Preset Switcher */}
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#e0e7ff" }}>Preset Style:</span>
          {[
            { id: 0, label: "📄 Standard | Store", sample: "[Page] | Store" },
            { id: 1, label: "🛡️ Official Store", sample: "[Page] - Official Store" },
            { id: 2, label: "🏢 Brand First", sample: "Store | [Page]" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetVariant(p.id)}
              style={{
                background: presetVariant === p.id ? "#ffffff" : "rgba(255,255,255,0.15)",
                color: presetVariant === p.id ? "#4338ca" : "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "5px 12px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ flex: "1 1 280px", maxWidth: "420px" }}>
          <input
            type="text"
            placeholder="🔍 Search pages by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              background: "#ffffff",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: `All (${stats.total})` },
            { id: "missing-title", label: `⚠️ Missing Title (${stats.missingTitle})`, warn: stats.missingTitle > 0 },
            { id: "missing-desc", label: `⚠️ Missing Description (${stats.missingDesc})`, warn: stats.missingDesc > 0 },
            { id: "optimized", label: `✅ Optimized (${stats.optimized})` },
          ].map((f) => {
            const isSel = filterMode === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                style={{
                  background: isSel ? "#0f172a" : "#ffffff",
                  color: isSel ? "#ffffff" : f.warn ? "#ea580c" : "#475569",
                  border: `1.5px solid ${isSel ? "#0f172a" : f.warn ? "#fdba74" : "#cbd5e1"}`,
                  borderRadius: "7px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
              <th style={{ width: "40px", padding: "12px 14px" }}></th>
              <th style={{ width: "240px", padding: "12px 14px" }}>Page</th>
              <th style={{ width: "320px", padding: "12px 14px" }}>SEO Title (Max {TITLE_MAX})</th>
              <th style={{ padding: "12px 14px" }}>SEO Description (Max {DESC_MAX})</th>
              <th style={{ width: "100px", padding: "12px 14px", textAlign: "right" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  No store pages match your current search/filter.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const isSelected = selectedIds.has(p.id);
                const titleVal = getTitle(p);
                const descVal = getDesc(p);
                const dirty = isDirty(p);
                const titleLen = titleVal.length;
                const descLen = descVal.length;

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: isSelected ? "#f5f3ff" : dirty ? "#fefce8" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 14px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: "700", color: "#0f172a" }}>{p.title}</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>/pages/{p.handle}</div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <input
                        type="text"
                        value={titleVal}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              seoTitle: e.target.value,
                              seoDescription: getDesc(p),
                            },
                          }))
                        }
                        placeholder={`Enter SEO title (max ${TITLE_MAX})...`}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          fontSize: "12px",
                          borderRadius: "6px",
                          border: `1px solid ${titleLen > TITLE_MAX ? "#ef4444" : "#cbd5e1"}`,
                          boxSizing: "border-box",
                        }}
                      />
                      <div
                        style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          marginTop: "3px",
                          color: titleLen === 0 ? "#94a3b8" : titleLen <= TITLE_MAX ? "#16a34a" : "#ef4444",
                        }}
                      >
                        {titleLen} / {TITLE_MAX} characters
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <textarea
                        rows={2}
                        value={descVal}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              seoTitle: getTitle(p),
                              seoDescription: e.target.value,
                            },
                          }))
                        }
                        placeholder={`Enter SEO description (max ${DESC_MAX})...`}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          fontSize: "12px",
                          borderRadius: "6px",
                          border: `1px solid ${descLen > DESC_MAX ? "#ef4444" : "#cbd5e1"}`,
                          boxSizing: "border-box",
                          resize: "vertical",
                        }}
                      />
                      <div
                        style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          marginTop: "3px",
                          color: descLen === 0 ? "#94a3b8" : descLen <= DESC_MAX ? "#16a34a" : "#ef4444",
                        }}
                      >
                        {descLen} / {DESC_MAX} characters
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      {dirty ? (
                        <span style={{ background: "#fef08a", color: "#854d0e", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Unsaved
                        </span>
                      ) : titleLen > 0 && descLen > 0 && isTitleOk(titleVal) && isDescOk(descVal) ? (
                        <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Optimized
                        </span>
                      ) : (
                        <span style={{ background: "#fee2e2", color: "#991b1b", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Missing
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// 3. BULK ARTICLES VIEW (Online Store -> Blog posts)
// ============================================================================
export function BulkArticlesView({
  articles: initialArticles,
  storeName,
  contentScopeError,
  onNotify,
}) {
  const [articles, setArticles] = useState(initialArticles);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [presetVariant, setPresetVariant] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });

  const getTitle = (a) => (drafts[a.id]?.seoTitle !== undefined ? drafts[a.id].seoTitle : a.seoTitle || "");
  const getDesc = (a) => (drafts[a.id]?.seoDescription !== undefined ? drafts[a.id].seoDescription : a.seoDescription || "");
  const isDirty = (a) => drafts[a.id] !== undefined;

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return articles.filter((a) => {
      const match = !q || a.title.toLowerCase().includes(q) || a.handle.toLowerCase().includes(q) || a.blogTitle.toLowerCase().includes(q);
      if (!match) return false;

      const t = getTitle(a);
      const d = getDesc(a);
      const hasT = Boolean(t.trim());
      const hasD = Boolean(d.trim());

      if (filterMode === "missing-title") return !hasT;
      if (filterMode === "missing-desc") return !hasD;
      if (filterMode === "optimized") return hasT && hasD && isTitleOk(t) && isDescOk(d);
      return true;
    });
  }, [articles, searchQuery, filterMode, drafts]);

  const stats = useMemo(() => {
    let missingTitle = 0;
    let missingDesc = 0;
    let optimized = 0;
    articles.forEach((a) => {
      const t = getTitle(a);
      const d = getDesc(a);
      if (!t.trim()) missingTitle++;
      if (!d.trim()) missingDesc++;
      if (t.trim() && d.trim() && isTitleOk(t) && isDescOk(d)) optimized++;
    });
    return {
      total: articles.length,
      missingTitle,
      missingDesc,
      optimized,
    };
  }, [articles, drafts]);

  const handleGenerate = (targetArticles) => {
    if (targetArticles.length === 0) return;
    setIsGenerating(true);

    const newDrafts = { ...drafts };
    targetArticles.forEach((a) => {
      const generated = generateArticleSeoCopy({
        title: a.title,
        body: a.summary,
        blogTitle: a.blogTitle,
        storeName,
        variant: presetVariant,
      });
      newDrafts[a.id] = {
        seoTitle: generated.title,
        seoDescription: generated.description,
      };
    });

    setDrafts(newDrafts);
    setIsGenerating(false);
    onNotify?.(`✨ Generated SEO for ${targetArticles.length} blog posts! Click "Save to Shopify" to apply.`);
  };

  const handleSave = async (itemsToSave) => {
    if (itemsToSave.length === 0) return;
    setIsSaving(true);
    setSaveProgress({ current: 0, total: itemsToSave.length });

    const CHUNK = 10;
    let savedCount = 0;

    for (let i = 0; i < itemsToSave.length; i += CHUNK) {
      const chunk = itemsToSave.slice(i, i + CHUNK);
      try {
        const res = await fetch("/api/save-seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceType: "article",
            items: chunk.map((a) => ({
              id: a.id,
              seoTitle: getTitle(a),
              seoDescription: getDesc(a),
            })),
          }),
        });
        const d = await res.json();
        if (d.success) {
          savedCount += d.updatedCount || chunk.length;
          setArticles((prev) =>
            prev.map((a) => {
              const matched = chunk.find((item) => item.id === a.id);
              if (matched) {
                return {
                  ...a,
                  seoTitle: getTitle(a),
                  seoDescription: getDesc(a),
                  hasCustomSeoTitle: true,
                };
              }
              return a;
            })
          );
        }
      } catch (err) {
        console.error("Save articles error:", err);
      }
      setSaveProgress({ current: Math.min(i + CHUNK, itemsToSave.length), total: itemsToSave.length });
    }

    setIsSaving(false);
    onNotify?.(`🎉 Successfully saved ${savedCount} blog articles to Shopify!`);
  };

  const dirtyArticles = articles.filter(isDirty);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Scope Warning Banner if write_content is pending */}
      {contentScopeError && (
        <div
          style={{
            background: "#fffbeb",
            border: "1.5px solid #fde68a",
            borderRadius: "10px",
            padding: "14px 18px",
            color: "#92400e",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "20px" }}>⚠️</span>
          <div>
            <strong>Shopify Content Permission Pending:</strong> To access and save Blog Articles, please reload the app in your Shopify Admin to accept the newly added <code>write_content</code> permission.
          </div>
        </div>
      )}

      {/* Control Hero */}
      <div
        style={{
          background: "linear-gradient(135deg, #0e7490 0%, #155e75 100%)",
          borderRadius: "14px",
          padding: "22px 24px",
          color: "#ffffff",
          boxShadow: "0 4px 16px rgba(14, 116, 144, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", color: "#a5f3fc" }}>
              BLOG ARTICLES & EDITORIAL SEO
            </div>
            <h3 style={{ fontSize: "20px", fontWeight: "800", margin: "4px 0" }}>
              Bulk Blog Articles ({stats.total} Posts)
            </h3>
            <div style={{ fontSize: "13px", opacity: 0.9 }}>
              Maximize organic Google traffic for recipes, buying guides, and educational articles.
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={isGenerating || selectedIds.size === 0}
              onClick={() => handleGenerate(articles.filter((a) => selectedIds.has(a.id)))}
              style={{
                background: selectedIds.size > 0 ? "#ffffff" : "rgba(255,255,255,0.2)",
                color: selectedIds.size > 0 ? "#0e7490" : "rgba(255,255,255,0.6)",
                border: "none",
                borderRadius: "8px",
                padding: "9px 16px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
              }}
            >
              ⚡ Generate for Selected ({selectedIds.size})
            </button>

            <button
              type="button"
              disabled={isGenerating}
              onClick={() => handleGenerate(articles.filter((a) => !getTitle(a).trim() || !getDesc(a).trim()))}
              style={{
                background: "#06b6d4",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "9px 16px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              ⚡ 1-Click: Generate All Missing ({stats.missingTitle + stats.missingDesc})
            </button>

            {dirtyArticles.length > 0 && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave(dirtyArticles)}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "9px 18px",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: isSaving ? "wait" : "pointer",
                }}
              >
                {isSaving
                  ? `💾 Saving (${saveProgress.current}/${saveProgress.total})...`
                  : `💾 Save ${dirtyArticles.length} to Shopify`}
              </button>
            )}
          </div>
        </div>

        {/* Tone Preset Switcher */}
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#cffafe" }}>Article Style:</span>
          {[
            { id: 0, label: "📝 Standard | Store", sample: "[Title] | Store" },
            { id: 1, label: "📰 Blog Included", sample: "[Title] - Blog | Store" },
            { id: 2, label: "💡 Expert Guide", sample: "[Title] | Expert Guide" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetVariant(p.id)}
              style={{
                background: presetVariant === p.id ? "#ffffff" : "rgba(255,255,255,0.15)",
                color: presetVariant === p.id ? "#0e7490" : "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "5px 12px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ flex: "1 1 280px", maxWidth: "420px" }}>
          <input
            type="text"
            placeholder="🔍 Search blog articles by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              background: "#ffffff",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: `All (${stats.total})` },
            { id: "missing-title", label: `⚠️ Missing Title (${stats.missingTitle})`, warn: stats.missingTitle > 0 },
            { id: "missing-desc", label: `⚠️ Missing Description (${stats.missingDesc})`, warn: stats.missingDesc > 0 },
            { id: "optimized", label: `✅ Optimized (${stats.optimized})` },
          ].map((f) => {
            const isSel = filterMode === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                style={{
                  background: isSel ? "#0f172a" : "#ffffff",
                  color: isSel ? "#ffffff" : f.warn ? "#ea580c" : "#475569",
                  border: `1.5px solid ${isSel ? "#0f172a" : f.warn ? "#fdba74" : "#cbd5e1"}`,
                  borderRadius: "7px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
              <th style={{ width: "40px", padding: "12px 14px" }}></th>
              <th style={{ width: "240px", padding: "12px 14px" }}>Article</th>
              <th style={{ width: "320px", padding: "12px 14px" }}>SEO Title (Max {TITLE_MAX})</th>
              <th style={{ padding: "12px 14px" }}>SEO Description (Max {DESC_MAX})</th>
              <th style={{ width: "100px", padding: "12px 14px", textAlign: "right" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  No blog articles match your current search/filter.
                </td>
              </tr>
            ) : (
              filtered.map((a) => {
                const isSelected = selectedIds.has(a.id);
                const titleVal = getTitle(a);
                const descVal = getDesc(a);
                const dirty = isDirty(a);
                const titleLen = titleVal.length;
                const descLen = descVal.length;

                return (
                  <tr
                    key={a.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: isSelected ? "#ecfeff" : dirty ? "#fefce8" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 14px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: "700", color: "#0f172a" }}>{a.title}</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>
                        Blog: <strong>{a.blogTitle}</strong>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <input
                        type="text"
                        value={titleVal}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [a.id]: {
                              seoTitle: e.target.value,
                              seoDescription: getDesc(a),
                            },
                          }))
                        }
                        placeholder={`Enter SEO title (max ${TITLE_MAX})...`}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          fontSize: "12px",
                          borderRadius: "6px",
                          border: `1px solid ${titleLen > TITLE_MAX ? "#ef4444" : "#cbd5e1"}`,
                          boxSizing: "border-box",
                        }}
                      />
                      <div
                        style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          marginTop: "3px",
                          color: titleLen === 0 ? "#94a3b8" : titleLen <= TITLE_MAX ? "#16a34a" : "#ef4444",
                        }}
                      >
                        {titleLen} / {TITLE_MAX} characters
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <textarea
                        rows={2}
                        value={descVal}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [a.id]: {
                              seoTitle: getTitle(a),
                              seoDescription: e.target.value,
                            },
                          }))
                        }
                        placeholder={`Enter SEO description (max ${DESC_MAX})...`}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          fontSize: "12px",
                          borderRadius: "6px",
                          border: `1px solid ${descLen > DESC_MAX ? "#ef4444" : "#cbd5e1"}`,
                          boxSizing: "border-box",
                          resize: "vertical",
                        }}
                      />
                      <div
                        style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          marginTop: "3px",
                          color: descLen === 0 ? "#94a3b8" : descLen <= DESC_MAX ? "#16a34a" : "#ef4444",
                        }}
                      >
                        {descLen} / {DESC_MAX} characters
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      {dirty ? (
                        <span style={{ background: "#fef08a", color: "#854d0e", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Unsaved
                        </span>
                      ) : titleLen > 0 && descLen > 0 && isTitleOk(titleVal) && isDescOk(descVal) ? (
                        <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Optimized
                        </span>
                      ) : (
                        <span style={{ background: "#fee2e2", color: "#991b1b", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                          Missing
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
