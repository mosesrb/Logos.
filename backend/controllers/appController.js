import { getSession, getPersonas, getPersona, getRelationships, getRelationship, syncSession, syncPersona, syncMessage, syncRelationship, runQuery } from "../services/dbService.js";
import fs from "fs";
import path from "path";

import { getMoodLabel } from "../ai/moods.js";
import { loadUserPersona, saveUserPersona } from "../ai/userPersonaStore.js";
import { TRAIT_KEYS, defaultTraits } from "../ai/personaTraits.js";
import multer from "multer";
import {
  getPersonaMemoryDir,
  indexImageMemory,
  initializePersonaMemory,
  loadPersonaMetadata,
} from "../services/memoryService.js";
import { chunkText, embedText } from "../utils/textUtils.js";
import { resolveSafePath } from "../utils/pathResolver.js";

import { getQuery } from "../services/dbService.js";

export function setupAppRoutes(app, context) {
  const {
    UTILITY_MODEL,
    runModel,
    sessions,
    personas,
    relationships,
    scenarios,
    addLog,
    saveSessionToDisk,
    savePersonas,
    ensureSession,
    CHATS_DIR,
    PERSONAS_DIR,
    DATA_DIR,
    UPLOADS_DIR,
    OUTPUT_DIR,
    PERSONA_INBOX_DIR,
    GLOBAL_IMAGE_INDEX_PATH,
    generateViaComfyUI,
    saveScenarios,
    SCENARIOS_PATH
  } = context;
  const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

  function getSessionUploadPath(sessionId, ...segments) {
  if (typeof sessionId !== "string" || !SAFE_SESSION_ID.test(sessionId)) {
    throw new Error("Invalid session ID");
  }
  const sessionDir = path.resolve(UPLOADS_DIR, sessionId);
  const requestedFile = path.join(...segments);
  return resolveSafePath(sessionDir, requestedFile);
}
// ------------------ SESSION CRUD ------------------
app.get("/api/session/:sessionId/files", async (req, res) => {
  const s = await (await ensureSession(req.params.sessionId));
  res.json(s.ragFiles || []);
});

app.get("/api/session/:sessionId/logs", async (req, res) => {
  try {
    const s = await ensureSession(req.params.sessionId);
    res.json(s.logs || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE a file from session
app.delete("/api/session/:sessionId/file/:diskName", async (req, res) => {
  const { sessionId, diskName } = req.params;

  try {
    const filePath = getSessionUploadPath(sessionId, diskName);
    const s = await (await ensureSession(sessionId));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // Update metadata (filter by diskName which is unique)
    s.ragFiles = (s.ragFiles || []).filter(f => f.diskName !== diskName);
    
    await saveSessionToDisk(s);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "failed to delete file" });
  }
});

// GET agent generated files
app.get("/api/session/:sessionId/agent-files", async (req, res) => {
  try {
    const agentDir = getSessionUploadPath(req.params.sessionId, "agent_files");
    if (!fs.existsSync(agentDir)) return res.json([]);
    const files = fs.readdirSync(agentDir);
    // Return basic stat properties as well
    const filesMeta = files.map(f => {
      const sp = path.join(agentDir, f);
      const st = fs.statSync(sp);
      return { name: f, size: st.size, createdAt: st.birthtime };
    });
    res.json(filesMeta);
  } catch (e) {
    res.status(500).json({ error: "Failed to read agent files" });
  }
});

// GET agent file raw content
app.get("/api/session/:sessionId/agent-files/:filename/content", async (req, res) => {
  try {
    const filePath = getSessionUploadPath(req.params.sessionId, "agent_files", req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    const content = fs.readFileSync(filePath, "utf8");
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: "Failed to read file" });
  }
});

// Download agent file
app.get("/api/session/:sessionId/agent-files/:filename/download", async (req, res) => {
  try {
    const filePath = getSessionUploadPath(req.params.sessionId, "agent_files", req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).send("File not found");
    res.download(filePath, req.params.filename);
  } catch (e) {
    res.status(500).send("Failed to download file");
  }
});


// ------------------ AUTO-RENAME ENDPOINT ------------------
app.post("/api/chat/action/generate-title", async (req, res) => {
  const { prompt, model = UTILITY_MODEL } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    let title = "";
    await runModel(model, prompt, (chunk) => {
      title += chunk;
    }, [], null, { skipRouting: true });
    res.json({ title: title.trim().replace(/["']/g, "").slice(0, 40) });
  } catch (e) {
    fs.promises.appendFile('error_log.txt', new Date().toISOString() + ' Generate Title Error: ' + e.stack + '\n').catch(console.error);
    res.status(500).json({ error: e.message });
  }
});

// (Models and Stats endpoints extracted to controllers/modelsController.js)

// ------------------ SHADOW MEMORY (Log Injection) ------------------
app.post("/api/session/:sessionId/inject", async (req, res) => {
  const { sessionId } = req.params;
  const { text, source = "Manual Pin" } = req.body || {};
  if (!text) return res.status(400).json({ error: "Missing text to inject" });

  const s = await (await ensureSession(sessionId));
  try {
    console.log(`📌 Injecting log into Shadow Memory for ${sessionId}...`);
    const chunks = chunkText(text, 500, 100); // Smaller chunks for logs
    if (!s.vectorChunks) s.vectorChunks = [];

    for (const chunk of chunks) {
      const vector = await embedText(chunk);
      s.vectorChunks.push({ text: chunk, vector, source: `Memory: ${source}` });
    }
    await saveSessionToDisk(s);
    res.json({ success: true, count: chunks.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ------------------ PERSONA CRUD ------------------
// GET all personas
app.get("/api/persona", async (req, res) => {
  try {
    const dbPersonas = await getQuery("SELECT * FROM Personas");
    const merged = dbPersonas.map(p => {
      let meta = {};
      try { meta = JSON.parse(p.metadata || "{}"); } catch(e) {}
      return {
        ...p,
        ...meta,
        updatedAt: p.updated_at
      };
    });
    // Update memory cache for legacy stability
    personas.length = 0;
    personas.push(...merged);
    res.json(personas);
  } catch (e) {
    console.error("?? API_DB_PERSONA_FAILED:", e.message);
    res.json(personas); // Fallback to memory
  }
});

// GET all scenarios
app.get("/api/scenarios", async (req, res) => {
  res.json(scenarios);
});

// Create/Update Scenario
app.post("/api/scenarios", async (req, res) => {
  const { id, name, description, initial_prompt, participant_roles, world_rules } = req.body;
  
  if (!name || !description) return res.status(400).json({ error: "Missing name or description" });

  const existingIdx = scenarios.findIndex(s => s.id === id);
  const newScenario = {
    id: id || `scenario-${Date.now()}`,
    name,
    description,
    initial_prompt,
    participant_roles: participant_roles || [],
    world_rules: world_rules || [],
    model_preference: req.body?.model_preference || null  // T7: Scenario-driven model routing
  };

  if (existingIdx >= 0) {
    scenarios[existingIdx] = newScenario;
  } else {
    scenarios.push(newScenario);
  }

  try {
      saveScenarios();
    res.json(newScenario);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});




// Delete Scenario
app.delete("/api/scenarios/:id", async (req, res) => {
  const { id } = req.params;
  const filtered = scenarios.filter(s => s.id !== id);
  if (filtered.length === scenarios.length) return res.status(404).json({ error: "Scenario not found" });

  try {
    scenarios.length = 0;
    scenarios.push(...filtered);
    saveScenarios();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete scenario" });
  }
});

// GET single persona by id
app.get("/api/persona/:id", async (req, res) => {
  const found = (await getPersonas()).find(p => p.id === req.params.id);
  if (!found) return res.status(404).json({ error: "Persona not found" });
  res.json(found);
});

// POST create persona
app.post("/api/persona", async (req, res) => {
  const { name, system_prompt, goal, core_expertise, personality_style, quirks, rules, temperature, top_p, traits, imageGeneration, imageRetrieval, availableModes } = req.body || {};
  if (!name || !system_prompt) {
    return res.status(400).json({ error: "name and system_prompt are required" });
  }
  const now = new Date().toISOString();
  const newPersona = {
    id: `persona-${Date.now()}`,
    name: name?.trim() || "Unnamed Persona",
    system_prompt: system_prompt?.trim() || "",
    goal: goal?.trim() || "",
    core_expertise: core_expertise?.trim() || "",
    personality_style: personality_style?.trim() || "",
    quirks: quirks?.trim() || "",
    rules: Array.isArray(rules) ? rules : [],
    traits: traits || { ...defaultTraits },
    temperature: typeof temperature === "number" ? temperature : 0.7,
    top_p: typeof top_p === "number" ? top_p : 0.9,
    model: req.body?.model || "",
    voice: req.body?.voice || "",
    imageGeneration: imageGeneration !== false,
    imageRetrieval: imageRetrieval !== false,
    availableModes: Array.isArray(availableModes) ? availableModes : ["Normal", "Agent", "Parallel", "Debate", "Collaborate", "Pipeline", "Scenario"],
    createdAt: now,
    updatedAt: now,
  };
  personas.push(newPersona);
  savePersonas(personas);
  
  // Phase 1: Initialize memory structure
  initializePersonaMemory(newPersona.id);

  console.log(`🎭 PERSONA: Created "${newPersona.name}" [${newPersona.id}]`);
  res.status(201).json(newPersona);
});

// PUT update persona
app.put("/api/persona/:id", async (req, res) => {
  const idx = (await getPersonas()).findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Persona not found" });
  const { name, system_prompt, goal, core_expertise, personality_style, quirks, rules, temperature, top_p, traits, imageGeneration, imageRetrieval, availableModes } = req.body || {};
  const existing = personas[idx];
  const updatedPersona = {
    ...existing,
    ...req.body,
    id: existing.id, // Protect ID
    createdAt: existing.createdAt, // Protect creation date
    updatedAt: new Date().toISOString(),
    // Explicitly handle fields that might be missing or need sanitization
    name: name?.trim() ?? existing.name,
    system_prompt: system_prompt?.trim() ?? existing.system_prompt,
    goal: goal?.trim() ?? existing.goal,
    core_expertise: core_expertise?.trim() ?? existing.core_expertise,
    personality_style: personality_style?.trim() ?? existing.personality_style,
    quirks: quirks?.trim() ?? existing.quirks,
    rules: Array.isArray(rules) ? rules : existing.rules,
    traits: traits ?? existing.traits ?? { ...defaultTraits },
    imageGeneration: typeof imageGeneration === "boolean" ? imageGeneration : (existing.imageGeneration !== false),
    imageRetrieval: typeof imageRetrieval === "boolean" ? imageRetrieval : (existing.imageRetrieval !== false),
    availableModes: Array.isArray(availableModes) ? availableModes : (existing.availableModes || ["Normal", "Agent", "Parallel", "Debate", "Collaborate", "Pipeline", "Scenario"]),
  };
  
  personas[idx] = updatedPersona;
  savePersonas(personas);
  console.log(`🎭 PERSONA: Updated "${personas[idx].name}" [${req.params.id}]`);
  res.json(personas[idx]);
});

// DELETE persona
app.delete("/api/persona/:id", async (req, res) => {
  const idx = (await getPersonas()).findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Persona not found" });
  const [removed] = personas.splice(idx, 1);
  savePersonas(personas);
  console.log(`🎭 PERSONA: Deleted "${removed.name}" [${req.params.id}]`);
  res.json({ success: true, id: removed.id });
});

// ---------- PHASE 14: User Persona API ----------
app.get("/api/user/persona", async (req, res) => {
  res.json(loadUserPersona());
});

app.post("/api/user/persona", async (req, res) => {
  const success = saveUserPersona(req.body);
  if (success) res.json({ success: true });
  else res.status(500).json({ error: "Failed to save user profile" });
});

// ---------- PHASE 13: Persona Memory API Endpoints ----------

// GET /api/persona-memory/:personaId — Return persona's image metadata entries
app.get("/api/persona-memory/:personaId", async (req, res) => {
  const { personaId } = req.params;
  try {
    const entries = loadPersonaMetadata(personaId);
    res.json({ personaId, count: entries.length, entries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /persona-memory/:personaId/image/:filename — Serve the actual image
app.get("/persona-memory/:personaId/image/:filename", async (req, res) => {
  const { personaId, filename } = req.params;
  const dir = getPersonaMemoryDir(personaId);
  const filePath = path.join(dir, "images", filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Fallback: check global output folder if not in persona folder yet
    const fallbackPath = path.join(OUTPUT_DIR, filename);
    if (fs.existsSync(fallbackPath)) {
      res.sendFile(fallbackPath);
    } else {
      res.status(404).send("Image not found");
    }
  }
});

// GET /api/persona-memory/global — Search across all persona memories
app.get("/api/persona-memory/global", async (req, res) => {
  const { query } = req.query;
  try {
    if (!fs.existsSync(GLOBAL_IMAGE_INDEX_PATH)) return res.json([]);
    const globalIndex = JSON.parse(fs.readFileSync(GLOBAL_IMAGE_INDEX_PATH, "utf8"));
    
    if (query) {
      const q = query.toLowerCase();
      const filtered = globalIndex.filter(m => 
        (m.tags && m.tags.toLowerCase().includes(q)) || 
        (m.description && m.description.toLowerCase().includes(q)) ||
        (m.prompt && m.prompt.toLowerCase().includes(q))
      );
      return res.json(filtered);
    }
    res.json(globalIndex);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/persona-memory/inbox — Manual image upload → triggers indexing
const inboxUpload = multer({ dest: PERSONA_INBOX_DIR });
app.post("/api/persona-memory/inbox", inboxUpload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image file provided" });
  const personaId = req.body?.personaId || "assistant";
  const tags = req.body?.tags || "manual, uploaded";
  const description = req.body?.description || req.file.originalname;
  
  // Rename to support persona slug pattern
  const ext = path.extname(req.file.originalname) || ".png";
  const newName = `${personaId}_${Date.now()}${ext}`;
  const newPath = path.join(PERSONA_INBOX_DIR, newName);
  fs.renameSync(req.file.path, newPath);

  try {
    await indexImageMemory({ UTILITY_MODEL, runModel, getPersonas: () => personas }, "manual", tags, description, newPath, personaId);
    console.log(`📥 PERSONA_MEMORY_API: Manual upload indexed → persona="${personaId}"`);
    res.status(201).json({ success: true, personaId, file: newName });
  } catch (e) {
    console.error("inbox upload error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// create session
app.post("/api/session", async (req, res) => {
  try {
    const id = `session-${Date.now()}`;
    const newSession = {
      id,
      title: req.body?.title ?? "New Chat",
      model: req.body?.model ?? UTILITY_MODEL,
      webMode: !!req.body?.webMode,
      parallelMode: !!req.body?.parallelMode,
      selectedModels: req.body?.selectedModels || [],
      ragData: req.body?.ragData || "",
      ragFiles: [],
      messages: [],
      selectedVoice: req.body?.selectedVoice || "male_us",
      createdAt: new Date().toISOString(),
    };
    await saveSessionToDisk(newSession);
    res.json(newSession);
  } catch (e) {
    console.error("create session error:", e.message);
    res.status(500).json({ error: "failed to create session" });
  }
});

// Phase 19: Dynamic Emotional Triggers
async function checkEmotionalTriggers(sessionId, personaId) {
  const relKey = `${sessionId}_${personaId}`;
  const rel = (await getRelationship(relKey.split("_")[1]));
  if (!rel) return { action: null };

  const v = rel.mood_valence ?? 0;
  const a = rel.mood_arousal ?? 0;
  const persona = (await getPersonas()).find(p => p.id === personaId);

  // Trigger: Manic Burst (Very happy and very excited)
  if (v > 0.8 && a > 0.85) {
    return { 
      action: "follow_up", 
      prompt: `[EMOTIONAL_BURST]: ${persona?.name || 'The AI'} is feeling extremely euphoric and energetic. They want to share an exciting thought or suddenly change the topic to something joyful.`,
      chance: 0.3 // 30% chance per turn
    };
  }

  // Trigger: Aggressive Intervention (Very angry/hostile)
  if (v < -0.8 && a > 0.8) {
    return {
      action: "interrupt",
      prompt: `[EMOTIONAL_BURST]: ${persona?.name || 'The AI'} is feeling intense anger and hostility. They might lash out, interrupt the current flow, or demand something aggressively.`,
      chance: 0.4
    };
  }

  // Trigger: Melancholy Withdraw (Very sad and low energy)
  if (v < -0.7 && a < 0.2) {
    return {
      action: "withdraw",
      prompt: `[EMOTIONAL_BURST]: ${persona?.name || 'The AI'} is feeling deeply disconnected and exhausted. They might sigh, give a very short reply, or suggest ending the conversation.`,
      chance: 0.2
    };
  }

  return { action: null };
}

// GET persona mood for a session
app.get("/api/session/:sessionId/persona/:personaId/mood", async (req, res) => {
  const { sessionId, personaId } = req.params;
  const relKey = `${sessionId}_${personaId}`;
  const relData = (await getRelationship(relKey.split("_")[1])) || { mood_valence: 0, mood_arousal: 0 };
  
  const moodValence = relData.mood_valence || 0;
  const moodArousal = relData.mood_arousal || 0;
  const label = getMoodLabel(moodValence, moodArousal);
  
  res.json({
    valence: moodValence,
    arousal: moodArousal,
    label
  });
});

// list sessions
app.get("/api/sessions", async (req, res) => {
  try {
    const arr = await getQuery("SELECT * FROM Sessions ORDER BY updated_at DESC");
    const parsed = arr.map(row => {
      let data = {};
      try { data = JSON.parse(row.data); } catch(e) {}
      return {
        id: row.id,
        title: data.title || "New Chat",
        model: data.model || "",
        webMode: !!data.webMode,
        parallelMode: !!data.parallelMode,
        selectedModels: data.selectedModels || [],
        createdAt: data.createdAt || row.created_at,
        lastUpdate: row.updated_at
      };
    });
    res.json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// read session
app.get("/api/session/:id", async (req, res) => {
  const id = req.params.id;
  const s = await ensureSession(id);
  res.json(s);
});

// patch session metadata
app.patch("/api/session/:id", async (req, res) => {
  const id = req.params.id;
  const s = await ensureSession(id);
  if (!s) return res.status(404).json({ error: "not found" });
  Object.assign(s, req.body || {});
  await saveSessionToDisk(s);
  res.json(s);
});

// delete session
app.delete("/api/session/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const { runQuery } = await import("../services/dbService.js");
    await runQuery("DELETE FROM Sessions WHERE id = ?", [id]);
    const p = path.join(CHATS_DIR, `${id}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

}
