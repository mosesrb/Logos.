import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { embedText } from "../utils/textUtils.js";
import { getBlipCaption } from "../utils/blip.js";
import similarity from "cosine-similarity";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHATS_DIR = path.join(__dirname, "../chats");
const DATA_DIR = path.join(__dirname, "../data");
const OUTPUT_DIR = path.join(__dirname, "../output");

import { mineConversation, searchPalace, toWingSlug } from "./mempalaceBridge.js";

const PERSONA_MEMORY_DIR = process.env.PERSONA_MEMORY_DIR || path.join(DATA_DIR, "persona_memory");
const PERSONA_MEMORY_PERSONAS_DIR = path.join(PERSONA_MEMORY_DIR, "personas");
const GLOBAL_IMAGE_INDEX_PATH = path.join(PERSONA_MEMORY_DIR, "global_index.json");
const IDENTITY_MEMORY_PATH = path.join(DATA_DIR, "identity_memory.json");
const IMAGE_MEMORY_PATH = path.join(CHATS_DIR, "image_memory.json");

// Keep globalMemory as an empty stub so anything else accessing it doesn't crash
export let globalMemory = [];

const mempalaceBuffer = {};

export async function indexEpisodicMemory(sessionId, role, text, mood = null, personaId = "assistant") {
  if (!text || text.trim().length < 10) return;
  console.log(`🧠 MEMORY_INDEX: [${personaId}] role=${role} len=${text.length}`);
  
  const slug = toWingSlug(personaId);
  if (!mempalaceBuffer[slug]) mempalaceBuffer[slug] = [];
  
  const formattedRole = role === "user" ? "User" : "Assistant";
  mempalaceBuffer[slug].push(`${formattedRole}: ${text}`);
  
  // To keep latency low, we buffer turns and flush them to MemPalace every 4 messages
  if (mempalaceBuffer[slug].length >= 4) {
    const convoText = mempalaceBuffer[slug].join("\n");
    mempalaceBuffer[slug] = []; // Clear buffer immediately
    
    // Fire and forget
    mineConversation(convoText, slug, "Nexus").then(res => {
      if (res.ok) console.log(`🏛️ MEMPALACE: Indexed turns into wing [${slug}]`);
      else console.error(`🏛️ MEMPALACE Error for [${slug}]:`, res.error);
    });
  }
}

export async function queryGlobalMemory(queryText, topK = 3, currentMood = null, personaId = "assistant") {
  if (!queryText) return [];
  
  const slug = toWingSlug(personaId);
  try {
    const res = await searchPalace(queryText, slug, topK);
    if (!res.ok) {
       console.warn("🏛️ MEMPALACE Search failed:", res.error);
       return [];
    }
    return res.results.map(r => `[PALACE_RECALL] ${r}`);
  } catch (e) {
    console.warn("🏛️ MEMPALACE Exception:", e.message);
    return [];
  }
}

let imageMemory = [];
export function rebuildImageMemoryIndex() {
  imageMemory = [];
  if (!fs.existsSync(PERSONA_MEMORY_PERSONAS_DIR)) return;
  const personas = fs.readdirSync(PERSONA_MEMORY_PERSONAS_DIR);
  for (const pId of personas) {
    const dir = path.join(PERSONA_MEMORY_PERSONAS_DIR, pId);
    const metaPath = path.join(dir, "metadata.json");
    const embPath = path.join(dir, "embeddings.json");
    if (fs.existsSync(metaPath) && fs.existsSync(embPath)) {
      try {
        const metas = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const embs = JSON.parse(fs.readFileSync(embPath, "utf8"));
        for (const meta of metas) {
          const emb = embs.find(e => e.image_id === meta.image_id);
          const fullPath = path.join(dir, "images", meta.file_name);
          if (fs.existsSync(fullPath)) {
            imageMemory.push({
              id: meta.image_id, path: fullPath, url: meta.url,
              tags: meta.tags?.join(", "), prompt: meta.description,
              vector: emb ? emb.vector : null, personaId: meta.persona || pId,
              clarity: meta.clarity || 0.8, timestamp: new Date(meta.created_at).getTime()
            });
          }
        }
      } catch (e) {
        console.warn(`⚠️ PERSONA_MEMORY: Failed to scan memory for ${pId}:`, e.message);
      }
    }
  }
  console.log(`🧠 PERSONA_MEMORY: Index rebuilt from disk. Total images: ${imageMemory.length}`);
}

