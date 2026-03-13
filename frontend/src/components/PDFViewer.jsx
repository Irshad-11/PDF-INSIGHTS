import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ChevronUp, ChevronDown, ZoomIn, ZoomOut, Loader } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

// ── Utility: find all occurrences of searchStr in items ──────────────────────
function findTextRects(textContent, searchStr) {
  if (!searchStr || searchStr.length < 2) return [];
  const needle = searchStr.toLowerCase().trim();
  const rects  = [];

  // Build a flat char map: char → { itemIndex, charIndexInItem }
  const items = textContent.items.filter((i) => i.str);
  // Concatenate all text with item boundaries
  let combined    = "";
  const charMap   = []; // combined index → { item, charPos }

  for (let i = 0; i < items.length; i++) {
    const str = items[i].str;
    for (let c = 0; c < str.length; c++) {
      charMap.push({ itemIndex: i, charPos: c });
      combined += str[c];
    }
    // Space between items
    charMap.push({ itemIndex: i, charPos: -1 });
    combined += " ";
  }

  const lowerCombined = combined.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < lowerCombined.length) {
    const found = lowerCombined.indexOf(needle, searchFrom);
    if (found === -1) break;

    // Collect unique items touched by this match
    const touchedItems = new Set();
    for (let k = found; k < found + needle.length; k++) {
      if (charMap[k] && charMap[k].charPos !== -1) {
        touchedItems.add(charMap[k].itemIndex);
      }
    }

    touchedItems.forEach((idx) => {
      rects.push(items[idx]);
    });

    searchFrom = found + needle.length;
  }

  return rects;
}

