import { useState } from "react";
import { Search, FileText, AlertCircle, ScanText } from "lucide-react";
import PDFViewer from "./PDFViewer";

function HighlightedSnippet({ text, query }) {
  if (!text || !query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-yellow-300 text-neutral-950 rounded-sm px-0.5 font-semibold not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

export default function KeywordSearch({ sessionId, fileData }) {
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [activePage,   setActivePage]   = useState(null);
  const [activeResult, setActiveResult] = useState(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    setActivePage(null);
    setActiveResult(null);

    try {
      const res  = await fetch("http://localhost:5000/api/search/keyword", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sessionId, query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data);
      // Auto-jump to first result
      if (data.results.length > 0) setActivePage(data.results[0].page);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (result, idx) => {
    setActivePage(result.page);
    setActiveResult(idx);
  };

  // highlights: pass the search query as text so PDFViewer can find it on each page
  const highlights = results?.results?.map((r) => ({
    page: r.page,
    text: results.query,   // use the actual query for coordinate matching
  })) || [];

  // Deduplicate by page (one highlight entry per page is enough)
  const uniqueHighlights = highlights.filter(
    (h, i, arr) => arr.findIndex((x) => x.page === h.page) === i
  );

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
        {/* Search bar */}
        <div className="flex gap-2 mb-4 flex-shrink-0">
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Enter keyword..."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-3 py-2.5 text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-neutral-600 transition-colors"
            />
          </div>
          <button
            onClick={search}
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

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-xs border border-red-900 bg-red-950/30 rounded-lg px-3 py-2.5 mb-3 flex-shrink-0">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {/* Count */}
        {results && (
          <p className="text-xs text-neutral-500 mb-3 flex-shrink-0">
            <span className="text-neutral-300 font-medium">{results.total}</span>{" "}
            match{results.total !== 1 ? "es" : ""} for "{results.query}"
          </p>
        )}

        {/* Results */}
        <div
          className="flex-1 overflow-y-auto space-y-2 pr-0.5"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
        >
          {results?.results?.length === 0 && (
            <div className="border border-neutral-800 border-dashed rounded-lg p-8 text-center">
              <p className="text-xs text-neutral-700">No matches found</p>
            </div>
          )}

          {results?.results?.map((r, i) => {
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
                  </div>
                  {isActive && (
                    <span className="text-[10px] text-yellow-400/70 border border-yellow-400/30 rounded px-1.5 py-0.5">
                      viewing
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed line-clamp-3">
                  ...<HighlightedSnippet text={r.snippet} query={results.query} />...
                </p>
              </button>
            );
          })}

          {!results && !loading && (
            <div className="border border-neutral-800 border-dashed rounded-lg p-10 text-center">
              <Search size={20} className="text-neutral-800 mx-auto mb-2.5" />
              <p className="text-xs text-neutral-700">Search to find matches</p>
              <p className="text-xs text-neutral-800 mt-1">Results highlight directly on the PDF</p>
            </div>
          )}
        </div>

        {results?.total > 0 && (
          <p className="text-[11px] text-neutral-700 mt-2.5 flex-shrink-0 text-center">
            Click a result to jump to that page
          </p>
        )}
      </div>
    </div>
  );
}