export function getPersonaMemoryDir(personaId) {
  const safeId = (personaId || "assistant").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(PERSONA_MEMORY_PERSONAS_DIR, safeId);
}

export function initializePersonaMemory(personaId) {
  const dir = getPersonaMemoryDir(personaId);
  const imagesDir = path.join(dir, "images");
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const metaPath = path.join(dir, "metadata.json");
  if (!fs.existsSync(metaPath)) fs.writeFileSync(metaPath, "[]", "utf8");
  const embPath = path.join(dir, "embeddings.json");
  if (!fs.existsSync(embPath)) fs.writeFileSync(embPath, "[]", "utf8");
  console.log(`🧠 PERSONA_MEMORY: Initialized structure for persona "${personaId}"`);
}

function loadPersonaMetadata(personaId) {
  const metaPath = path.join(getPersonaMemoryDir(personaId), "metadata.json");
  if (!fs.existsSync(metaPath)) return [];
  try { return JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch(e) { return []; }
}
function savePersonaMetadata(personaId, entries) {
  const dir = getPersonaMemoryDir(personaId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(entries, null, 2), "utf8");
}
function loadPersonaEmbeddings(personaId) {
  const embPath = path.join(getPersonaMemoryDir(personaId), "embeddings.json");
  if (!fs.existsSync(embPath)) return [];
  try { return JSON.parse(fs.readFileSync(embPath, "utf8")); } catch(e) { return []; }
}
function savePersonaEmbeddings(personaId, entries) {
  const dir = getPersonaMemoryDir(personaId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "embeddings.json"), JSON.stringify(entries, null, 2), "utf8");
}
function loadGlobalImageIndex() {
  try { return JSON.parse(fs.readFileSync(GLOBAL_IMAGE_INDEX_PATH, "utf8")); } catch(e) { return []; }
}
function saveGlobalImageIndex(entries) {
  fs.writeFileSync(GLOBAL_IMAGE_INDEX_PATH, JSON.stringify(entries, null, 2), "utf8");
}
function computeFileHash(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(buf).digest("hex");
  } catch(e) { return null; }
}

const personaLocks = {};
async function acquireLock(personaId) {
  if (!personaLocks[personaId]) personaLocks[personaId] = Promise.resolve();
  const currentLock = personaLocks[personaId];
  let resolveLock;
  const nextLock = new Promise(res => { resolveLock = res; });
  personaLocks[personaId] = nextLock;
  await currentLock;
  return resolveLock;
}

