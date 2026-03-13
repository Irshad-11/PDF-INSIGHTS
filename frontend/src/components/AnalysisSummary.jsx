import { FileText, Scan, Percent, Clock, Sigma, AlertTriangle } from "lucide-react";

function StatCard({ icon, label, value, sub, warn }) {
  return (
    <div className={`border rounded-lg p-5 bg-neutral-900 ${warn ? "border-amber-900/60" : "border-neutral-800"}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-neutral-600">{icon}</span>
        {warn && <AlertTriangle size={12} className="text-amber-600" />}
      </div>
      <p className="text-2xl font-bold text-neutral-100 mb-1">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
      {sub && <p className="text-xs text-neutral-700 mt-1">{sub}</p>}
    </div>
  );
}

function QualityBadge({ quality }) {
  const map = {
    good: "bg-neutral-800 text-neutral-300 border-neutral-700",
    medium: "bg-amber-950/40 text-amber-500 border-amber-900/50",
    poor: "bg-red-950/40 text-red-400 border-red-900/50",
  };
  return (
    <span className={`text-xs border rounded px-2 py-0.5 font-medium ${map[quality] || map.medium}`}>
      {quality?.toUpperCase()}
    </span>
  );
}

export default function AnalysisSummary({ analysis }) {
  const a = analysis;
  const lowConf = a.avg_confidence < 30;
  const warnConf = a.avg_confidence < 30;

  const stats = [
    {
      icon: <FileText size={16} />,
      label: "Total Pages",
      value: a.total_pages,
      sub: `${a.size_mb} MB`,
    },
    {
      icon: <FileText size={16} />,
      label: "Text-based Pages",
      value: a.text_pages ?? (a.pages_summary?.filter((p) => p.method === "text").length ?? "—"),
    },
    {
      icon: <Scan size={16} />,
      label: "OCR-processed Pages",
      value: a.scanned_pages ?? (a.pages_summary?.filter((p) => p.method === "ocr").length ?? "—"),
    },
    {
      icon: <Percent size={16} />,
      label: "Avg OCR Confidence",
      value: `${a.avg_confidence}%`,
      warn: warnConf,
      sub: lowConf ? "Poor scanning detected" : undefined,
    },
    {
      icon: <Sigma size={16} />,
      label: "Equation Pages",
      value: a.equation_pages ?? 0,
      sub: a.math_mode ? "Math mode active" : "Math mode off",
    },
    {
      icon: <Clock size={16} />,
      label: "Processing Time",
      value: `${a.processing_time}s`,
    },
  ];

  const pagesSummary = a.pages_summary || [];

  return (
    <div>
      {/* Warning banner */}
      {lowConf && (
        <div className="mb-6 flex items-center gap-3 border border-amber-900/50 bg-amber-950/20 rounded-lg px-5 py-3.5">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-500">
            Poor scanning detected — OCR confidence is below 30%. Results may be inaccurate.
          </p>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>

      {/* Processing breakdown */}
      {pagesSummary.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-neutral-500 tracking-widest uppercase mb-4">
            Processing Transparency
          </h2>
          <div className="border border-neutral-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80">
                  <th className="text-left px-4 py-3 text-neutral-600 font-medium">Page</th>
                  <th className="text-left px-4 py-3 text-neutral-600 font-medium">Method</th>
                  <th className="text-left px-4 py-3 text-neutral-600 font-medium">OCR Quality</th>
                  <th className="text-left px-4 py-3 text-neutral-600 font-medium">Confidence</th>
                  <th className="text-left px-4 py-3 text-neutral-600 font-medium">Equations</th>
                </tr>
              </thead>
              <tbody>
                {pagesSummary.slice(0, 50).map((p, i) => (
                  <tr
                    key={i}
                    className={`border-b border-neutral-900 ${i % 2 === 0 ? "bg-neutral-950" : "bg-neutral-900/40"}`}
                  >
                    <td className="px-4 py-2.5 text-neutral-400">{p.page}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-medium ${p.method === "ocr" ? "text-amber-500" : "text-neutral-300"}`}>
                        {p.method?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <QualityBadge quality={p.ocr_quality} />
                    </td>
                    <td className="px-4 py-2.5 text-neutral-400">{p.confidence}%</td>
                    <td className="px-4 py-2.5 text-neutral-600">{p.has_equation ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagesSummary.length > 50 && (
              <div className="px-4 py-3 border-t border-neutral-800 bg-neutral-900/50 text-xs text-neutral-600">
                Showing first 50 of {pagesSummary.length} pages
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}