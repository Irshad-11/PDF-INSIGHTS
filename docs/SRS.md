

# **Software Requirements Specification (SRS)**

**Project Name:** PDF Insights – Smart PDF Analyzer with OCR and Semantic Search
**Version:** 1.0.0
**Date:** 12 March 2026
**Prepared by:** Irshad Hossain
**Department:** Software Engineering, University of Frontier Technology, Bangladesh


## **1. Introduction**

### 1.1 Purpose

The purpose of **PDF Insights** is to provide an intelligent web-based system for analyzing PDF documents, offering both keyword-based and semantic search, mathematical equation extraction, LaTeX conversion, and transparency in processing. It targets university students, researchers, professors, data scientists, and academic institutions handling large PDF documents, research papers, and scanned books.

### 1.2 Scope

PDF Insights is a **session-based web application** that allows users to:

* Upload PDFs (up to 1000 pages, 50MB)
* Automatically detect scanned vs text-based PDFs
* Extract text using OCR
* Detect and convert mathematical equations to LaTeX
* Perform keyword and semantic search with similarity scoring
* View system transparency metrics and processing logs
* Export processed content as Markdown with LaTeX support

**Key Features:**

1. PDF Upload and Validation
2. Smart Analysis with OCR confidence metrics
3. Mathematical Equation Detection and LaTeX Conversion
4. Normal Keyword Search with Highlighting
5. Semantic Search using embeddings (SentenceTransformers + FAISS)
6. Export results in Markdown format
7. Session-based architecture with no permanent database



### 1.3 Definitions, Acronyms, and Abbreviations

| Term            | Description                                                |
| --------------- | ---------------------------------------------------------- |
| OCR             | Optical Character Recognition                              |
| LaTeX           | Typesetting system for mathematical equations              |
| FAISS           | Facebook AI Similarity Search                              |
| NLP             | Natural Language Processing                                |
| PyMuPDF         | Python library for PDF processing                          |
| Pix2Tex         | Pipeline for converting image-based math to LaTeX          |
| Markdown        | Lightweight markup language for text formatting            |
| Semantic Search | Search based on meaning rather than exact keyword matching |



### 1.4 References