export async function indexImageMemory(deps, sessionId, tags, prompt, filePath, personaId) {
  const { UTILITY_MODEL, runModel, getPersonas } = deps;
  let resolvedPersonaId = personaId || "assistant";
  const releaseLock = await acquireLock(resolvedPersonaId);
  try {
    const clarityScore = 1.0; 
    if (clarityScore < 0.6) {
      console.log(`👁️ VISUAL_MEMORY: Image rejected due to low clarity (${clarityScore.toFixed(2)})`);
      return;
    }
    const slug = resolvedPersonaId.toLowerCase().replace(/[^a-z0-9]/g, "");
    const foundPersona = getPersonas().find(p => {
      const pNameSlug = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return pNameSlug === slug;
    });
    if (foundPersona) {
      console.log(`🧠 PERSONA_MEMORY: Resolved slug "${resolvedPersonaId}" to persona-id "${foundPersona.id}"`);
      resolvedPersonaId = foundPersona.id;
    }
    const personaImagesDir = path.join(getPersonaMemoryDir(resolvedPersonaId), "images");
    fs.mkdirSync(personaImagesDir, { recursive: true });
    let sourceDiskPath = null;
    if (filePath && !filePath.startsWith("/output/")) {
      sourceDiskPath = filePath;
    } else if (filePath && filePath.startsWith("/output/")) {
      sourceDiskPath = path.join(OUTPUT_DIR, path.basename(filePath));
    }
    const existingMeta = loadPersonaMetadata(resolvedPersonaId);
    let fileHash = null;
    if (sourceDiskPath) {
      fileHash = computeFileHash(sourceDiskPath);
      if (fileHash && existingMeta.some(m => m.hash === fileHash)) {
        console.log(`🔁 PERSONA_MEMORY: Duplicate detected [hash=${fileHash.slice(0,8)}]. Skipping.`);
        return;
      }
    }
    const filename = path.basename(filePath || `img_${Date.now()}.png`);
    const destImagePath = path.join(personaImagesDir, filename);
    const persistentUrl = `/persona-memory/${resolvedPersonaId}/image/${filename}`;
    if (sourceDiskPath && fs.existsSync(sourceDiskPath)) {
      if (!fs.existsSync(destImagePath)) {
        try { fs.copyFileSync(sourceDiskPath, destImagePath); } catch(err) { }
      }
    }
    let blipCaption = "";
    try {
      blipCaption = await getBlipCaption(destImagePath || sourceDiskPath);
    } catch (e) {
      try {
        const selfCaptionPrompt = `The AI generated an image with this prompt: "${prompt}". Create a one-sentence descriptive caption of what this image likely looks like for a visual memory system. Focus on subjects and colors. Output ONLY the caption string.`;
        blipCaption = await runModel(UTILITY_MODEL, selfCaptionPrompt);
      } catch (innerE) { blipCaption = prompt || "No description provided."; }
    }
    let refinedTags = tags, refinedDescription = blipCaption;
    const wordCount = (blipCaption || "").split(/\s+/).length;
    if (wordCount <= 15 || process.env.FORCE_REFINEMENT) {
      try {
        const refinementPrompt = `IMAGE CAPTION: "${blipCaption}"\nUSER_PROMPT: "${prompt || 'N/A'}"\nTask: Convert the caption into a compact JSON object.\nRules:\n- Output ONLY valid JSON.\n- No preamble, no explanation, no markdown blocks.\n- JSON structure: {"tags": "comma, separated, tags", "description": "concise description"}`;
        const response = await runModel(UTILITY_MODEL, refinementPrompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const cleanedJsonStr = jsonMatch ? jsonMatch[0] : response;
        const refined = JSON.parse(cleanedJsonStr);
        if (refined.tags) refinedTags = Array.isArray(refined.tags) ? refined.tags.join(", ") : String(refined.tags);
        if (refined.description) refinedDescription = refined.description;
      } catch (e) { }
    }
    const vector = await embedText(refinedTags + " " + refinedDescription);
    const imageId = `img_${Date.now()}`;
    const embeddingId = `emb_${Date.now()}`;
    const metaEntry = { image_id: imageId, file_name: filename, persona: resolvedPersonaId, tags: refinedTags.split(",").map(t => t.trim()), description: refinedDescription, blip_caption: blipCaption, source_prompt: prompt, source: sessionId === "manual" ? "manual" : "generated", created_at: new Date().toISOString(), hash: fileHash, embedding_id: embeddingId, url: persistentUrl };
    existingMeta.push(metaEntry); savePersonaMetadata(resolvedPersonaId, existingMeta);
    const existingEmbs = loadPersonaEmbeddings(resolvedPersonaId);
    existingEmbs.push({ embedding_id: embeddingId, image_id: imageId, vector }); savePersonaEmbeddings(resolvedPersonaId, existingEmbs);
    const globalIndex = loadGlobalImageIndex(); globalIndex.push({ image_id: imageId, persona: resolvedPersonaId, file_name: filename, url: persistentUrl, created_at: metaEntry.created_at }); saveGlobalImageIndex(globalIndex);
    imageMemory.push({ id: imageId, path: destImagePath && fs.existsSync(destImagePath) ? destImagePath : (sourceDiskPath || filePath), url: persistentUrl, tags: refinedTags, prompt: refinedDescription, vector, personaId: resolvedPersonaId, clarity: clarityScore, sessionId, timestamp: Date.now() });
    if (imageMemory.length > 500) imageMemory.shift();
    return persistentUrl;
  } finally { releaseLock(); }
}

export async function queryImageMemory(queryText, currentPersonaId, topK = 3) {
  if (!queryText || imageMemory.length === 0) return [];
  try {
    const queryVector = await embedText(queryText);
    const now = Date.now();
    const candidates = imageMemory.filter(img => !currentPersonaId || img.personaId === currentPersonaId).filter(img => fs.existsSync(img.path)).map(img => {
        const sim = (img.vector) ? similarity(queryVector, img.vector) : 0;
        const daysOld = (now - (img.timestamp || now)) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0, 1 - (daysOld / 30));
        const finalScore = (0.6 * sim) + (0.2 * recencyScore) + (0.2 * (img.clarity || 0.8));
        return { ...img, score: finalScore, sim };
      }).filter(res => res.sim > 0.3).sort((a, b) => b.score - a.score);
    const selected = [];
    for (const cand of candidates) {
      if (selected.length >= topK) break;
      const isTooSimilar = selected.some(prev => similarity(cand.vector, prev.vector) > 0.92);
      if (!isTooSimilar) selected.push(cand);
    }
    return selected;
  } catch (e) { return []; }
}

