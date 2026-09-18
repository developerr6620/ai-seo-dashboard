/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useMemo, useEffect } from "react";
import {
  TITLE_MAX,
  DESC_MAX,
  isTitleOk,
  isDescOk,
  generateSeoCopy,
  generateCollectionSeoCopy,
  generatePageSeoCopy,
  generateArticleSeoCopy,
  extractKeywords,
} from "../lib/seoCopy";

/**
 * Unified, spacious, distraction-free Bulk Resource Table component.
 * Powers Products, Collections, Pages, and Blog Articles with 100% identical design,
 * colors, generous spacing, dedicated keywords column, and table interactions.
 */
export function BulkResourceTable({
  resourceType,
  categoryLabel,
  title,
  description,
  items: initialItems,
  storeName,
  pagination,
  onPageChange,
  onNotify,
  generateFn,
}) {
  const [items, setItems] = useState(initialItems || []);
  useEffect(() => {
    setItems(initialItems || []);
  }, [initialItems]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [drafts, setDrafts] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });

  const getTitle = (item) => (drafts[item.id]?.seoTitle !== undefined ? drafts[item.id].seoTitle : item.seoTitle || "");
  const getDesc = (item) => (drafts[item.id]?.seoDescription !== undefined ? drafts[item.id].seoDescription : item.seoDescription || "");
  const getKeywords = (item) => {
    if (drafts[item.id]?.keywords !== undefined) {
      const kw = drafts[item.id].keywords;
      return Array.isArray(kw) ? kw.join(", ") : String(kw || "");
    }
    if (Array.isArray(item.keywords)) return item.keywords.join(", ");
    return item.keywords || "";
  };
  const isDirty = (item) => drafts[item.id] !== undefined;

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const match =
        !q ||
        item.title?.toLowerCase().includes(q) ||
        (item.handle && item.handle.toLowerCase().includes(q)) ||
        getKeywords(item).toLowerCase().includes(q);
      if (!match) return false;

      const t = getTitle(item);
      const d = getDesc(item);
      const hasT = Boolean(t.trim());
      const hasD = Boolean(d.trim());

      if (filterMode === "missing-title") return !hasT;
      if (filterMode === "missing-desc") return !hasD;
      if (filterMode === "optimized") return hasT && hasD && isTitleOk(t) && isDescOk(d);
      return true;
    });
  }, [items, searchQuery, filterMode, drafts]);

  const stats = useMemo(() => {
    let missingTitle = 0;
    let missingDesc = 0;
    let optimized = 0;
    items.forEach((item) => {
      const t = getTitle(item);
      const d = getDesc(item);
      if (!t.trim()) missingTitle++;
      if (!d.trim()) missingDesc++;
      if (t.trim() && d.trim() && isTitleOk(t) && isDescOk(d)) optimized++;
    });
    return {
      total: pagination?.totalCount || items.length,
      missingTitle,
      missingDesc,
      optimized,
    };
  }, [items, drafts, pagination]);

  const handleGenerate = (targetItems) => {
    if (targetItems.length === 0) return;
    setIsGenerating(true);

    const newDrafts = { ...drafts };
    targetItems.forEach((item) => {
      const generated = generateFn(item, storeName);
      newDrafts[item.id] = {
        seoTitle: generated.title,
        seoDescription: generated.description,
        keywords: generated.keywords || [],
      };
    });

    setDrafts(newDrafts);
    setIsGenerating(false);
    onNotify?.(`✨ Generated SEO & Keywords for ${targetItems.length} items! Review & click "Save to Shopify".`);
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
            resourceType,
            items: chunk.map((item) => {
              const kwRaw = getKeywords(item);
              const kwList = typeof kwRaw === "string"
                ? kwRaw.split(",").map((k) => k.trim()).filter(Boolean)
                : Array.isArray(kwRaw) ? kwRaw : [];
              return {
                id: item.id,
                productId: item.id,
                collectionId: item.id,
                pageId: item.id,
                articleId: item.id,
                seoTitle: getTitle(item),
                seoDescription: getDesc(item),
                keywords: kwList,
              };
            }),
          }),
        });
        const d = await res.json();
        if (d.success) {
          savedCount += d.updatedCount || chunk.length;
          setItems((prev) =>
            prev.map((item) => {
              const matched = chunk.find((c) => c.id === item.id);
              if (matched) {
                const kwRaw = getKeywords(item);
                const kwList = typeof kwRaw === "string"
                  ? kwRaw.split(",").map((k) => k.trim()).filter(Boolean)
                  : Array.isArray(kwRaw) ? kwRaw : [];
                return {
                  ...item,
                  seoTitle: getTitle(item),
                  seoDescription: getDesc(item),
                  keywords: kwList,
                  hasCustomSeoTitle: true,
                };
              }
              return item;
            })
          );
          setDrafts((prev) => {
            const next = { ...prev };
            chunk.forEach((c) => delete next[c.id]);
            return next;
          });
        }
      } catch (err) {
        console.error(`Save ${resourceType} error:`, err);
      }
      setSaveProgress({ current: Math.min(i + CHUNK, itemsToSave.length), total: itemsToSave.length });
    }

    setIsSaving(false);
    onNotify?.(`🎉 Successfully saved ${savedCount} items to Shopify!`);
  };

  const dirtyItems = items.filter(isDirty);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      {/* Unified Executive Hero Card with Generous Spacing */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          borderRadius: "14px",
          padding: "26px 30px",
          color: "#ffffff",
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.25)",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
          <div style={{ flex: "1 1 500px", maxWidth: "720px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.8px",
                color: "#38bdf8",
                textTransform: "uppercase",
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                padding: "4px 10px",
                borderRadius: "20px",
                marginBottom: "12px",
              }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#38bdf8", display: "inline-block" }}></span>
              {categoryLabel} SEO
            </div>

            <h2
              style={{
                fontSize: "23px",
                fontWeight: "800",
                margin: "0 0 10px 0",
                color: "#ffffff",
                letterSpacing: "-0.2px",
                lineHeight: "1.3",
              }}
            >
              {title} ({stats.total} items)
            </h2>

            <p
              style={{
                fontSize: "14px",
                lineHeight: "1.6",
                color: "#94a3b8",
                margin: 0,
              }}
            >
              {description}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={isGenerating || selectedIds.size === 0}
              onClick={() => handleGenerate(items.filter((item) => selectedIds.has(item.id)))}
              style={{
                background: selectedIds.size > 0 ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.05)",
                color: selectedIds.size > 0 ? "#ffffff" : "rgba(255, 255, 255, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "8px",
                padding: "10px 16px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              ⚡ Generate for Selected ({selectedIds.size})
            </button>

            <button
              type="button"
              disabled={isGenerating}
              onClick={() => handleGenerate(items.filter((item) => !getTitle(item).trim() || !getDesc(item).trim()))}
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 18px",
                fontSize: "12px",
                fontWeight: "800",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(16, 185, 129, 0.35)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              ✨ 1-Click: Generate All Missing ({stats.missingTitle + stats.missingDesc})
            </button>

            {dirtyItems.length > 0 && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave(dirtyItems)}
                style={{
                  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: isSaving ? "wait" : "pointer",
                  boxShadow: "0 2px 10px rgba(37, 99, 235, 0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                {isSaving
                  ? `💾 Saving (${saveProgress.current}/${saveProgress.total})...`
                  : `💾 Save ${dirtyItems.length} to Shopify`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Unified Filter & Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", width: "100%" }}>
        <div style={{ flex: "1 1 300px", maxWidth: "460px" }}>
          <input
            type="text"
            placeholder={`🔍 Search ${categoryLabel.toLowerCase()} by title or keyword...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
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
                  padding: "7px 13px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified Select All Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "600", color: "#334155", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filtered.length > 0 && filtered.every((item) => selectedIds.has(item.id))}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedIds(new Set([...selectedIds, ...filtered.map((item) => item.id)]));
              } else {
                const fSet = new Set(filtered.map((item) => item.id));
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
            Clear selection ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Unified Table - Wide Max Width, 6 Columns */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          overflowX: "auto",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
              <th style={{ width: "36px", padding: "10px 8px", textAlign: "center" }}></th>
              <th style={{ width: "18%", minWidth: "140px", padding: "10px 12px" }}>{categoryLabel.slice(0, -1) || "Item"}</th>
              <th style={{ width: "18%", minWidth: "140px", padding: "10px 12px" }}>SEO Title (Max {TITLE_MAX})</th>
              <th style={{ width: "20%", minWidth: "150px", padding: "10px 12px" }}>Target Keywords</th>
              <th style={{ width: "36%", minWidth: "220px", padding: "10px 12px" }}>SEO Description (Max {DESC_MAX})</th>
              <th style={{ width: "80px", minWidth: "75px", padding: "10px 8px", textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  No items match your current search/filter.
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const titleVal = getTitle(item);
                const descVal = getDesc(item);
                const keywordsVal = getKeywords(item);
                const dirty = isDirty(item);
                const titleLen = titleVal.length;
                const descLen = descVal.length;
                const kwArray = keywordsVal.split(",").map((k) => k.trim()).filter(Boolean);

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: isSelected ? "#f0fdf4" : dirty ? "#fefce8" : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px 8px", verticalAlign: "top", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>

                    {/* Column 2: Item Name & Handle */}
                    <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                      <div style={{ fontWeight: "700", color: "#0f172a", lineHeight: "1.4" }}>{item.title}</div>
                      {item.handle && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>/{item.handle}</div>}
                      {item.blogTitle && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>Blog: {item.blogTitle}</div>}
                    </td>

                    {/* Column 3: SEO Title (made smaller) */}
                    <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          value={titleVal}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                seoTitle: e.target.value,
                                seoDescription: getDesc(item),
                                keywords: getKeywords(item),
                              },
                            }))
                          }
                          placeholder={`SEO title (max ${TITLE_MAX})...`}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: "12px",
                            borderRadius: "6px",
                            border: `1px solid ${titleLen > TITLE_MAX ? "#ef4444" : "#cbd5e1"}`,
                            boxSizing: "border-box",
                            background: "#ffffff",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            marginTop: "4px",
                            color: titleLen === 0 ? "#94a3b8" : titleLen <= TITLE_MAX ? "#16a34a" : "#ef4444",
                          }}
                        >
                          {titleLen} / {TITLE_MAX} characters
                        </div>
                      </div>
                    </td>

                    {/* Column 4: Target Keywords (Dedicated editable column for all resources) */}
                    <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          value={keywordsVal}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                seoTitle: getTitle(item),
                                seoDescription: getDesc(item),
                                keywords: e.target.value,
                              },
                            }))
                          }
                          placeholder="e.g. handmade, organic, deals..."
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: "12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            boxSizing: "border-box",
                            background: "#ffffff",
                          }}
                        />
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                          {kwArray.length > 0 ? (
                            kwArray.slice(0, 3).map((kw, i) => (
                              <span
                                key={i}
                                style={{
                                  fontSize: "10px",
                                  background: "#f0f9ff",
                                  color: "#0369a1",
                                  border: "1px solid #bae6fd",
                                  padding: "1px 5px",
                                  borderRadius: "4px",
                                  fontWeight: "600",
                                }}
                              >
                                #{kw}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: "10px", color: "#94a3b8" }}>Comma-separated keywords</span>
                          )}
                          {kwArray.length > 3 && (
                            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "600" }}>
                              +{kwArray.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Column 5: SEO Description (made larger) */}
                    <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                      <div style={{ position: "relative" }}>
                        <textarea
                          rows={3}
                          value={descVal}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                seoTitle: getTitle(item),
                                seoDescription: e.target.value,
                                keywords: getKeywords(item),
                              },
                            }))
                          }
                          placeholder={`Enter SEO description (max ${DESC_MAX})...`}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: "12px",
                            lineHeight: "1.4",
                            borderRadius: "6px",
                            border: `1px solid ${descLen > DESC_MAX ? "#ef4444" : "#cbd5e1"}`,
                            boxSizing: "border-box",
                            resize: "vertical",
                            background: "#ffffff",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            marginTop: "4px",
                            color: descLen === 0 ? "#94a3b8" : descLen <= DESC_MAX ? "#16a34a" : "#ef4444",
                          }}
                        >
                          {descLen} / {DESC_MAX} characters
                        </div>
                      </div>
                    </td>

                    {/* Column 6: Status */}
                    <td style={{ padding: "10px 8px", verticalAlign: "top", textAlign: "center" }}>
                      {dirty ? (
                        <span
                          style={{
                            display: "inline-block",
                            background: "#fef3c7",
                            color: "#92400e",
                            border: "1px solid #fde68a",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "700",
                            whiteSpace: "nowrap",
                          }}
                        >
                          💾 Unsaved
                        </span>
                      ) : titleLen > 0 && descLen > 0 && titleLen <= TITLE_MAX && descLen <= DESC_MAX ? (
                        <span
                          style={{
                            display: "inline-block",
                            background: "#dcfce7",
                            color: "#166534",
                            border: "1px solid #bbf7d0",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "700",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ✅ Optimized
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            background: "#fee2e2",
                            color: "#991b1b",
                            border: "1px solid #fecaca",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "700",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ⚠️ Missing
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

      {/* Optional Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" }}>
          <div style={{ fontSize: "13px", color: "#64748b" }}>
            Showing page <strong>{pagination.currentPage}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.totalCount} total)
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => onPageChange && onPageChange(pagination.currentPage - 1, pagination.startCursor, "prev")}
              disabled={!pagination.hasPreviousPage}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: pagination.hasPreviousPage ? "#ffffff" : "#f1f5f9",
                color: pagination.hasPreviousPage ? "#0f172a" : "#94a3b8",
                fontSize: "13px",
                fontWeight: "600",
                cursor: pagination.hasPreviousPage ? "pointer" : "not-allowed",
              }}
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => onPageChange && onPageChange(pagination.currentPage + 1, pagination.endCursor, "next")}
              disabled={!pagination.hasNextPage}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: pagination.hasNextPage ? "#ffffff" : "#f1f5f9",
                color: pagination.hasNextPage ? "#0f172a" : "#94a3b8",
                fontSize: "13px",
                fontWeight: "600",
                cursor: pagination.hasNextPage ? "pointer" : "not-allowed",
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 1. PRODUCTS VIEW
// ============================================================================
export function BulkProductsView({
  products,
  pagination,
  onPageChange,
  storeName,
  onNotify,
}) {
  return (
    <BulkResourceTable
      resourceType="product"
      categoryLabel="Catalog Products"
      title="Bulk Products SEO"
      description="Auto-generate high-converting SEO titles & meta descriptions for your catalog products."
      items={products}
      storeName={storeName}
      pagination={pagination}
      onPageChange={onPageChange}
      onNotify={onNotify}
      generateFn={(p) => {
        const kw = p.keywords && p.keywords.length > 0
          ? p.keywords
          : extractKeywords({ productTitle: p.title, productDescription: p.description });
        const copy = generateSeoCopy({
          productTitle: p.title,
          productDescription: p.description,
          keywords: kw,
        });
        return {
          title: copy.title,
          description: copy.description,
          keywords: copy.keywords || kw || [],
        };
      }}
    />
  );
}

// ============================================================================
// 2. COLLECTIONS VIEW
// ============================================================================
export function BulkCollectionsView({
  collections,
  storeName,
  onNotify,
}) {
  return (
    <BulkResourceTable
      resourceType="collection"
      categoryLabel="Category Collections"
      title="Bulk Collections SEO"
      description="Auto-generate search-clamped titles & descriptions for high-ranking category landing pages."
      items={collections}
      storeName={storeName}
      onNotify={onNotify}
      generateFn={(c, sName) => {
        const kw = c.keywords && c.keywords.length > 0
          ? c.keywords
          : extractKeywords({ productTitle: c.title, productDescription: c.description || c.title });
        const copy = generateCollectionSeoCopy({
          title: c.title,
          description: c.description,
          storeName: sName,
        });
        return {
          title: copy.title,
          description: copy.description,
          keywords: kw,
        };
      }}
    />
  );
}

// ============================================================================
// 3. STORE PAGES VIEW
// ============================================================================
export function BulkPagesView({
  pages,
  storeName,
  onNotify,
}) {
  return (
    <BulkResourceTable
      resourceType="page"
      categoryLabel="Online Store Pages"
      title="Bulk Store Pages SEO"
      description="Optimize About Us, Contact, FAQ, and policy pages for brand authority and trust on Google."
      items={pages}
      storeName={storeName}
      onNotify={onNotify}
      generateFn={(p, sName) => {
        const kw = p.keywords && p.keywords.length > 0
          ? p.keywords
          : extractKeywords({ productTitle: p.title, productDescription: p.bodySummary || p.title });
        const copy = generatePageSeoCopy({
          title: p.title,
          body: p.bodySummary,
          storeName: sName,
        });
        return {
          title: copy.title,
          description: copy.description,
          keywords: kw,
        };
      }}
    />
  );
}

// ============================================================================
// 4. BLOG ARTICLES VIEW
// ============================================================================
export function BulkArticlesView({
  articles,
  storeName,
  onNotify,
}) {
  return (
    <BulkResourceTable
      resourceType="article"
      categoryLabel="Blog Articles & Posts"
      title="Bulk Blog Articles SEO"
      description="Maximize organic Google traffic for editorial articles, buying guides, and blog stories."
      items={articles}
      storeName={storeName}
      onNotify={onNotify}
      generateFn={(a, sName) => {
        const kw = a.keywords && a.keywords.length > 0
          ? a.keywords
          : extractKeywords({ productTitle: a.title, productDescription: a.summary || a.title });
        const copy = generateArticleSeoCopy({
          title: a.title,
          summary: a.summary,
          blogTitle: a.blogTitle,
          storeName: sName,
        });
        return {
          title: copy.title,
          description: copy.description,
          keywords: kw,
        };
      }}
    />
  );
}
