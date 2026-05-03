import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ChevronUp, ChevronDown, ZoomIn, ZoomOut, Loader } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

function findTextRects(textContent, searchStr) {
  if (!searchStr || searchStr.length < 2) return [];
  const needle = searchStr.toLowerCase().trim();
  const rects = [];

  const items = textContent.items.filter((i) => i.str);
  let combined = "";
  const charMap = [];

  for (let i = 0; i < items.length; i++) {
    const str = items[i].str;
    for (let c = 0; c < str.length; c++) {
      charMap.push({ itemIndex: i, charPos: c });
      combined += str[c];
    }
    charMap.push({ itemIndex: i, charPos: -1 });
    combined += " ";
  }

  const lowerCombined = combined.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < lowerCombined.length) {
    const found = lowerCombined.indexOf(needle, searchFrom);
    if (found === -1) break;

    const touchedItems = new Set();
    for (let k = found; k < found + needle.length; k++) {
      if (charMap[k] && charMap[k].charPos !== -1) {
        touchedItems.add(charMap[k].itemIndex);
      }
    }

    touchedItems.forEach((idx) => rects.push(items[idx]));
    searchFrom = found + needle.length;
  }
  return rects;
}

async function drawPageHighlights(page, viewport, overlayDiv, searchTerms, preciseHighlightText, isActivePage) {
  overlayDiv.innerHTML = "";
  console.log("searchTerms:", searchTerms);

  if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
    return;
  }

  const textContent = await page.getTextContent();
  console.log("text items count:", textContent?.items?.length);

  // 🛡️ guard against broken textContent
  if (!textContent || !Array.isArray(textContent.items)) {
    return;
  }

  for (const term of searchTerms) {
    if (!term) continue;

    const matchedItems = findTextRects(textContent, term);
    console.log("term:", term, "matches:", matchedItems?.length);

    // 🛡️ safety
    if (!Array.isArray(matchedItems) || matchedItems.length === 0) continue;

    const isPrecise =
      preciseHighlightText &&
      term.toLowerCase().trim() === preciseHighlightText.toLowerCase().trim();

    for (const item of matchedItems) {
      console.log("drawing highlight...");
      if (!item || !item.transform) continue;

      const transform = item.transform;

      // 🛡️ avoid destructure crash
      if (!Array.isArray(transform) || transform.length < 6) continue;

      const pdfX = transform[4];
      const pdfY = transform[5];

      const point = pdfjsLib.Util.applyTransform([pdfX, pdfY], viewport.transform);
      if (!point || point.length < 2) continue;

      const vx = point[0];
      const vy = point[1];

      const itemWidth = (item.width || 0) * viewport.scale;
      const itemHeight = Math.abs(item.height || 10) * viewport.scale;

      const div = document.createElement("div");
      div.style.position = "absolute";
      div.style.left = `${vx}px`;
      div.style.top = `${vy - itemHeight}px`;
      div.style.width = `${itemWidth}px`;
      div.style.height = `${itemHeight}px`;
      div.style.borderRadius = "3px";
      div.style.pointerEvents = "none";
      div.style.mixBlendMode = "multiply";

      if (isPrecise && isActivePage) {
        div.style.background = "rgba(255, 100, 0, 0.85)";
        div.style.boxShadow = "0 0 0 4px rgba(255, 180, 0, 0.7)";
      } else {
        div.style.background = isActivePage
          ? "rgba(255, 220, 0, 0.55)"
          : "rgba(255, 220, 0, 0.28)";
      }

      overlayDiv.appendChild(div);
    }
  }
}

