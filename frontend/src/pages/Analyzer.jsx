import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import AnalysisSummary from "../components/AnalysisSummary";
import KeywordSearch from "../components/KeywordSearch";
import SemanticSearch from "../components/SemanticSearch";
import PageList from "../components/PageList";
import ExportButton from "../components/ExportButton";

const TABS = ["Overview", "Pages", "Keyword Search", "Semantic Search"];

export default function Analyzer() {
  const location = useLocation();
  const navigate  = useNavigate();
  const [activeTab, setActiveTab] = useState("Overview");

  const state = location.state;

  useEffect(() => {
    if (!state?.session_id) navigate("/");
  }, [state, navigate]);

  if (!state?.session_id) return null;

  const { session_id, analysis } = state;

  // PDF is served directly from Flask — no sessionStorage, no quota issues
  const pdfUrl = `http://localhost:5000/api/pdf/${session_id}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-mono flex flex-col">
      {/* Grid bg */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Header */}
      <header className="relative border-b border-neutral-800 px-6 py-3.5 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-neutral-600 hover:text-neutral-300 transition-colors text-xs"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="w-px h-4 bg-neutral-800" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-neutral-100 rounded-sm flex items-center justify-center">
            <FileText size={11} className="text-neutral-950" />
          </div>
          <span className="text-xs font-bold tracking-[0.2em] uppercase">PDF Insights</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 border border-neutral-800 rounded-full px-3 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
          <span className="text-xs text-neutral-500 truncate max-w-48">{analysis.filename}</span>
        </div>
        <ExportButton sessionId={session_id} filename={analysis.filename} />
      </header>

      {/* Tab bar */}
      <div className="relative flex gap-1 border-b border-neutral-800 px-6 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-xs tracking-wide transition-colors relative ${
              activeTab === tab ? "text-neutral-100" : "text-neutral-600 hover:text-neutral-400"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-neutral-300" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="relative flex-1 overflow-hidden">
        {activeTab === "Overview" && (
          <div className="max-w-5xl mx-auto px-6 pt-8 pb-20 overflow-y-auto h-full">
            <AnalysisSummary analysis={analysis} />
          </div>
        )}
        {activeTab === "Pages" && (
          <div className="max-w-5xl mx-auto px-6 pt-8 pb-20 overflow-y-auto h-full">
            <PageList sessionId={session_id} analysis={analysis} />
          </div>
        )}
        {activeTab === "Keyword Search" && (
          <KeywordSearch sessionId={session_id} fileData={pdfUrl} />
        )}
        {activeTab === "Semantic Search" && (
          <SemanticSearch sessionId={session_id} fileData={pdfUrl} />
        )}
      </div>
    </div>
  );
}