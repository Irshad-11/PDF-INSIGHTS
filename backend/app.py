import os

# Force CPU — MX110 (sm_50) is not supported by this PyTorch build
os.environ["CUDA_VISIBLE_DEVICES"]    = ""
os.environ["TOKENIZERS_PARALLELISM"]  = "false"

import io
import time
import uuid
import pickle
import tempfile
import threading
import traceback
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import fitz          # PyMuPDF
import pytesseract
from PIL import Image
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.urandom(24)
CORS(app, supports_credentials=True,
     origins=["http://localhost:5173", "http://127.0.0.1:5173"])

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR      = Path(tempfile.gettempdir()) / "pdfinsights"
BASE_DIR.mkdir(exist_ok=True)
SESSIONS_DIR  = BASE_DIR / "sessions"   # one pickle file per session
PDF_DIR       = BASE_DIR / "pdfs"       # actual PDF files on disk
INDEX_DIR     = BASE_DIR / "indexes"    # FAISS indexes on disk (memory-mapped)

for d in (SESSIONS_DIR, PDF_DIR, INDEX_DIR):
    d.mkdir(exist_ok=True)

print(f"[pdfinsights] Session dir: {SESSIONS_DIR}")
print(f"[pdfinsights] PDF dir:     {PDF_DIR}")
print(f"[pdfinsights] Index dir:   {INDEX_DIR}")

# ── Thread lock (only for concurrent writes to same session) ──────────────────
store_lock = threading.Lock()

# ── Load model ONCE ───────────────────────────────────────────────────────────
print("Loading SentenceTransformer model...")
embedder  = SentenceTransformer("all-MiniLM-L6-v2")
print("Model loaded.")

EMBED_DIM        = 384
MAX_FILE_SIZE_MB = 50
MAX_PAGES        = 1000

# ── Load Pix2Tex (LaTeX-OCR) ONCE globally ───────────────────────────────────
print("Loading Pix2Tex (LaTeX-OCR) model... (this may take 10-20 seconds on CPU)")
try:
    from pix2tex.cli import LatexOCR
    latex_ocr = LatexOCR()          # ← loaded only once
    PIX2TEX_AVAILABLE = True
    print("✅ Pix2Tex model loaded successfully.")
except Exception as e:
    print(f"[WARN] Pix2Tex failed to load: {e}")
    latex_ocr = None
    PIX2TEX_AVAILABLE = False


# ── Session helpers — pickle per session + disk files (low RAM) ───────────────

def _session_path(sid: str) -> Path:
    safe = "".join(c for c in sid if c.isalnum() or c == "-")
    return SESSIONS_DIR / f"{safe}.pkl"

def _pdf_path(sid: str) -> Path:
    safe = "".join(c for c in sid if c.isalnum() or c == "-")
    return PDF_DIR / f"{safe}.pdf"

def _index_path(sid: str) -> Path:
    safe = "".join(c for c in sid if c.isalnum() or c == "-")
    return INDEX_DIR / f"{safe}.faiss"

def get_session_data(sid: str) -> dict:
    p = _session_path(sid)
    if not p.exists():
        return {}
    try:
        with open(p, "rb") as f:
            return pickle.load(f)
    except Exception as e:
        print(f"[session] read error {sid}: {e}")
        return {}

def set_session_data(sid: str, data: dict):
    p = _session_path(sid)
    with store_lock:
        try:
            with open(p, "wb") as f:
                pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception as e:
            print(f"[session] write error {sid}: {e}")

def delete_session(sid: str):
    with store_lock:
        for path in (_session_path(sid), _pdf_path(sid), _index_path(sid)):
            if path.exists():
                try:
                    path.unlink()
                    print(f"[cleanup] deleted {path.name}")
                except Exception as e:
                    print(f"[cleanup] error deleting {path}: {e}")


# ── OCR helper ────────────────────────────────────────────────────────────────

def ocr_page(page, dpi: int = 200):
    mat  = fitz.Matrix(dpi / 72, dpi / 72)
    pix  = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img  = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
    words = [w for w in data["text"] if w.strip()]
    confs = [
        int(c) for c, w in zip(data["conf"], data["text"])
        if w.strip() and str(c).lstrip("-").isdigit() and int(c) != -1
    ]
    text       = " ".join(words)
    confidence = float(np.mean(confs)) if confs else 0.0
    return text, confidence


