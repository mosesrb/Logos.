import { getSession, getPersonas, getPersona, getRelationships, getRelationship, syncSession, syncPersona, syncMessage, syncRelationship, runQuery } from "../services/dbService.js";
import path from "path";
import fs from "fs";

export function setupRagRoutes(app, context) {
  const {
    upload,
    ensureSession,
    TESSERACT_BIN,
    extractDocumentText,
    indexDocumentChunks,
    saveSessionToDisk
  } = context;

  app.post("/api/upload/:sessionId", upload.single("file"), async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!req.file) return res.status(400).json({ error: "no file uploaded" });

    const s = await (await ensureSessionAsync(sessionId));
    const filePath = req.file.path;
    const originalName = req.file.originalname || req.file.filename;
    const ext = path.extname(originalName).toLowerCase();
    console.log(`📄 Uploaded: ${originalName} -> ${filePath}`);

    const SUPPORTED_EXTS = [".pdf", ".docx", ".txt"];
    if (!SUPPORTED_EXTS.includes(ext)) {
      fs.unlink(filePath, () => {});
      return res.status(400).json({ error: "Unsupported file type for RAG upload" });
    }

    try {
      const extractedText = await extractDocumentText(filePath, ext, TESSERACT_BIN);

      if (!extractedText?.trim()) {
        console.warn("⚠️ No textual content extracted from upload (even after OCR).");
        fs.unlink(filePath, () => {});
        return res.status(400).json({ error: "No textual content extracted" });
      }

      const separator = `\n\n--- Uploaded: ${originalName} @ ${new Date().toISOString()} ---\n\n`;
      s.ragData = (s.ragData || "") + separator + extractedText;

      console.log(`🚀 Indexing ${originalName} for vector search...`);
      const { chunks } = await indexDocumentChunks(s, extractedText, originalName);

      if (!s.ragFiles) s.ragFiles = [];
      s.ragFiles.push({
        name: originalName,
        diskName: req.file.filename,
        length: extractedText.length,
        chunks,
        uploadedAt: new Date().toISOString(),
      });

      await saveSessionToDisk(s);
      res.json({ success: true, length: extractedText.length, chunks });
    } catch (err) {
      console.error("Upload processing failed:", err.message);
      fs.unlink(filePath, () => {});
      res.status(500).json({ error: "Failed to process uploaded file" });
    }
  });

  // Debug: get RAG for session
  app.get("/api/rag/:sessionId", async (req, res) => {
    const s = await (await ensureSessionAsync(req.params.sessionId));
    if (!s) return res.status(404).json({ error: "session not found" });
    res.json({ ragLength: s.ragData?.length || 0, snippet: (s.ragData || "").slice(0, 1000), files: s.ragFiles || [] });
  });
}
