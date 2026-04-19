/**
 * imageInboxWatcher.js — Phase 13
 * Watches backend/data/persona_memory/inbox/ for manually dropped images.
 * Parses persona slug from filename pattern: {persona}_{description}.ext
 * Falls back to "assistant" if no slug is detected.
 */

import fs from "fs";
import path from "path";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * Parse persona slug from filename.
 * Pattern: personaSlug_anything.ext → returns "personaSlug"
 * Otherwise returns "assistant"
 */
function parsePersonaFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  // Part 2 Spec: persona__description.png
  const separator = "__";
  const sepIdx = base.indexOf(separator);
  if (sepIdx > 0) {
    const candidate = base.slice(0, sepIdx).toLowerCase();
    // Only treat as persona slug if it's a reasonable identifier (3-30 chars, alphanum/_)
    if (/^[a-zA-Z0-9_-]{3,30}$/.test(candidate)) {
      return candidate;
    }
  }
  return "assistant";
}

/**
 * Start watching the inbox directory.
 * @param {string} inboxDir - Absolute path to the inbox folder
 * @param {Function} indexImageMemory - The upgraded indexImageMemory function from server.js
 */
export function startInboxWatcher(inboxDir, indexImageMemory) {
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  console.log(`📥 INBOX_WATCHER: Watching ${inboxDir} for manual image drops...`);

  // Track recently processed files to prevent double-firing
  const recentlyProcessed = new Set();

  fs.watch(inboxDir, { persistent: false }, async (eventType, filename) => {
    if (!filename) return;
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return;

    const fullPath = path.join(inboxDir, filename);

    // Debounce: skip if we just processed this file
    if (recentlyProcessed.has(filename)) return;
    recentlyProcessed.add(filename);
    setTimeout(() => recentlyProcessed.delete(filename), 5000);

    // Wait briefly for write to complete
    await new Promise(r => setTimeout(r, 500));

    if (!fs.existsSync(fullPath)) return;

    const personaId = parsePersonaFromFilename(filename);
    console.log(`📥 INBOX_WATCHER: Detected "${filename}" → persona="${personaId}"`);

    try {
      await indexImageMemory(
        "manual",
        "manual, uploaded, inbox",
        filename,   // prompt = filename as base description
        fullPath,   // filePath = absolute path
        personaId
      );
      
      // Part 2 Phase 7: Move processed files to prevent infinite loop
      const processedDir = path.join(inboxDir, "processed");
      if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
      const destPath = path.join(processedDir, filename);
      fs.renameSync(fullPath, destPath);
      
      console.log(`✅ INBOX_WATCHER: Successfully indexed and moved "${filename}" to processed/`);
    } catch (e) {
      console.error(`❌ INBOX_WATCHER: Failed to index "${filename}":`, e.message);
    }
  });
}
