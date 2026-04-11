/**
 * ragService.js
 * Handles all RAG (Retrieval-Augmented Generation) logic:
 * - Document ingestion (PDF, DOCX, TXT) with OCR fallback
 * - Vector chunking and embedding
 * - Semantic similarity search
 * - Web/OSINT context fetching (DuckDuckGo, Wikipedia)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawn } from "child_process";
import * as cheerio from "cheerio";
import similarity from "cosine-similarity";
import { fromPath as pdf2picFromPath } from "pdf2pic";
import { embedText, chunkText } from "../utils/textUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requireCJS = createRequire(import.meta.url);

const TEMP_OCR_DIR = path.join(__dirname, "../temp_ocr");
if (!fs.existsSync(TEMP_OCR_DIR)) fs.mkdirSync(TEMP_OCR_DIR, { recursive: true });

// ─── Lazy-loaded optional dependencies ───────────────────────────────────────

let _pdfParse = null;
let _mammoth = null;

function getPdfParse() {
  if (_pdfParse) return _pdfParse;
  try {
    _pdfParse = requireCJS("pdf-parse/node").PDFParse;
    return _pdfParse;
  } catch {
    console.warn("⚠️ pdf-parse not available. PDF text extraction will fail.");
    return null;
  }
}

function getMammoth() {
  if (_mammoth) return _mammoth;
  try {
    const m = requireCJS("mammoth");
    _mammoth = m.default || m;
    return _mammoth;
  } catch {
    return null;
  }
}

// ─── Tesseract Detection ──────────────────────────────────────────────────────

import { spawnSync } from "child_process";

export function detectTesseractBinary() {
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const out = spawnSync(which, ["tesseract"], { encoding: "utf8" });
    if (out.status === 0 && out.stdout) {
      const lines = out.stdout.split(/\r?\n/).filter(Boolean);
      if (lines.length > 0) return lines[0].trim();
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Document Text Extraction ─────────────────────────────────────────────────

/**
 * Extract text from a .pdf file.
 * Falls back to Tesseract OCR on scanned PDFs.
 * @param {string} filePath - Absolute path to the PDF.
 * @param {string|null} tesseractBin - Path to tesseract binary, or null.
 * @returns {Promise<string>}
 */
export async function extractPdfText(filePath, tesseractBin = null) {
  const parser = getPdfParse();

  // 1. Try native text extraction
  if (parser) {
    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = await parser.parse(buffer);
      const text = (parsed && parsed.text) ? parsed.text.trim() : "";
      if (text) return text;
    } catch (e) {
      console.warn("pdf-parse extraction error:", e.message);
    }
  }

  // 2. Fallback: Image-based OCR via Tesseract
  if (!tesseractBin) {
    console.warn("❌ No Tesseract binary for OCR fallback.");
    return "";
  }

  console.log("⚠️ No text in PDF — falling back to Tesseract OCR...");
  const converter = pdf2picFromPath(filePath, {
    density: 150,
    saveFilename: `${Date.now()}-page`,
    savePath: TEMP_OCR_DIR,
    format: "png",
    width: 1200,
    height: 1600,
  });

  const PAGE_LIMIT = 3;
  let ocrFull = "";

  for (let p = 1; p <= PAGE_LIMIT; p++) {
    try {
      const result = await converter(p);
      const imgPath = result.path;
      if (!fs.existsSync(imgPath)) continue;

      await new Promise((resolve) => {
        const t = spawn(tesseractBin, [imgPath, "stdout", "-l", "eng", "--dpi", "300"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        t.stdout.on("data", (d) => (out += d.toString()));
        t.on("close", (code) => {
          try { fs.unlinkSync(imgPath); } catch { /* ignore */ }
          if (code === 0 && out.trim()) ocrFull += "\n" + out;
          resolve();
        });
        t.on("error", () => { try { fs.unlinkSync(imgPath); } catch { /* ignore */ } resolve(); });
      });
    } catch (ocrErr) {
      console.warn(`OCR failed for page ${p}:`, ocrErr.message);
    }
  }

  return ocrFull.trim();
}

/**
 * Extract text from a .docx file using mammoth.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function extractDocxText(filePath) {
  const mammoth = getMammoth();
  if (!mammoth) {
    console.warn("⚠️ mammoth not available — cannot parse .docx");
    return "";
  }
  try {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return (result && result.value) ? result.value.trim() : "";
  } catch (e) {
    console.warn("mammoth docx parse failed:", e.message);
    return "";
  }
}

/**
 * Extract plain text from a .txt file.
 * @param {string} filePath
 * @returns {string}
 */
export function extractTxtText(filePath) {
  return fs.readFileSync(filePath, "utf8").trim();
}

/**
 * Top-level document ingestion.
 * Dispatches to the correct extractor based on file extension.
 * @param {string} filePath
 * @param {string} ext - Lowercase extension (.pdf|.docx|.txt)
 * @param {string|null} tesseractBin
 * @returns {Promise<string>}
 */
export async function extractDocumentText(filePath, ext, tesseractBin = null) {
  if (ext === ".pdf") return extractPdfText(filePath, tesseractBin);
  if (ext === ".docx") return extractDocxText(filePath);
  if (ext === ".txt") return extractTxtText(filePath);
  throw new Error(`Unsupported file extension: ${ext}`);
}

// ─── Vector Indexing ──────────────────────────────────────────────────────────

/**
 * Chunk and embed document text into session's vectorChunks store.
 * @param {object} session - Session object (mutated in place).
 * @param {string} text - Extracted document text.
 * @param {string} sourceName - Display name for citation (e.g. filename).
 * @returns {Promise<{chunks: number}>}
 */
export async function indexDocumentChunks(session, text, sourceName) {
  const chunks = chunkText(text);
  if (!session.vectorChunks) session.vectorChunks = [];

  for (const chunk of chunks) {
    const vector = await embedText(chunk);
    session.vectorChunks.push({ text: chunk, vector, source: sourceName });
  }

  console.log(`✅ RAG: Indexed ${chunks.length} chunks for "${sourceName}".`);
  return { chunks: chunks.length };
}

/**
 * Semantic search over session's vectorChunks.
 * @param {Array} vectorChunks - Array of {text, vector, source}.
 * @param {string} query - Natural language query.
 * @param {number} topK - Number of top results to return.
 * @returns {Promise<Array<{text, vector, source, score}>>}
 */
export async function semanticSearch(vectorChunks, query, topK = 3) {
  if (!vectorChunks || vectorChunks.length === 0) return [];
  const queryVec = await embedText(query);
  const ranked = vectorChunks
    .map((chunk) => ({ ...chunk, score: similarity(queryVec, chunk.vector) }))
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, topK);
}

