import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, Zap, Search, BookOpen, ChevronRight, AlertCircle } from "lucide-react";

export default function Landing() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [mathMode, setMathMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const handleFile = (f) => {
    setError("");
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("File exceeds 50 MB limit.");
      return;
    }
    setFile(f);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  }, []);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const uploadFile = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    setProgress("Uploading PDF...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("math_mode", mathMode.toString());

    try {
      setProgress("Analyzing document...");
      const res = await fetch("http://localhost:5000/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setProgress("Done!");
      navigate("/analyzer", { state: { session_id: data.session_id, analysis: data.analysis } });
    } catch (e) {
      setError(e.message);
      setProgress("");
    } finally {
      setUploading(false);
    }
  };

  const features = [
    { icon: <FileText size={20} />, title: "Smart OCR", desc: "Auto-detects scanned vs text PDFs with confidence metrics" },
    { icon: <Search size={20} />, title: "Semantic Search", desc: "Find content by meaning, not just keywords" },
    { icon: <Zap size={20} />, title: "Equation Extraction", desc: "Detects math and converts to LaTeX automatically" },
    { icon: <BookOpen size={20} />, title: "Markdown Export", desc: "Export with full LaTeX support and metadata headers" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-mono">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Header */}
      <header className="relative border-b border-neutral-800 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-neutral-100 rounded-sm flex items-center justify-center">
            <FileText size={14} className="text-neutral-950" />
          </div>
          <span className="text-sm font-bold tracking-[0.2em] uppercase text-neutral-100">PDF Insights</span>
        </div>
        <span className="text-xs text-neutral-600 tracking-widest uppercase">Smart PDF Analyzer</span>
      </header>

      <main className="relative max-w-4xl mx-auto px-6 pt-24 pb-20">
        {/* Hero */}
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 border border-neutral-800 rounded-full px-4 py-1.5 mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
            <span className="text-xs text-neutral-500 tracking-widest uppercase">v1.0 · Research Tool</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight leading-[1.1] text-neutral-100 mb-5">
            Understand PDFs<br />
            <span className="text-neutral-500">at semantic depth.</span>
          </h1>
          <p className="text-neutral-500 text-base leading-relaxed max-w-lg">
            Upload any PDF — scanned or digital — and extract meaning through OCR, semantic search,
            and mathematical equation detection. Built for researchers and academics.
          </p>
        </div>

        {/* Upload card */}
        <div className="mb-10">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !file && fileInputRef.current?.click()}
            className={`relative border rounded-lg p-10 text-center transition-all duration-200 ${
              dragging
                ? "border-neutral-400 bg-neutral-900"
                : file
                ? "border-neutral-700 bg-neutral-900 cursor-default"
                : "border-neutral-800 bg-neutral-900 hover:border-neutral-700 cursor-pointer"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {file ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border border-neutral-700 rounded-lg flex items-center justify-center">
                  <FileText size={22} className="text-neutral-300" />
                </div>
                <div>
                  <p className="text-neutral-200 font-medium text-sm">{file.name}</p>
                  <p className="text-neutral-600 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setError(""); }}
                  className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors border border-neutral-800 rounded px-3 py-1"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className={`w-12 h-12 border rounded-lg flex items-center justify-center transition-colors ${dragging ? "border-neutral-500 bg-neutral-800" : "border-neutral-800"}`}>
                  <Upload size={20} className="text-neutral-500" />
                </div>
                <div>
                  <p className="text-neutral-400 text-sm">Drop PDF here or click to browse</p>
                  <p className="text-neutral-700 text-xs mt-1">Max 50 MB · Up to 1000 pages</p>
                </div>
              </div>
            )}
          </div>

          {/* Math mode toggle */}
          <div className="mt-4 flex items-center justify-between border border-neutral-800 rounded-lg px-5 py-3.5 bg-neutral-900">
            <div>
              <p className="text-sm text-neutral-300">Mathematical Equation Detection</p>
              <p className="text-xs text-neutral-600 mt-0.5">Enables Pix2Tex pipeline — slower but extracts LaTeX</p>
            </div>
            <button
              onClick={() => setMathMode((m) => !m)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${mathMode ? "bg-neutral-300" : "bg-neutral-800"}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-neutral-950 rounded-full transition-transform duration-200 ${mathMode ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-400 text-xs border border-red-900 bg-red-950/30 rounded-lg px-4 py-3">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={uploadFile}
            disabled={!file || uploading}
            className={`mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-lg text-sm font-medium tracking-wide transition-all duration-200 ${
              file && !uploading
                ? "bg-neutral-100 text-neutral-950 hover:bg-neutral-200"
                : "bg-neutral-900 text-neutral-700 border border-neutral-800 cursor-not-allowed"
            }`}
          >
            {uploading ? (
              <>
                <span className="w-3.5 h-3.5 border border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
                {progress}
              </>
            ) : (
              <>
                Analyze PDF
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-2 gap-3">
          {features.map((f, i) => (
            <div key={i} className="border border-neutral-800 rounded-lg p-5 bg-neutral-900/50">
              <div className="flex items-center gap-3 mb-2.5">
                <span className="text-neutral-500">{f.icon}</span>
                <span className="text-sm font-medium text-neutral-300">{f.title}</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-neutral-900 px-8 py-5 flex items-center justify-between">
        <span className="text-xs text-neutral-700">PDF Insights · PROG 112 · UFTB</span>
        <span className="text-xs text-neutral-700">Irshad Hossain · 2303030</span>
      </footer>
    </div>
  );
}