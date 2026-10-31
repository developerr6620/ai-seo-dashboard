/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useState, useMemo, useEffect } from "react";
import {
  IconZap,
  IconSparkles,
  IconSave,
  IconCheckCircle,
  IconAlertTriangle,
  IconRefresh,
  IconSearch,
  IconBox,
  IconFolder,
  IconFileText,
  IconArticle,
} from "./Icons";
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
 * Unified, clean, modern Bulk Resource Table component.
 * Matches the reference design with compact spacing, light hero card,
 * search with magnifying icon, filter pills, image thumbnails, clean editable fields,
 * clear status badges, and compact pagination (< 1 2 3 4 5 >).
 * Powers Products, Collections, Pages, and Blog Articles with 100% identical styling.
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
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Reset to page 1 on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterMode]);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safeCurrentPage, pageSize]);

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
    onNotify?.(`Generated SEO & Keywords for ${targetItems.length} items! Review & click "Save to Shopify".`);
  };

  const handleGenerateSingle = (item) => {
    setIsGenerating(true);
    const generated = generateFn(item, storeName);
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        seoTitle: generated.title,
        seoDescription: generated.description,
        keywords: generated.keywords || [],
      },
    }));
    setIsGenerating(false);
    onNotify?.(`Generated AI SEO for "${item.title}". Click "Save to Shopify" to publish.`);
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
    onNotify?.(`Successfully saved ${savedCount} items to Shopify!`);
  };

  const dirtyItems = items.filter(isDirty);

  // Pagination page numbers helper
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, safeCurrentPage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* 1. HERO CARD (Matching Reference Design: Light background, Icon box, action buttons & graphic) */}
      <div
        style={{
          background: "linear-gradient(135deg, #f0f7ff 0%, #ffffff 50%, #f8fafc 100%)",
          borderRadius: "14px",
          padding: "20px 24px",
          border: "1px solid #dbeafe",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "18px" }}>
          {/* Left Info Column */}
          <div style={{ flex: "1 1 420px", maxWidth: "680px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "10px",
                fontWeight: "800",
                letterSpacing: "0.6px",
                color: "#2563eb",
                textTransform: "uppercase",
                background: "#eff6ff",
                border: "1px solid #dbeafe",
                padding: "3px 10px",
                borderRadius: "20px",
                marginBottom: "10px",
              }}
            >
              {categoryLabel.toUpperCase()} SEO
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  background: "#eff6ff",
                  border: "1px solid #dbeafe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {resourceType === "collection" ? (
                  <IconFolder size={22} color="#f59e0b" />
                ) : resourceType === "page" ? (
                  <IconFileText size={22} color="#8b5cf6" />
                ) : resourceType === "article" ? (
                  <IconArticle size={22} color="#10b981" />
                ) : (
                  <IconBox size={22} color="#2563eb" />
                )}
              </div>
              <h2
                style={{
                  fontSize: "20px",
                  fontWeight: "800",
                  margin: 0,
                  color: "#0f172a",
                  letterSpacing: "-0.2px",
                }}
              >
                {title} ({stats.total} items)
              </h2>
            </div>

            <p style={{ fontSize: "13px", color: "#64748b", margin: 0, lineHeight: "1.4" }}>
              {description}
            </p>
          </div>

          {/* Right Action Buttons & Mini Graphic Illustration */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={isGenerating || selectedIds.size === 0}
                onClick={() => handleGenerate(items.filter((item) => selectedIds.has(item.id)))}
                style={{
                  background: "#ffffff",
                  color: selectedIds.size > 0 ? "#0f172a" : "#94a3b8",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "9px 16px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  transition: "all 0.15s ease",
                }}
              >
                <IconZap size={14} color={selectedIds.size > 0 ? "#2563eb" : "#94a3b8"} />
                <span>Generate for Selected ({selectedIds.size})</span>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => handleGenerate(items.filter((item) => !getTitle(item).trim() || !getDesc(item).trim()))}
                style={{
                  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "9px 18px",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <IconSparkles size={14} color="#ffffff" />
                <span>1-Click Generate All Missing ({stats.missingTitle + stats.missingDesc})</span>
              </button>

              {dirtyItems.length > 0 && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSave(dirtyItems)}
                  style={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "9px 18px",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: isSaving ? "wait" : "pointer",
                    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <IconSave size={14} color="#ffffff" />
                  <span>{isSaving ? `Saving (${saveProgress.current}/${saveProgress.total})...` : `Save ${dirtyItems.length} to Shopify`}</span>
                </button>
              )}
            </div>

            {/* Mini Graphic Illustration */}
            <div
              style={{
                position: "relative",
                width: "105px",
                height: "72px",
                background: "linear-gradient(145deg, #ffffff 0%, #f1f5f9 100%)",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                padding: "6px 8px",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#cbd5e1" }} />
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#cbd5e1" }} />
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#cbd5e1" }} />
                <div style={{ flex: 1, height: "4px", background: "#ffffff", borderRadius: "2px", marginLeft: "4px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", height: "36px", padding: "0 4px" }}>
                <div style={{ width: "10px", height: "18px", background: "#10b981", borderRadius: "2px 2px 0 0" }} />
                <div style={{ width: "10px", height: "26px", background: "#3b82f6", borderRadius: "2px 2px 0 0" }} />
                <div style={{ width: "10px", height: "36px", background: "#8b5cf6", borderRadius: "2px 2px 0 0" }} />
              </div>
              <div
                style={{
                  position: "absolute",
                  right: "-4px",
                  top: "12px",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: "#ffffff",
                  border: "1.5px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SEARCH BAR & FILTER TABS (Clean and modern) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", width: "100%" }}>
        {/* Search input with magnifying glass */}
        <div style={{ position: "relative", flex: "1 1 320px", maxWidth: "460px" }}>
          <div style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex", alignItems: "center" }}>
            <IconSearch size={15} color="#94a3b8" />
          </div>
          <input
            type="text"
            placeholder={`Search ${categoryLabel.toLowerCase()} by title or keyword...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 14px 9px 36px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontSize: "13px",
              background: "#ffffff",
              color: "#0f172a",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: `All (${stats.total})` },
            { id: "missing-title", label: `Missing Title (${stats.missingTitle})` },
            { id: "missing-desc", label: `Missing Description (${stats.missingDesc})` },
            { id: "optimized", label: `Optimized (${stats.optimized})` },
          ].map((f) => {
            const isSel = filterMode === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                style={{
                  background: isSel ? "#0f172a" : "#ffffff",
                  color: isSel ? "#ffffff" : "#64748b",
                  border: `1px solid ${isSel ? "#0f172a" : "#e2e8f0"}`,
                  borderRadius: "8px",
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: isSel ? "700" : "600",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: isSel ? "0 1px 3px rgba(15,23,42,0.15)" : "none",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. SELECT ALL FILTERED ROW */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "#334155", cursor: "pointer" }}>
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
            style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
          />
          <span>Select All Filtered ({filtered.length})</span>
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

      {/* 4. PRODUCT / RESOURCE TABLE */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          overflowX: "auto",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>
              <th style={{ width: "38px", padding: "12px 10px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.has(item.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set([...selectedIds, ...paginatedItems.map((item) => item.id)]));
                    } else {
                      const pSet = new Set(paginatedItems.map((item) => item.id));
                      setSelectedIds(new Set([...selectedIds].filter((id) => !pSet.has(id))));
                    }
                  }}
                  style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }}
                />
              </th>
              <th style={{ width: "22%", minWidth: "170px", padding: "12px 14px", fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                {categoryLabel.toUpperCase().slice(0, -1) || "ITEM"}
              </th>
              <th style={{ width: "22%", minWidth: "160px", padding: "12px 14px", fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                SEO Title (Max {TITLE_MAX})
              </th>
              <th style={{ width: "20%", minWidth: "150px", padding: "12px 14px", fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                Target Keywords
              </th>
              <th style={{ width: "26%", minWidth: "210px", padding: "12px 14px", fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                SEO Description (Max {DESC_MAX})
              </th>
              <th style={{ width: "85px", minWidth: "80px", padding: "12px 10px", textAlign: "center", fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                Status
              </th>
              <th style={{ width: "42px", padding: "12px 8px", textAlign: "center" }}></th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  No items match your current search/filter.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
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
                      background: isSelected ? "#f0fdf4" : dirty ? "#fefce8" : "#ffffff",
                      transition: "background-color 0.1s ease",
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: "12px 10px", verticalAlign: "middle", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          setSelectedIds(next);
                        }}
                        style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }}
                      />
                    </td>

                    {/* Catalog Product / Item Thumbnail & Name */}
                    <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            style={{
                              width: "44px",
                              height: "44px",
                              borderRadius: "8px",
                              objectFit: "cover",
                              border: "1px solid #e2e8f0",
                              background: "#f8fafc",
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "44px",
                              height: "44px",
                              borderRadius: "8px",
                              background: "#f1f5f9",
                              border: "1px solid #e2e8f0",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#94a3b8",
                              flexShrink: 0,
                            }}
                          >
                            {resourceType === "collection" ? (
                              <IconFolder size={20} color="#94a3b8" />
                            ) : resourceType === "page" ? (
                              <IconFileText size={20} color="#94a3b8" />
                            ) : resourceType === "article" ? (
                              <IconArticle size={20} color="#94a3b8" />
                            ) : (
                              <IconBox size={20} color="#94a3b8" />
                            )}
                          </div>
                        )}
                        <div style={{ minWidth: 0, overflow: "hidden" }}>
                          <div style={{ fontWeight: "700", color: "#0f172a", fontSize: "13px", lineHeight: "1.3", wordBreak: "break-word" }}>
                            {item.title}
                          </div>
                          {item.handle && (
                            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px", wordBreak: "break-all" }}>
                              /{item.handle}
                            </div>
                          )}
                          {item.blogTitle && (
                            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                              Blog: {item.blogTitle}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* SEO Title Input */}
                    <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                      <div>
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
                            padding: "7px 10px",
                            fontSize: "12px",
                            borderRadius: "6px",
                            border: `1px solid ${titleLen > TITLE_MAX ? "#ef4444" : "#e2e8f0"}`,
                            boxSizing: "border-box",
                            background: "#ffffff",
                            color: "#0f172a",
                            outline: "none",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            marginTop: "3px",
                            color: titleLen === 0 ? "#94a3b8" : titleLen <= TITLE_MAX ? "#10b981" : "#ef4444",
                          }}
                        >
                          {titleLen} / {TITLE_MAX} characters
                        </div>
                      </div>
                    </td>

                    {/* Target Keywords Input */}
                    <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                      <div>
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
                          placeholder="e.g. fashion, cotton, premium..."
                          style={{
                            width: "100%",
                            padding: "7px 10px",
                            fontSize: "12px",
                            borderRadius: "6px",
                            border: "1px solid #e2e8f0",
                            boxSizing: "border-box",
                            background: "#ffffff",
                            color: "#0f172a",
                            outline: "none",
                          }}
                        />
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                          {kwArray.length > 0 ? (
                            kwArray.slice(0, 2).map((kw, i) => (
                              <span
                                key={i}
                                style={{
                                  fontSize: "10px",
                                  background: "#eff6ff",
                                  color: "#0284c7",
                                  border: "1px solid #dbeafe",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  fontWeight: "600",
                                }}
                              >
                                #{kw}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: "10px", color: "#94a3b8" }}>Target keywords</span>
                          )}
                          {kwArray.length > 2 && (
                            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "600" }}>
                              +{kwArray.length - 2} more
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* SEO Description Input */}
                    <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                      <div>
                        <textarea
                          rows={2}
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
                            padding: "7px 10px",
                            fontSize: "12px",
                            lineHeight: "1.4",
                            borderRadius: "6px",
                            border: `1px solid ${descLen > DESC_MAX ? "#ef4444" : "#e2e8f0"}`,
                            boxSizing: "border-box",
                            resize: "vertical",
                            background: "#ffffff",
                            color: "#0f172a",
                            outline: "none",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            marginTop: "3px",
                            color: descLen === 0 ? "#94a3b8" : descLen <= DESC_MAX ? "#10b981" : "#ef4444",
                          }}
                        >
                          {descLen} / {DESC_MAX} characters
                        </div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: "12px 10px", verticalAlign: "top", textAlign: "center" }}>
                      {dirty ? (
                        <span
                          style={{
                            display: "inline-block",
                            background: "#fffbeb",
                            color: "#d97706",
                            border: "1px solid #fde68a",
                            padding: "3px 9px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Unsaved
                        </span>
                      ) : titleLen > 0 && descLen > 0 && titleLen <= TITLE_MAX && descLen <= DESC_MAX ? (
                        <span
                          style={{
                            display: "inline-block",
                            background: "#ecfdf5",
                            color: "#059669",
                            border: "1px solid #a7f3d0",
                            padding: "3px 9px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Optimized
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            background: "#fef2f2",
                            color: "#dc2626",
                            border: "1px solid #fecaca",
                            padding: "3px 9px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Missing
                        </span>
                      )}
                    </td>

                    {/* Actions Menu */}
                    <td style={{ padding: "12px 8px", verticalAlign: "top", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleGenerateSingle(item)}
                        title="Quick AI generate SEO for this item"
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                          background: "#ffffff",
                          color: "#64748b",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "700",
                          transition: "all 0.15s ease",
                        }}
                      >
                        •••
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. COMPACT BOTTOM PAGINATION (Matching Reference: "Showing 1-4 of 209 products" & "< 1 2 3 4 5 >") */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 4px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
          Showing {filtered.length > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0}–{Math.min(safeCurrentPage * pageSize, filtered.length)} of {filtered.length} {categoryLabel.toLowerCase()}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage === 1}
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "6px",
              border: "1px solid #e2e8f0",
              background: safeCurrentPage === 1 ? "#f8fafc" : "#ffffff",
              color: safeCurrentPage === 1 ? "#cbd5e1" : "#475569",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: safeCurrentPage === 1 ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: "700",
            }}
          >
            ‹
          </button>

          {getPageNumbers().map((pageNum) => (
            <button
              key={pageNum}
              type="button"
              onClick={() => setCurrentPage(pageNum)}
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "6px",
                border: pageNum === safeCurrentPage ? "1px solid #0f172a" : "1px solid #e2e8f0",
                background: pageNum === safeCurrentPage ? "#0f172a" : "#ffffff",
                color: pageNum === safeCurrentPage ? "#ffffff" : "#64748b",
                fontWeight: pageNum === safeCurrentPage ? "700" : "600",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {pageNum}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage === totalPages}
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "6px",
              border: "1px solid #e2e8f0",
              background: safeCurrentPage === totalPages ? "#f8fafc" : "#ffffff",
              color: safeCurrentPage === totalPages ? "#cbd5e1" : "#475569",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: safeCurrentPage === totalPages ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: "700",
            }}
          >
            ›
          </button>
        </div>
      </div>
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