let identityMemory = [];
if (fs.existsSync(IDENTITY_MEMORY_PATH)) {
  try { identityMemory = JSON.parse(fs.readFileSync(IDENTITY_MEMORY_PATH, "utf8")); } catch(e) {}
} else {
  fs.writeFileSync(IDENTITY_MEMORY_PATH, "[]", "utf8");
}

export function resolveIdentity(targetName) {
  if (!targetName || targetName === "null" || targetName.toLowerCase() === "previous") return null;
  const match = identityMemory.find(id => id.name.toLowerCase().includes(targetName.toLowerCase()));
  if (match) {
    match.usage_count += 1; match.last_used = Date.now();
    fs.writeFileSync(IDENTITY_MEMORY_PATH, JSON.stringify(identityMemory, null, 2), "utf8");
    return match;
  }
  return null;
}

export function createOrUpdateIdentity(targetName, imagePath) {
  if (!targetName || targetName === "null" || targetName.toLowerCase() === "previous") return null;
  let match = identityMemory.find(id => id.name.toLowerCase() === targetName.toLowerCase());
  if (match) {
    match.reference_images.push(imagePath);
    if (match.reference_images.length > 3) match.reference_images.shift(); 
    match.usage_count += 1; match.last_used = Date.now();
  } else {
    match = { id: `char_${Date.now()}`, name: targetName, reference_images: [imagePath], tags: [], created_at: Date.now(), last_used: Date.now(), usage_count: 1 };
    identityMemory.push(match);
  }
  fs.writeFileSync(IDENTITY_MEMORY_PATH, JSON.stringify(identityMemory, null, 2), "utf8");
  return match;
}

export function scanPersonaReferences(identityName) {
  if (!identityName) return [];
  const personaDir = path.join(getPersonaMemoryDir(identityName), "images");
  if (!fs.existsSync(personaDir)) return [];
  const allowedExts = [".png", ".jpg", ".jpeg", ".webp"];
  return fs.readdirSync(personaDir).filter(f => allowedExts.includes(path.extname(f).toLowerCase())).map(f => path.join(personaDir, f)).sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime).slice(0, 2);
}
