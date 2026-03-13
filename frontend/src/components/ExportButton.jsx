import { useState } from "react";
import { Download, Check } from "lucide-react";

export default function ExportButton({ sessionId, filename }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const exportMd = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("http://localhost:5000/api/export/markdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (filename || "document").replace(".pdf", "") + "_insights.md";
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (e) {
      setError(e.message);
      setTimeout(() => setError(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={exportMd}
        disabled={loading}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-all ${
          done
            ? "border-neutral-700 bg-neutral-900 text-neutral-300"
            : "border-neutral-800 bg-neutral-900 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
        }`}
        title="Export as Markdown"
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
        ) : done ? (
          <Check size={13} className="text-neutral-400" />
        ) : (
          <Download size={13} />
        )}
        {done ? "Exported" : "Export .md"}
      </button>
      {error && (
        <div className="absolute right-0 top-full mt-1 text-xs text-red-400 border border-red-900 bg-red-950/40 rounded px-3 py-1.5 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}