# ── PDF analysis pipeline (NOW DISK-BASED — LOW RAM) ─────────────────────────

def analyze_pdf(pdf_bytes: bytes, math_mode: bool = False, sid: str = None) -> dict:
    if not sid:
        raise ValueError("sid is required for disk storage")

    doc         = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    print(f"[analyze_pdf] {total_pages} pages, math_mode={math_mode}")

    # Save PDF to disk immediately (removes huge bytes from RAM/pickle)
    pdf_path = _pdf_path(sid)
    pdf_path.write_bytes(pdf_bytes)
    print(f"[disk] PDF saved → {pdf_path.name} ({len(pdf_bytes)/1024/1024:.1f} MB)")

    pages_data = []
    all_chunks = []   # (page_no_1based, text)

    for page_no in range(total_pages):
        page     = doc[page_no]
        raw_text = page.get_text("text").strip()
        is_scanned = len(raw_text) < 50

        if is_scanned:
            text, confidence = ocr_page(page)
            method = "ocr"
        else:
            text       = raw_text
            confidence = 100.0
            method     = "text"

        print(f"  p{page_no+1}: {method} conf={confidence:.0f}")

        # Chunk for semantic search
        for sent in text.replace("\n", " ").split(". "):
            s = sent.strip()
            if len(s) > 20:
                all_chunks.append((page_no + 1, s))

        page_info = {
            "page":        page_no + 1,
            "method":      method,
            "text":        text,
            "confidence":  round(confidence, 1),
            "ocr_quality": "good" if confidence >= 70 else ("medium" if confidence >= 30 else "poor"),
            "has_equation": False,
            "equations":   [],
        }

        # ==================== MATH DETECTION (Pix2Tex) ====================
        if math_mode and PIX2TEX_AVAILABLE:
            try:
                mat2 = fitz.Matrix(150 / 72, 150 / 72)
                pix2 = page.get_pixmap(matrix=mat2, colorspace=fitz.csRGB)
                img2 = Image.frombytes("RGB", [pix2.width, pix2.height], pix2.samples)
                latex = latex_ocr(img2)

                if latex and len(latex.strip()) > 5 and ("\\" in latex or "{" in latex or "$" in latex):
                    page_info["has_equation"] = True
                    page_info["equations"].append(latex.strip())
                    print(f"  p{page_no+1}: ✅ Found equation → {latex[:70]}...")
                else:
                    print(f"  p{page_no+1}: No equation detected")
            except Exception as e:
                print(f"[Pix2Tex] p{page_no+1} error: {e}")
        # ==================================================================

        pages_data.append(page_info)

    doc.close()

    # ==================== FAISS on DISK (memory-mapped) ====================
    faiss_path = None
    chunk_texts = []
    chunk_pages_list = []

    if all_chunks:
        chunk_texts      = [c[1] for c in all_chunks]
        chunk_pages_list = [c[0] for c in all_chunks]

        print(f"[FAISS] encoding {len(chunk_texts)} chunks (batch_size=64)...")
        emb = embedder.encode(chunk_texts, show_progress_bar=False,
                              batch_size=64, normalize_embeddings=True)
        emb = np.array(emb, dtype="float32")

        idx = faiss.IndexFlatIP(EMBED_DIM)
        idx.add(emb)

        faiss_path = _index_path(sid)
        faiss.write_index(idx, str(faiss_path))
        print(f"[FAISS] index saved to disk → {faiss_path.name} ({faiss_path.stat().st_size/1024:.1f} KB)")
    # ====================================================================

    return {
        "total_pages":    total_pages,
        "text_pages":     sum(1 for p in pages_data if p["method"] == "text"),
        "scanned_pages":  sum(1 for p in pages_data if p["method"] == "ocr"),
        "avg_confidence": round(float(np.mean([p["confidence"] for p in pages_data])), 1) if pages_data else 0.0,
        "equation_pages": sum(1 for p in pages_data if p["has_equation"]),
        "pages":          pages_data,
        "chunks":         chunk_texts,
        "chunk_pages":    chunk_pages_list,
        "faiss_path":     str(faiss_path) if faiss_path else None,
        "pdf_path":       str(pdf_path),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})