// ── Draw highlight overlays on a canvas using PDF coordinate space ────────────
async function drawPageHighlights(page, viewport, overlayDiv, searchTerms, isActivePage) {
  overlayDiv.innerHTML = "";
  if (!searchTerms || searchTerms.length === 0) return;

  const textContent = await page.getTextContent();

  for (const term of searchTerms) {
    const matchedItems = findTextRects(textContent, term);

    for (const item of matchedItems) {
      if (!item.transform) continue;

      // pdfjs transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      // translateX/Y are in PDF user space (bottom-left origin)
      // viewport.transform converts PDF space → canvas space (top-left origin)
      const [, , , , pdfX, pdfY] = item.transform;

      // Map PDF coordinates to viewport (canvas) coordinates
      const [vx, vy] = pdfjsLib.Util.applyTransform([pdfX, pdfY], viewport.transform);

      // Item dimensions in viewport space
      const itemWidth  = item.width  * viewport.scale;
      const itemHeight = Math.abs(item.height) * viewport.scale || 14 * viewport.scale;

      // vx,vy is the bottom-left corner of the text in canvas coords
      // Canvas origin is top-left, so top = vy - itemHeight
      const div = document.createElement("div");
      div.style.position   = "absolute";
      div.style.left       = vx + "px";
      div.style.top        = (vy - itemHeight) + "px";
      div.style.width      = itemWidth + "px";
      div.style.height     = itemHeight + "px";
      div.style.background = isActivePage
        ? "rgba(255, 220, 0, 0.55)"
        : "rgba(255, 220, 0, 0.28)";
      div.style.borderRadius   = "2px";
      div.style.pointerEvents  = "none";
      div.style.mixBlendMode   = "multiply";
      div.style.transition     = "background 0.2s";
      overlayDiv.appendChild(div);
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PDFViewer({ fileData, highlights = [], activePage = null }) {
  const containerRef   = useRef(null);
  const pdfRef         = useRef(null);
  const pageRefs       = useRef({});   // pageNo → { wrapper, canvas, overlay, rendered }
  const renderQueue    = useRef([]);
  const rendering      = useRef(false);
  const [totalPages,   setTotalPages]   = useState(0);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [scale,        setScale]        = useState(1.4);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  // ── Load PDF ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fileData) return;
    setLoading(true);
    setError("");
    pageRefs.current = {};
    renderQueue.current = [];
    rendering.current = false;
    pdfRef.current = null;
    setTotalPages(0);
    setCurrentPage(1);

    pdfjsLib.getDocument({ url: fileData, withCredentials: false })
      .promise
      .then((pdf) => {
        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);
        setLoading(false);
      })
      .catch((e) => {
        setError("Failed to load PDF: " + e.message);
        setLoading(false);
      });
  }, [fileData]);

  // ── Render a single page ───────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNo) => {
    if (!pdfRef.current) return;
    const refs = pageRefs.current[pageNo];
    if (!refs || refs.rendered) return;

    refs.rendered = true; // mark before async to prevent double-render

    try {
      const page     = await pdfRef.current.getPage(pageNo);
      const viewport = page.getViewport({ scale });

      const { canvas, overlay } = refs;
      if (!canvas) return;

      // Use device pixel ratio for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.floor(viewport.width  * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width  = viewport.width  + "px";
      canvas.style.height = viewport.height + "px";

      // Overlay matches canvas CSS size exactly
      if (overlay) {
        overlay.style.width  = viewport.width  + "px";
        overlay.style.height = viewport.height + "px";
      }

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Draw highlights
      if (overlay) {
        const pageHighlights = highlights.filter((h) => h.page === pageNo);
        const terms = pageHighlights.map((h) => h.text).filter(Boolean);
        if (terms.length > 0) {
          await drawPageHighlights(page, viewport, overlay, terms, activePage === pageNo);
        }
      }
    } catch (e) {
      const refs2 = pageRefs.current[pageNo];
      if (refs2) refs2.rendered = false; // allow retry on error
      console.error("Render error page", pageNo, e);
    }
  }, [scale, highlights, activePage]);

  // ── Process render queue ───────────────────────────────────────────────────
  const processQueue = useCallback(async () => {
    if (rendering.current) return;
    rendering.current = true;
    while (renderQueue.current.length > 0) {
      const pageNo = renderQueue.current.shift();
      await renderPage(pageNo);
    }
    rendering.current = false;
  }, [renderPage]);

  const enqueueRender = useCallback((pageNo) => {
    if (!renderQueue.current.includes(pageNo)) {
      renderQueue.current.unshift(pageNo); // priority: newest first
    }
    processQueue();
  }, [processQueue]);

  // ── Re-render all when scale/highlights change ─────────────────────────────
  useEffect(() => {
    if (!pdfRef.current || loading) return;
    // Reset rendered flags → force re-render
    Object.values(pageRefs.current).forEach((r) => { r.rendered = false; });
    renderQueue.current = [];
    // Re-enqueue all currently mounted pages
    Object.keys(pageRefs.current).forEach((pNo) => enqueueRender(parseInt(pNo)));
  }, [scale, highlights, activePage, enqueueRender, loading]);

  // ── Scroll to activePage ───────────────────────────────────────────────────
  useEffect(() => {
    if (!activePage || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-page="${activePage}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(activePage);
    }
  }, [activePage]);

  // ── Track current page via IntersectionObserver ────────────────────────────
  useEffect(() => {
    if (!containerRef.current || totalPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setCurrentPage(parseInt(entry.target.dataset.page));
          }
        });
      },
      { root: containerRef.current, threshold: 0.3 }
    );
    containerRef.current.querySelectorAll("[data-page]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [totalPages]);

  const scrollTo = (pNo) => {
    const el = containerRef.current?.querySelector(`[data-page="${pNo}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const matchedPages = new Set(highlights.map((h) => h.page));

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-xs p-6 text-center border border-neutral-800 rounded-lg bg-neutral-900">
        <div>
          <p className="mb-1 font-medium">PDF Load Error</p>
          <p className="text-neutral-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-950 flex-shrink-0">
        {/* Page nav */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => scrollTo(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 disabled:opacity-30 transition-colors"
          >
            <ChevronUp size={13} />
          </button>
          <span className="text-xs text-neutral-500 px-1.5 tabular-nums min-w-14 text-center">
            {currentPage} / {totalPages || "—"}
          </span>
          <button
            onClick={() => scrollTo(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 disabled:opacity-30 transition-colors"
          >
            <ChevronDown size={13} />
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.6, parseFloat((s - 0.2).toFixed(1))))}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <ZoomOut size={13} />
          </button>
          <span className="text-xs text-neutral-600 w-10 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3.0, parseFloat((s + 0.2).toFixed(1))))}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <ZoomIn size={13} />
          </button>
        </div>

        {/* Match count */}
        {matchedPages.size > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-yellow-400/70" />
            <span className="text-xs text-neutral-600">
              {matchedPages.size} page{matchedPages.size !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* ── Pages ───────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto py-4 px-3 space-y-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#3a3a3a transparent" }}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Loader size={18} className="text-neutral-600 animate-spin" />
            <span className="text-xs text-neutral-600">Loading PDF...</span>
          </div>
        )}

        {!loading && Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNo) => {
          const hasMatch = matchedPages.has(pageNo);
          const isActive = activePage === pageNo;

          return (
            <div
              key={pageNo}
              data-page={pageNo}
              className={`relative rounded overflow-hidden transition-all duration-200 ${
                isActive
                  ? "ring-2 ring-yellow-400/70 shadow-lg shadow-yellow-400/10"
                  : hasMatch
                  ? "ring-1 ring-yellow-400/25"
                  : "ring-1 ring-neutral-800"
              }`}
            >
              {/* Page number badge */}
              <div
                className={`absolute top-2 left-2 z-20 text-[10px] px-1.5 py-0.5 rounded font-mono leading-none ${
                  isActive
                    ? "bg-yellow-400 text-neutral-950 font-bold"
                    : "bg-neutral-900/80 text-neutral-500"
                }`}
              >
                {pageNo}
              </div>

              {/* Match badge */}
              {hasMatch && (
                <div className="absolute top-2 right-2 z-20 bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-[10px] px-1.5 py-0.5 rounded font-mono leading-none">
                  match
                </div>
              )}

              {/* Canvas + highlight overlay */}
              <div className="relative bg-white">
                <canvas
                  ref={(el) => {
                    if (!el) return;
                    if (!pageRefs.current[pageNo]) pageRefs.current[pageNo] = {};
                    pageRefs.current[pageNo].canvas = el;
                    if (pdfRef.current && !pageRefs.current[pageNo].rendered) {
                      enqueueRender(pageNo);
                    }
                  }}
                  style={{ display: "block" }}
                />
                {/* Highlight overlay — sits exactly over the canvas */}
                <div
                  ref={(el) => {
                    if (!el) return;
                    if (!pageRefs.current[pageNo]) pageRefs.current[pageNo] = {};
                    pageRefs.current[pageNo].overlay = el;
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    pointerEvents: "none",
                    overflow: "hidden",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}