1. IEEE Std 830-1998, “IEEE Recommended Practice for Software Requirements Specifications”
2. Tesseract OCR documentation: [https://github.com/tesseract-ocr/tesseract](https://github.com/tesseract-ocr/tesseract)
3. SentenceTransformers library: [https://www.sbert.net](https://www.sbert.net)
4. FAISS library: [https://github.com/facebookresearch/faiss](https://github.com/facebookresearch/faiss)
5. PyMuPDF documentation: [https://pymupdf.readthedocs.io](https://pymupdf.readthedocs.io)
6. Pix2Tex research: [https://github.com/lukas-blecher/LaTeX-OCR](https://github.com/lukas-blecher/LaTeX-OCR)



### 1.5 Overview

This document describes:

* Functional and non-functional requirements
* System actors and interactions
* Use cases
* Data and system architecture
* Versioning and traceability



## **2. Overall Description**

### 2.1 Product Perspective

PDF Insights is a **web-based client-server system**:

* **Frontend:** React.js + Tailwind CSS, responsive PDF viewer, search interface
* **Backend:** Flask REST API, Python 3.10, OCR and NLP pipelines
* **PDF Processing:** PyMuPDF for PDF parsing, Tesseract for OCR, Pix2Tex for math detection
* **Search:** SentenceTransformers embeddings + FAISS vector search
* **Export:** Markdown with LaTeX support

It is **standalone**, requires no database, and stores all user data temporarily in sessions.



### 2.2 Product Functions

| Module               | Functionality                                                                         |
| -------------------- | ------------------------------------------------------------------------------------- |
| PDF Upload           | Validate size, pages, and type; temporary session storage                             |
| Smart Analysis       | Detect scanned vs text pages, OCR confidence, equation pages                          |
| Math Detection       | Convert equations to LaTeX, store equation locations                                  |
| Normal Search        | Keyword-based search with highlighting                                                |
| Semantic Search      | Meaning-based search with similarity scores, top 10 results, "Load more" option       |
| Transparency Metrics | Display per-page processing details, OCR quality, warnings for low-confidence results |
| Export               | Generate Markdown file with LaTeX equations, header info, and timestamp               |



### 2.3 User Characteristics

| User Type                          | Skills / Needs                                                       |
| ---------------------------------- | -------------------------------------------------------------------- |
| University Student                 | Needs to quickly extract content and search academic PDFs            |
| Researcher / Professor             | Requires semantic search, LaTeX equation extraction, Markdown export |
| Data Scientist / Technical Analyst | Needs structured data from scanned PDFs and math-heavy documents     |



### 2.4 Constraints

* Maximum PDF size: 50 MB
* Maximum pages: 1000 (optimized for 500–700)
* Session-based architecture: no permanent storage
* Low CPU environment support
* Web browser access only (Chrome, Firefox, Edge recommended)



### 2.5 Assumptions and Dependencies

* All libraries and tools (Tesseract, SentenceTransformers, FAISS, PyMuPDF, Pix2Tex) are installed and functional
* User has a modern web browser
* Network latency is minimal for API requests
* LaTeX rendering is supported in exported Markdown viewers



## **3. Specific Requirements**

### 3.1 Functional Requirements

#### 3.1.1 PDF Upload

* Support drag-and-drop and file selection
* Validate file type and size
* Display warnings for large files

#### 3.1.2 Smart PDF Analysis

* Detect page types: text vs scanned
* Compute OCR confidence per page
* Highlight pages containing equations

#### 3.1.3 OCR & Equation Detection

* OCR text extraction using Tesseract
* Equation detection via Pix2Tex pipeline
* Convert math to LaTeX
* Store locations of extracted equations

#### 3.1.4 Normal Search

* Exact keyword matching
* Highlight matches in PDF viewer

#### 3.1.5 Semantic Search

* Compute sentence embeddings (SentenceTransformers)
* Store vectors in FAISS index
* Return top 10 matches per query
* Show PDF name, page number, and similarity score
* "Load more" functionality

#### 3.1.6 Transparency & Metrics

* Display per-page analysis and OCR quality
* Warnings if OCR confidence < 30%
* Track highlighted segments and user interactions

#### 3.1.7 Export

* Markdown export including LaTeX equations
* Header with PDF name, source, and timestamp



### 3.2 Non-functional Requirements

| Requirement     | Description                                                             |
| --------------- | ----------------------------------------------------------------------- |
| Performance     | Upload and analyze PDFs of 500 pages in under 2 minutes on standard CPU |
| Reliability     | Session-based storage ensures no data loss during session               |
| Usability       | Intuitive UI, modern design, responsive layout                          |
| Security        | No persistent data storage, temporary session isolation                 |
| Compatibility   | Works on Windows/Linux, modern browsers                                 |
| Maintainability | Modular OOP design in Java and Python, easy to extend                   |



### 3.3 System Actors

| Actor            | Description                                             | Interactions                                                      |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| User             | Uploads PDFs, performs searches, views results          | Upload PDF, toggle math detection, execute search, export results |
| System           | Performs analysis, OCR, math detection, semantic search | Analyze PDF, compute embeddings, return search results            |
| Admin (optional) | Monitors logs, system status                            | View session metrics, debug logs                                  |



### 3.4 Use Case Examples

**Use Case 1: Upload PDF**

* **Actor:** User
* **Precondition:** User opens landing page
* **Flow:**

  1. Selects file
  2. System validates file
  3. System stores PDF in session
  4. System returns page count and type analysis
* **Postcondition:** PDF ready for analysis

**Use Case 2: Semantic Search**

* **Actor:** User
* **Precondition:** PDF analyzed and indexed
* **Flow:**

  1. User enters query
  2. System computes embeddings
  3. FAISS returns top 10 matches
  4. User can load more results
* **Postcondition:** Relevant pages highlighted in PDF viewer

**Use Case 3: Export Markdown**

* **Actor:** User
* **Precondition:** PDF analyzed and math detection complete
* **Flow:**

  1. User clicks export
  2. System generates Markdown with LaTeX equations
  3. System downloads file
* **Postcondition:** User obtains Markdown file with extracted content



### 3.5 Versioning

| Version | Date          | Author         | Description                                                             |
| ------- | ------------- | -------------- | ----------------------------------------------------------------------- |
| 1.0.0   | 12 March 2026 | Irshad Hossain | Initial SRS draft, functional and non-functional requirements defined   |
| 1.1.0   | TBD           | Irshad Hossain | Add sequence diagrams, flowcharts, and more detailed use case scenarios |
| 1.2.0   | TBD           | Irshad Hossain | Add UI mockups, database/session schema, and testing plan               |
| 1.3.0   | TBD           | Irshad Hossain | Final SRS with validation, verification, and approval signatures        |



### 3.6 Diagrams (References)

* **Flowchart:** End-to-End PDF Processing
* **Flowchart:** Semantic Search Query & Highlighting
* **Sequence Diagram:** PDF Upload → Analysis → Search → Export

*(Diagrams to be included in full SRS PDF)*



### 3.7 Appendices

* User email: [irshadrisad11@gmail.com](mailto:irshadrisad11@gmail.com)
* GitHub: github.com/Irshad-11
* Course: Object Oriented Programming Sessional, PROG 112
* Project Date: 23 Feb 2026