@app.route("/api/upload", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported"}), 400

    math_mode = request.form.get("math_mode", "false").lower() == "true"
    pdf_bytes = file.read()
    size_mb   = len(pdf_bytes) / (1024 * 1024)

    if size_mb > MAX_FILE_SIZE_MB:
        return jsonify({"error": f"File too large ({size_mb:.1f} MB). Max {MAX_FILE_SIZE_MB} MB"}), 400

    try:
        doc        = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)
        doc.close()
        if page_count > MAX_PAGES:
            return jsonify({"error": f"Too many pages ({page_count}). Max {MAX_PAGES}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid PDF: {e}"}), 400

    sid   = str(uuid.uuid4())
    start = time.time()

    try:
        result = analyze_pdf(pdf_bytes, math_mode=math_mode, sid=sid)
    except Exception as e:
        print("[ERROR] analyze_pdf:")
        traceback.print_exc()
        return jsonify({"error": f"Analysis failed: {e}"}), 500

    elapsed = round(time.time() - start, 2)
    result.update({
        "processing_time": elapsed,
        "filename":        file.filename,
        "size_mb":         round(size_mb, 2),
        "math_mode":       math_mode,
        "uploaded_at":     datetime.utcnow().isoformat(),
        "session_id":      sid,
    })

    # Persist to disk — survives server restarts
    set_session_data(sid, result)
    print(f"[upload] sid={sid} saved in {elapsed}s")

    # Return summary (exclude heavy lists from JSON response)
    summary = {
        k: v for k, v in result.items()
        if k not in ("chunks", "chunk_pages", "pages", "pdf_path", "faiss_path")
    }
    summary["pages_summary"] = result["pages"]   # full page objects with text
    return jsonify({"session_id": sid, "analysis": summary})


@app.route("/api/pdf/<sid>", methods=["GET"])
def serve_pdf(sid):
    """Serve PDF from disk (low RAM)."""
    data = get_session_data(sid)
    if not data:
        print(f"[serve_pdf] sid={sid} NOT FOUND")
        return jsonify({"error": "Session not found — please re-upload the PDF"}), 404

    pdf_path = Path(data.get("pdf_path", ""))
    if not pdf_path.exists():
        return jsonify({"error": "PDF file not found on disk"}), 404

    print(f"[serve_pdf] sid={sid} → {pdf_path.name}")
    return send_file(
        str(pdf_path),
        mimetype="application/pdf",
        as_attachment=False,
        download_name=data.get("filename", "document.pdf")
    )


@app.route("/api/page-text/<sid>/<int:page_no>", methods=["GET"])
def get_page_text(sid, page_no):
    """Return full extracted text for one page."""
    data = get_session_data(sid)
    if not data:
        return jsonify({"error": "Session not found"}), 404
    page = next((p for p in data.get("pages", []) if p["page"] == page_no), None)
    if not page:
        return jsonify({"error": f"Page {page_no} not found"}), 404
    return jsonify({
        "page":      page["page"],
        "text":      page.get("text", ""),
        "method":    page.get("method"),
        "equations": page.get("equations", []),
    })


@app.route("/api/search/keyword", methods=["POST"])
def keyword_search():
    body  = request.json or {}
    sid   = body.get("session_id")
    query = body.get("query", "").strip()

    if not sid or not query:
        return jsonify({"error": "session_id and query required"}), 400

    data = get_session_data(sid)
    if not data:
        return jsonify({"error": "Session not found. Re-upload the PDF."}), 404

    results     = []
    query_lower = query.lower()

    for page in data.get("pages", []):
        text  = page.get("text", "")
        start = 0
        while True:
            idx = text.lower().find(query_lower, start)
            if idx == -1:
                break
            s = max(0, idx - 120)
            e = min(len(text), idx + len(query) + 120)
            results.append({
                "page":         page["page"],
                "snippet":      text[s:e],
                "match_start":  idx - s,
                "match_length": len(query),
                "query":        query,
            })
            start = idx + len(query)

    return jsonify({"query": query, "results": results, "total": len(results)})


