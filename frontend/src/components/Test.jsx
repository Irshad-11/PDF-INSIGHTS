import { useState, useEffect } from "react";

export default function Test() {

  // === STATES ===
  const [message, setMessage] = useState("");           // API 1
  const [uploadInfo, setUploadInfo] = useState(null);   // API 2
  const [query, setQuery] = useState("");               // search input
  const [searchResults, setSearchResults] = useState([]); 
  const [savedQueries, setSavedQueries] = useState([]); // localStorage

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // === FUNCTION 1: Fetch hello message ===
  const fetchMessage = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/hello`);
      const data = await res.json();
      setMessage(data.message);
    } catch (err) {
      console.error("Error fetching hello:", err);
    }
  };

  // === FUNCTION 2: Upload PDF (simulate) ===
  const uploadPDF = async (filename) => {
    try {
      const res = await fetch(`${backendUrl}/api/upload`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      setUploadInfo(data);
    } catch (err) {
      console.error("Upload error:", err);
    }
  };

  // === FUNCTION 3: Semantic search ===
  const performSearch = async () => {
    if (!query) return;
    try {
      const res = await fetch(`${backendUrl}/api/search`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      setSearchResults(data.results);

      // Save query to localStorage
      const stored = JSON.parse(localStorage.getItem("queries") || "[]");
      stored.push(query);
      localStorage.setItem("queries", JSON.stringify(stored));
      setSavedQueries(stored);

    } catch (err) {
      console.error("Search error:", err);
    }
  };

  // === FUNCTION 4: Load saved queries from localStorage ===
  const loadSavedQueries = () => {
    const stored = JSON.parse(localStorage.getItem("queries") || "[]");
    setSavedQueries(stored);
  };

  // === useEffect: fetch hello message on mount ===
  useEffect(() => {
    fetchMessage();
    loadSavedQueries();
  }, []);

  // === JSX ===
  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white font-sans">

      {/* API 1 */}
      <h1 className="text-2xl mb-4">{message}</h1>

      {/* API 2: Upload PDF */}
      <div className="mb-6">
        <button
          className="bg-cyan-500 hover:bg-cyan-600 px-4 py-2 rounded mr-4"
          onClick={() => uploadPDF("TestFile.pdf")}
        >
          Upload PDF
        </button>
        {uploadInfo && (
          <div className="mt-2 p-2 bg-gray-800 rounded">
            <p>Filename: {uploadInfo.filename}</p>
            <p>Pages: {uploadInfo.pages}</p>
            <p>Scanned Pages: {uploadInfo.scanned_pages}</p>
            <p>OCR Confidence: {uploadInfo.ocr_confidence}%</p>
          </div>
        )}
      </div>

      {/* API 3: Semantic Search */}
      <div className="mb-6">
        <input
          type="text"
          className="p-2 rounded text-black mr-2"
          placeholder="Search..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button
          className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded"
          onClick={performSearch}
        >
          Search
        </button>

        {searchResults.length > 0 && (
          <div className="mt-2 p-2 bg-gray-800 rounded">
            <h2 className="font-bold mb-1">Results:</h2>
            {searchResults.map((res, i) => (
              <p key={i}>Page {res.page}: {res.text}</p>
            ))}
          </div>
        )}
      </div>

      {/* LocalStorage Saved Queries */}
      <div>
        <h2 className="font-bold mb-2">Saved Queries:</h2>
        {savedQueries.length === 0 ? (
          <p>No saved queries</p>
        ) : (
          <ul>
            {savedQueries.map((q, i) => (
              <li key={i} className="mb-1 bg-gray-700 p-1 rounded">{q}</li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}