// ─── Web / OSINT Context ──────────────────────────────────────────────────────

const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Fetch readable text content from a URL.
 * Strips noise (scripts, nav, ads) and returns main body text.
 */
export async function fetchPageContent(url, maxChars = 3000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": WEB_UA },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, iframe, noscript, .sidebar, .menu, .ad, .cookie, .social, .breadcrumb").remove();
    const mainEl = $("article, main, .content, .post, #content, .entry-content, [role='main']").first();
    let text = mainEl.length ? mainEl.text() : $("body").text();
    return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  } catch (e) {
    console.warn(`fetchPageContent failed for ${url}:`, e.message);
    return "";
  }
}

/**
 * LLM-powered synthesis of raw OSINT data into an intelligence brief.
 * Requires a runModel callback.
 */
export async function synthesizeWebContext(query, content, runModel, utilityModel) {
  if (!content || content.length < 500) return content;
  console.log("🧠 OSINT: Synthesizing intelligence brief...");
  try {
    const synthesisPrompt = `You are a professional OSINT researcher. Below is raw search data for the query: "${query}".
Synthesize this data into a single HIGH-FIDELITY intelligence report.
- Merge overlapping information.
- Highlight key facts and dates.
- Cite sources using [Source X].
- Keep it objective and technical.

RAW DATA:
${content}`;
    let summary = "";
    await runModel(utilityModel, synthesisPrompt, (chunk) => { summary += chunk; });
    return summary.trim() || content;
  } catch (e) {
    console.warn("OSINT synthesis failed, returning raw context:", e.message);
    return content;
  }
}

/**
 * Parallel multi-source web search (DuckDuckGo + Wikipedia + HTML scrape).
 * @param {string} query
 * @param {function} runModel - Model runner callback for synthesis
 * @param {string} utilityModel - Model name for synthesis
 * @returns {Promise<string|null>}
 */
export async function getWebContext(query, runModel, utilityModel) {
  console.log(`🌐 OSINT: Initializing parallel multi-source search: "${query}"`);

  const searchTasks = [
    // DuckDuckGo Instant Answer
    (async () => {
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
        const res = await fetch(url, { headers: { "User-Agent": WEB_UA }, signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          if (data?.AbstractText) {
            console.log("  ✅ OSINT: Got DuckDuckGo summary");
            return `[DuckDuckGo Signal] ${data.AbstractText}${data.AbstractURL ? ` (Source: ${data.AbstractURL})` : ""}`;
          }
        }
      } catch { /* ignore */ }
      return null;
    })(),

    // Wikipedia Summary
    (async () => {
      try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, "_"))}`;
        const res = await fetch(url, { headers: { "User-Agent": WEB_UA }, signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          if (data?.extract) {
            console.log("  ✅ OSINT: Got Wikipedia signal");
            return `[Wikipedia Signal] ${data.extract}`;
          }
        }
      } catch { /* ignore */ }
      return null;
    })(),

    // HTML DuckDuckGo Scrape → Top Result Deep Fetch
    (async () => {
      try {
        const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const htmlRes = await fetch(htmlUrl, { headers: { "User-Agent": WEB_UA }, signal: AbortSignal.timeout(8000) });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const $ = cheerio.load(html);
          const searchResults = [];
          $(".result").each((i, el) => {
            if (i >= 5) return false;
            const titleEl = $(el).find("a.result__a");
            const title = titleEl.text().trim();
            const snippet = $(el).find(".result__snippet").text().trim();
            let href = titleEl.attr("href") || "";
            if (href.includes("uddg=")) {
              try { href = decodeURIComponent(href.split("uddg=")[1].split("&")[0]); } catch { /* ignore */ }
            }
            if (title && snippet) searchResults.push({ title, snippet, url: href });
          });

          for (let i = 0; i < Math.min(3, searchResults.length); i++) {
            const pageText = await fetchPageContent(searchResults[i].url, 2500);
            if (pageText.length > 200) {
              console.log(`  ✅ OSINT: Scraped depth content from source [${i + 1}]`);
              return `[Deep Context: ${searchResults[i].url}]\n${pageText}`;
            }
          }
        }
      } catch { /* ignore */ }
      return null;
    })(),
  ];

  const results = (await Promise.all(searchTasks)).filter(Boolean);

  if (results.length === 0) {
    console.warn("  ❌ OSINT: All search strategies failed.");
    return null;
  }

  const rawContext = results.join("\n\n---\n\n");
  return synthesizeWebContext(query, rawContext, runModel, utilityModel);
}