@app.route("/api/search/semantic", methods=["POST"])
def semantic_search():
    body   = request.json or {}
    sid    = body.get("session_id")
    query  = body.get("query", "").strip()
    top_k  = int(body.get("top_k", 10))
    offset = int(body.get("offset", 0))

    if not sid or not query:
        return jsonify({"error": "session_id and query required"}), 400

    data = get_session_data(sid)
    if not data:
        return jsonify({"error": "Session not found. Re-upload the PDF."}), 404

    faiss_path_str = data.get("faiss_path")
    chunks         = data.get("chunks", [])
    chunk_pages    = data.get("chunk_pages", [])

    if not faiss_path_str or not Path(faiss_path_str).exists():
        return jsonify({"error": "No search index found. Re-upload the PDF."}), 400

    try:
        # MEMORY-MAPPED FAISS → almost zero extra RAM usage
        index_obj = faiss.read_index(faiss_path_str, faiss.IO_FLAG_MMAP)

        q_emb   = embedder.encode([query], normalize_embeddings=True)
        q_emb   = np.array(q_emb, dtype="float32")
        fetch_k = min(top_k + offset + 20, len(chunks))
        scores, indices = index_obj.search(q_emb, fetch_k)

        results = []
        for score, i in zip(scores[0], indices[0]):
            if i < 0 or i >= len(chunks):
                continue
            results.append({
                "chunk":      chunks[i],
                "page":       chunk_pages[i],
                "score":      round(float(score), 4),
                "confidence": "high" if score > 0.7 else ("medium" if score > 0.4 else "low"),
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        paginated = results[offset: offset + top_k]

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Semantic search failed: {e}"}), 500

    return jsonify({
        "query":    query,
        "results":  paginated,
        "total":    len(results),
        "has_more": len(results) > offset + top_k,
        "offset":   offset,
    })


@app.route("/api/export/markdown", methods=["POST"])
def export_markdown():
    body = request.json or {}
    sid  = body.get("session_id")
    if not sid:
        return jsonify({"error": "session_id required"}), 400

    data = get_session_data(sid)
    if not data:
        return jsonify({"error": "Session not found. Re-upload the PDF."}), 404

    filename = data.get("filename", "document.pdf")
    ts       = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        "+++++++++++++++++++++++++++++++++++++++++",
        f"This text was generated from: {filename}",
        "From Website: PDF Insights",
        f"Generated at: {ts}",
        "LaTeX Supported Math Equations",
        "+++++++++++++++++++++++++++++++++++++++++\n",
    ]
    for page in data.get("pages", []):
        lines.append(f"## Page {page['page']}")
        lines.append(
            f"*{page['method'].upper()} | "
            f"{page.get('ocr_quality','?')} | "
            f"{page.get('confidence',0)}% confidence*\n"
        )
        t = page.get("text", "").strip()
        if t:
            lines.append(t)
        for eq in page.get("equations", []):
            lines.append(f"\n$$\n{eq}\n$$\n")
        lines.append("\n---\n")

    buf = io.BytesIO("\n".join(lines).encode("utf-8"))
    buf.seek(0)
    safe = filename.replace(".pdf", "").replace(" ", "_")
    return send_file(buf, mimetype="text/markdown", as_attachment=True,
                     download_name=f"{safe}_insights.md")


@app.route("/api/session/<sid>", methods=["DELETE"])
def clear_session(sid):
    delete_session(sid)
    return jsonify({"status": "cleared"})


# ── Debug route to list all active sessions ───────────────────────────────────
@app.route("/api/sessions", methods=["GET"])
def list_sessions():
    files = list(SESSIONS_DIR.glob("*.pkl"))
    return jsonify({
        "count": len(files),
        "sessions": [f.stem for f in files],
        "dir": str(SESSIONS_DIR),
    })


if __name__ == "__main__":
    print(f"[pdfinsights] sessions stored at: {SESSIONS_DIR}")
    # debug=False removes ALL auto-reload behaviour — sessions in memory are never wiped
    app.run(debug=False, port=5000)