export default function PDFViewer({
  fileData,
  highlights = [],
  activePage = null,
  preciseHighlightText = null,
}) {
  const renderId = useRef(0);

  const containerRef = useRef(null);
  const pdfRef = useRef(null);
  const pageRefs = useRef({});
  const renderQueue = useRef([]);
  const rendering = useRef(false);

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

    pdfjsLib
      .getDocument({ url: fileData, withCredentials: false })
      .promise.then((pdf) => {
        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);
        setLoading(false);
      })
      .catch((e) => {
        setError("Failed to load PDF: " + e.message);
        setLoading(false);
      });
  }, [fileData]);

  const renderPage = useCallback(async (pageNo) => {
    if (!pdfRef.current) return;

    const refs = pageRefs.current[pageNo];
    if (!refs || refs.rendered) return;

    refs.rendered = true;
    const currentRender = ++renderId.current;

    try {
      const page = await pdfRef.current.getPage(pageNo);
      const viewport = page.getViewport({ scale });

      const { canvas, overlay } = refs;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = viewport.width + "px";
      canvas.style.height = viewport.height + "px";

      if (overlay) {
        overlay.style.width = viewport.width + "px";
        overlay.style.height = viewport.height + "px";
      }

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      await page.render({ canvasContext: ctx, viewport }).promise;

      // kill outdated render
      if (currentRender !== renderId.current) return;

      if (overlay) {
        const safeHighlights = Array.isArray(highlights) ? highlights : [];

        const pageHighlights = safeHighlights.filter((h) => h?.page === pageNo);

        const terms = pageHighlights.map((h) => h?.text).filter(Boolean);

        if (terms.length > 0) {
          await drawPageHighlights(
            page,
            viewport,
            overlay,
            terms,
            preciseHighlightText,
            activePage === pageNo
          );
        }
      }
    } catch (e) {
      const refs2 = pageRefs.current[pageNo];
      if (refs2) refs2.rendered = false;
      console.error("Render error page", pageNo, e);
    }
  }, [scale, highlights, activePage, preciseHighlightText]);

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
      renderQueue.current.unshift(pageNo);
    }
    processQueue();
  }, [processQueue]);

  useEffect(() => {
    if (!pdfRef.current || loading) return;

    Object.values(pageRefs.current).forEach((r) => {
      r.rendered = false;
    });

    renderQueue.current = [];

    Object.keys(pageRefs.current).forEach((pNo) =>
      enqueueRender(parseInt(pNo))
    );
  }, [scale, highlights, activePage, preciseHighlightText, enqueueRender, loading]);

  useEffect(() => {
    if (!activePage || !containerRef.current) return;

    const el = containerRef.current.querySelector(
      `[data-page="${activePage}"]`
    );

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(activePage);
    }
  }, [activePage]);

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

    containerRef.current
      .querySelectorAll("[data-page]")
      .forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [totalPages]);

  const scrollTo = (pNo) => {
    const el = containerRef.current?.querySelector(
      `[data-page="${pNo}"]`
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const matchedPages = new Set((highlights || []).map((h) => h?.page));

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
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-950 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => scrollTo(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>
            <ChevronUp size={13} />
          </button>
          <span>{currentPage} / {totalPages || "—"}</span>
          <button onClick={() => scrollTo(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}>
            <ChevronDown size={13} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}>
            <ZoomOut size={13} />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(3.0, s + 0.2))}>
            <ZoomIn size={13} />
          </button>
        </div>

        {matchedPages.size > 0 && (
          <div>{matchedPages.size} pages</div>
        )}
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto py-4 px-3 space-y-3">
        {loading && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Loader size={18} className="animate-spin" />
            <span>Loading PDF...</span>
          </div>
        )}

        {!loading &&
          Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNo) => (
            <div key={pageNo} data-page={pageNo} className="relative">
              <div className="relative bg-white">
                <canvas
  ref={(el) => {
    if (!pageRefs.current[pageNo]) {
      pageRefs.current[pageNo] = {};
    }
    pageRefs.current[pageNo].canvas = el;
  }}
/>

<div
  ref={(el) => {
    if (!pageRefs.current[pageNo]) {
      pageRefs.current[pageNo] = {};
    }
    pageRefs.current[pageNo].overlay = el;
  }}
  style={{
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: 10
  }}
/>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}