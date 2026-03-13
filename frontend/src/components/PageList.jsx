import { useState } from "react";
import { ChevronDown, ChevronRight, Scan, FileText, AlertTriangle, Loader } from "lucide-react";

function QualityDot({ quality }) {
  const colors = { good: "bg-neutral-400", medium: "bg-amber-500", poor: "bg-red-500" };
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[quality] || "bg-neutral-700"}`} />;
}

function PageRow({ page, sessionId }) {
  const [open,     setOpen]     = useState(false);
  const [text,     setText]     = useState(null);   // null = not loaded yet
  const [eqs,      setEqs]      = useState([]);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState("");

  const isOcr = page.method === "ocr";
  const warn  = page.confidence < 30;

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    // Fetch text from server the first time we expand
    if (next && text === null && !fetching) {
      setFetching(true);
      setFetchErr("");
      try {
        const res  = await fetch(`http://localhost:5000/api/page-text/${sessionId}/${page.page}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setText(data.text || "");
        setEqs(data.equations || []);
      } catch (e) {
        setFetchErr(e.message);
        setText("");
      } finally {
        setFetching(false);
      }
    }
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${warn ? "border-amber-900/40" : "border-neutral-800"}`}>
      {/* Row header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-neutral-900/60 hover:bg-neutral-900 transition-colors text-left"
      >
        <QualityDot quality={page.ocr_quality} />
        <span className="text-xs text-neutral-400 w-16 flex-shrink-0">Page {page.page}</span>
        <span className={`text-xs font-medium flex-shrink-0 flex items-center gap-1 ${isOcr ? "text-amber-500" : "text-neutral-400"}`}>
          {isOcr ? <Scan size={11} /> : <FileText size={11} />}
          {page.method?.toUpperCase()}
        </span>
        <span className="text-xs text-neutral-600 flex-shrink-0">{page.confidence}%</span>
        <span className={`text-[10px] border rounded px-1.5 py-0.5 flex-shrink-0 ${
          page.ocr_quality === "good"
            ? "border-neutral-700 text-neutral-500"
            : page.ocr_quality === "medium"
            ? "border-amber-800/50 text-amber-600"
            : "border-red-900/50 text-red-500"
        }`}>
          {page.ocr_quality}
        </span>
        {page.has_equation && (
          <span className="text-xs border border-neutral-700 text-neutral-500 rounded px-1.5 py-0.5 flex-shrink-0">
            ∑ LaTeX
          </span>
        )}
        {warn && <AlertTriangle size={11} className="text-amber-600 flex-shrink-0" />}
        <span className="flex-1" />
        {open
          ? <ChevronDown size={13} className="text-neutral-600 flex-shrink-0" />
          : <ChevronRight size={13} className="text-neutral-600 flex-shrink-0" />
        }
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-4 py-4 border-t border-neutral-800 bg-neutral-950">
          {fetching && (
            <div className="flex items-center gap-2 text-neutral-600 text-xs">
              <Loader size={12} className="animate-spin" />
              Loading extracted text...
            </div>
          )}

          {fetchErr && (
            <p className="text-xs text-red-400">{fetchErr}</p>
          )}

          {!fetching && text !== null && (
            <>
              {text.trim() ? (
                <div
                  className="text-xs text-neutral-400 leading-relaxed whitespace-pre-wrap break-words max-h-72 overflow-y-auto pr-1"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
                >
                  {text}
                </div>
              ) : (
                <p className="text-xs text-neutral-700 italic">
                  No text could be extracted from this page.
                </p>
              )}

              {eqs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <p className="text-xs text-neutral-600 mb-2 font-medium">Detected LaTeX equations:</p>
                  {eqs.map((eq, i) => (
                    <code
                      key={i}
                      className="block text-xs bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-300 font-mono mt-1.5 break-all"
                    >
                      {eq}
                    </code>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PageList({ sessionId, analysis }) {
  const pages  = analysis.pages_summary || [];
  const [filter, setFilter] = useState("all");

  const filtered = pages.filter((p) => {
    if (filter === "ocr")       return p.method === "ocr";
    if (filter === "text")      return p.method === "text";
    if (filter === "equations") return p.has_equation;
    return true;
  });

  const counts = {
    all:       pages.length,
    text:      pages.filter((p) => p.method === "text").length,
    ocr:       pages.filter((p) => p.method === "ocr").length,
    equations: pages.filter((p) => p.has_equation).length,
  };

  const filters = [
    { key: "all",       label: `All (${counts.all})` },
    { key: "text",      label: `Text (${counts.text})` },
    { key: "ocr",       label: `OCR (${counts.ocr})` },
    { key: "equations", label: `Equations (${counts.equations})` },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xs font-medium text-neutral-500 tracking-widest uppercase mb-1">
            Page Details
          </h2>
          <p className="text-xs text-neutral-700">Expand any page to view its extracted text</p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filter === f.key
                  ? "border-neutral-600 text-neutral-200 bg-neutral-800"
                  : "border-neutral-800 text-neutral-600 hover:text-neutral-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="border border-neutral-800 border-dashed rounded-lg p-10 text-center">
            <p className="text-xs text-neutral-700">No pages match this filter</p>
          </div>
        ) : (
          filtered.map((p) => (
            <PageRow key={p.page} page={p} sessionId={sessionId} />
          ))
        )}
      </div>
    </div>
  );
}