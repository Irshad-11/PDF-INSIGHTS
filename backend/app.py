import os

# Force CPU — MX110 (sm_50) is not supported by this PyTorch build
os.environ["CUDA_VISIBLE_DEVICES"]    = ""
os.environ["TOKENIZERS_PARALLELISM"]  = "false"

import io
import time
import uuid
import base64
import shelve
import pickle
import tempfile
import threading
import traceback
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify, send_file, make_response
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
SESSIONS_DIR.mkdir(exist_ok=True)
FAISS_TMP     = str(BASE_DIR / "faiss_tmp.idx")

print(f"[pdfinsights] Session dir: {SESSIONS_DIR}")

# ── Thread lock (only for concurrent writes to same session) ──────────────────
store_lock = threading.Lock()

# ── Load model ONCE ───────────────────────────────────────────────────────────
print("Loading SentenceTransformer model...")
embedder  = SentenceTransformer("all-MiniLM-L6-v2")
print("Model loaded.")

EMBED_DIM        = 384
MAX_FILE_SIZE_MB = 50
MAX_PAGES        = 1000


# ── Session helpers — pickle per session (survives restarts) ──────────────────

def _session_path(sid: str) -> Path:
    # Sanitise sid — only allow uuid chars
    safe = "".join(c for c in sid if c.isalnum() or c == "-")
    return SESSIONS_DIR / f"{safe}.pkl"


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
    p = _session_path(sid)
    with store_lock:
        if p.exists():
            p.unlink()


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


# ── PDF analysis pipeline ─────────────────────────────────────────────────────

def analyze_pdf(pdf_bytes: bytes, math_mode: bool = False) -> dict:
    doc         = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    print(f"[analyze_pdf] {total_pages} pages, math_mode={math_mode}")

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

        if math_mode and is_scanned:
            try:
                from pix2tex.cli import LatexOCR
                lat   = LatexOCR()
                mat2  = fitz.Matrix(150 / 72, 150 / 72)
                pix2  = page.get_pixmap(matrix=mat2, colorspace=fitz.csRGB)
                img2  = Image.frombytes("RGB", [pix2.width, pix2.height], pix2.samples)
                latex = lat(img2)
                if latex and len(latex) > 3:
                    page_info["has_equation"] = True
                    page_info["equations"].append(latex)
            except Exception as e:
                print(f"[Pix2Tex] p{page_no+1}: {e}")

        pages_data.append(page_info)

    doc.close()

    # FAISS index
    index_bytes = None
    chunk_texts = []
    chunk_pages_list = []

    if all_chunks:
        chunk_texts      = [c[1] for c in all_chunks]
        chunk_pages_list = [c[0] for c in all_chunks]
        print(f"[FAISS] encoding {len(chunk_texts)} chunks …")
        emb = embedder.encode(chunk_texts, show_progress_bar=False, normalize_embeddings=True)
        emb = np.array(emb, dtype="float32")
        idx = faiss.IndexFlatIP(EMBED_DIM)
        idx.add(emb)
        faiss.write_index(idx, FAISS_TMP)
        with open(FAISS_TMP, "rb") as f:
            index_bytes = base64.b64encode(f.read()).decode()
        print("[FAISS] index built.")

    return {
        "total_pages":    total_pages,
        "text_pages":     sum(1 for p in pages_data if p["method"] == "text"),
        "scanned_pages":  sum(1 for p in pages_data if p["method"] == "ocr"),
        "avg_confidence": round(float(np.mean([p["confidence"] for p in pages_data])), 1) if pages_data else 0.0,
        "equation_pages": sum(1 for p in pages_data if p["has_equation"]),
        "pages":          pages_data,
        "chunks":         chunk_texts,
        "chunk_pages":    chunk_pages_list,
        "faiss_index":    index_bytes,
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
        result = analyze_pdf(pdf_bytes, math_mode=math_mode)
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
        "pdf_bytes":       pdf_bytes,   # kept for /api/pdf/<sid>
    })

    # Persist to disk — survives server restarts
    set_session_data(sid, result)
    print(f"[upload] sid={sid} saved to {_session_path(sid)} in {elapsed}s")

    # Return summary (exclude heavy binary fields from JSON response)
    summary = {
        k: v for k, v in result.items()
        if k not in ("chunks", "chunk_pages", "faiss_index", "pages", "pdf_bytes")
    }
    summary["pages_summary"] = result["pages"]   # full page objects with text
    return jsonify({"session_id": sid, "analysis": summary})


@app.route("/api/pdf/<sid>", methods=["GET"])
def serve_pdf(sid):
    """Stream raw PDF bytes to the browser pdfjs viewer."""
    data = get_session_data(sid)
    if not data:
        print(f"[serve_pdf] sid={sid} NOT FOUND in {SESSIONS_DIR}")
        return jsonify({"error": "Session not found — please re-upload the PDF"}), 404

    pdf_bytes = data.get("pdf_bytes")
    if not pdf_bytes:
        return jsonify({"error": "PDF bytes missing from session"}), 404

    resp = make_response(bytes(pdf_bytes))
    resp.headers["Content-Type"]        = "application/pdf"
    resp.headers["Content-Disposition"] = f'inline; filename="{data.get("filename","doc.pdf")}"'
    resp.headers["Content-Length"]      = str(len(pdf_bytes))
    resp.headers["Cache-Control"]       = "no-store"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    print(f"[serve_pdf] sid={sid} → {len(pdf_bytes)} bytes")
    return resp


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

    faiss_b64   = data.get("faiss_index")
    chunks      = data.get("chunks", [])
    chunk_pages = data.get("chunk_pages", [])

    if not faiss_b64 or not chunks:
        return jsonify({"error": "No search index. Re-upload the PDF."}), 400

    try:
        idx_bytes = base64.b64decode(faiss_b64)
        load_path = FAISS_TMP + ".load"
        with open(load_path, "wb") as f:
            f.write(idx_bytes)
        index_obj = faiss.read_index(load_path)

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
    # If you need to see errors, check the terminal output directly
    app.run(debug=False, port=5000)