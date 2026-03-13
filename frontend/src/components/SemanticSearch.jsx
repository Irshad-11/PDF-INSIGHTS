import { useState } from "react";
import { Sparkles, FileText, AlertCircle, ChevronDown, ScanText } from "lucide-react";
import PDFViewer from "./PDFViewer";

const CONF = {
  high:   { bar: "bg-neutral-300",  badge: "text-neutral-300 border-neutral-700 bg-neutral-800" },
  medium: { bar: "bg-amber-400",    badge: "text-amber-400 border-amber-800/50 bg-amber-950/20" },
  low:    { bar: "bg-red-500",      badge: "text-red-400 border-red-900/40 bg-red-950/20" },
};

export default function SemanticSearch({ sessionId, fileData }) {
  const [query,         setQuery]         = useState("");
  const [results,       setResults]       = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [error,         setError]         = useState("");
  const [offset,        setOffset]        = useState(0);
  const [hasMore,       setHasMore]       = useState(false);
  const [activePage,    setActivePage]    = useState(null);
  const [activeResult,  setActiveResult]  = useState(null);

  const doSearch = async (newOffset = 0) => {
    if (!query.trim()) return;
    newOffset === 0 ? setLoading(true) : setLoadingMore(true);
    setError("");

    try {
      const res  = await fetch("http://localhost:5000/api/search/semantic", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sessionId, query, top_k: 10, offset: newOffset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");

      if (newOffset === 0) {
        setResults(data.results);
        setActivePage(null);
        setActiveResult(null);
        if (data.results.length > 0) setActivePage(data.results[0].page);
      } else {
        setResults((prev) => [...(prev || []), ...data.results]);
      }
      setHasMore(data.has_more);
      setOffset(newOffset + data.results.length);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleResultClick = (result, idx) => {
    setActivePage(result.page);
    setActiveResult(idx);
  };

  // For semantic search, highlight the chunk text on each matched page
  const highlights = results?.map((r) => ({
    page: r.page,
    text: r.chunk.substring(0, 80), // first 80 chars for matching
  })) || [];

  // Deduplicate by page
  const uniqueHighlights = highlights.filter(
    (h, i, arr) => arr.findIndex((x) => x.page === h.page) === i
  );

  const lowConfWarn = results?.some((r) => r.confidence === "low");

  return (
    <div className="flex h-[calc(100vh-140px)] -mx-6">
      {/* ── Left: PDF Viewer ─────────────────────────────────────── */}
      <div className="w-[52%] flex-shrink-0 pl-6 pr-2">
        {fileData ? (
          <PDFViewer
            fileData={fileData}
            highlights={uniqueHighlights}
            activePage={activePage}
          />
        ) : (
          <div className="h-full border border-neutral-800 border-dashed rounded-lg flex flex-col items-center justify-center gap-3 bg-neutral-900/30">
            <ScanText size={28} className="text-neutral-700" />
            <p className="text-xs text-neutral-700">PDF appears after search</p>
          </div>
        )}
      </div>

      {/* ── Right: Search panel ──────────────────────────────────── */}
      <div className="flex-1 pr-6 pl-2 flex flex-col min-h-0">
        {/* Search input */}
        <div className="flex gap-2 mb-3 flex-shrink-0">
          <div className="flex-1 relative">
            <Sparkles size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setOffset(0); doSearch(0); } }}
              placeholder="Describe what you're looking for..."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-3 py-2.5 text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-neutral-600 transition-colors"
            />
          </div>
          <button
            onClick={() => { setOffset(0); doSearch(0); }}
            disabled={loading || !query.trim()}
            className={`px-4 py-2.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
              query.trim() && !loading
                ? "bg-neutral-100 text-neutral-950 hover:bg-neutral-200"
                : "bg-neutral-900 border border-neutral-800 text-neutral-700 cursor-not-allowed"
            }`}
          >
            {loading
              ? <span className="w-3.5 h-3.5 border border-neutral-600 border-t-neutral-300 rounded-full animate-spin inline-block" />
              : "Search"
            }
          </button>
        </div>

        {/* Model tag */}
        <p className="text-[11px] text-neutral-700 mb-3 flex-shrink-0">
          all-MiniLM-L6-v2 · FAISS · meaning-based search
        </p>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-xs border border-red-900 bg-red-950/30 rounded-lg px-3 py-2.5 mb-3 flex-shrink-0">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {/* Low confidence warning */}
        {lowConfWarn && (
          <div className="flex items-center gap-2 text-amber-500 text-xs border border-amber-900/40 bg-amber-950/15 rounded-lg px-3 py-2 mb-3 flex-shrink-0">
            <AlertCircle size={12} />
            Some results have low similarity confidence.
          </div>
        )}

        {/* Count */}
        {results && (
          <p className="text-xs text-neutral-500 mb-3 flex-shrink-0">
            <span className="text-neutral-300 font-medium">{results.length}</span>{" "}
            result{results.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* Results */}
        <div
          className="flex-1 overflow-y-auto space-y-2 pr-0.5"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
        >
          {results?.length === 0 && (
            <div className="border border-neutral-800 border-dashed rounded-lg p-8 text-center">
              <p className="text-xs text-neutral-700">No relevant matches found</p>
            </div>
          )}

          {results?.map((r, i) => {
            const conf     = CONF[r.confidence] || CONF.medium;
            const isActive = activeResult === i;
            return (
              <button
                key={i}
                onClick={() => handleResultClick(r, i)}
                className={`w-full text-left border rounded-lg p-3.5 transition-all duration-150 ${
                  isActive
                    ? "border-yellow-400/50 bg-yellow-400/5 shadow-sm"
                    : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText size={11} className={isActive ? "text-yellow-400" : "text-neutral-600"} />
                    <span className={`text-xs font-medium ${isActive ? "text-yellow-400" : "text-neutral-400"}`}>
                      Page {r.page}
                    </span>
                    <span className={`text-[10px] border rounded px-1.5 py-0.5 ${conf.badge}`}>
                      {r.confidence} · {(r.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  {isActive && (
                    <span className="text-[10px] text-yellow-400/70 border border-yellow-400/30 rounded px-1.5 py-0.5">
                      viewing
                    </span>
                  )}
                </div>

                <p className="text-xs text-neutral-500 leading-relaxed line-clamp-3">{r.chunk}</p>

                {/* Score bar */}
                <div className="mt-2.5 h-px bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${conf.bar} opacity-70 transition-all duration-500`}
                    style={{ width: `${Math.min(r.score * 100, 100)}%` }}
                  />
                </div>
              </button>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => doSearch(offset)}
              disabled={loadingMore}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-neutral-800 rounded-lg text-xs text-neutral-600 hover:text-neutral-400 hover:border-neutral-700 transition-all"
            >
              {loadingMore
                ? <span className="w-3 h-3 border border-neutral-600 border-t-neutral-400 rounded-full animate-spin" />
                : <><ChevronDown size={13} /> Load more</>
              }
            </button>
          )}

          {!results && !loading && (
            <div className="border border-neutral-800 border-dashed rounded-lg p-10 text-center">
              <Sparkles size={20} className="text-neutral-800 mx-auto mb-2.5" />
              <p className="text-xs text-neutral-700">Search by concept or meaning</p>
              <p className="text-xs text-neutral-800 mt-1">Results highlight directly on the PDF</p>
            </div>
          )}
        </div>

        {results?.length > 0 && (
          <p className="text-[11px] text-neutral-700 mt-2.5 flex-shrink-0 text-center">
            Click a result to jump to that page
          </p>
        )}
      </div>
    </div>
  );
}