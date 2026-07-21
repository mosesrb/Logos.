import { getSession, getPersonas, getPersona, getRelationships, getRelationship, syncSession, syncPersona, syncMessage, syncRelationship, runQuery } from "../services/dbService.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import { pipeline } from "stream/promises";

import { routeModel } from "../modelRouter.js";
import { getMoodLabel } from "../ai/moods.js";
import { validateBody, AgentChatSchema, AgentDispatchSchema, SettingSchema } from "../middleware/validate.js";

// W-06: Audio-specific multer — 10 MB limit, MIME allowlist.
// Replaces the previous 100 MB no-validation upload.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/octet-stream", "audio/wav", "audio/webm", "audio/ogg", "audio/mpeg"];
    const ok = allowed.includes(file.mimetype);
    cb(ok ? null : new Error("UNSUPPORTED_AUDIO_TYPE"), ok);
  },
});

export function setupExtraRoutes(app, context) {
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
    generateViaComfyUI,
    _comfyFallback,
    AUDIO_CACHE_DIR,
    GLOBAL_MEMORY_PATH,
    PERSONA_MEMORY_PERSONAS_DIR,
    COMFYUI_INSTALL_DIR,
    globalMemory,
    embedText,
    cosineSimilarity,
    WaveFile,
    executeAgenticTask,
    resolvePersona,
    runQuery,
    loadGlobalImageIndex,
    saveGlobalImageIndex,
    rebuildImageMemoryIndex,
  } = context;
// ------------------ VOX: Vocal Integration (STT & TTS) ------------------
let transcriber = null;
const getTranscriber = async () => {
  if (!transcriber) transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { quantized: true });
  return transcriber;
};

let synthesizer = null;
let cachedSpeakerEmbeddings = null;

/**
 * Loads the SpeechT5 synthesizer pipeline (cached).
 */
const getSynthesizer = async () => {
  if (!synthesizer) {
    console.log("🚀 Initializing TTS Model (SpeechT5 - High Fidelity)...");
    // Disable quantization for better audio quality
    synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts', { quantized: false });
    console.log("✅ TTS Model ready.");
  }
  return synthesizer;
};

const VOICES = {
  "male_scot": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_awb_arctic-wav-arctic_a0001.bin",
  "male_us": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_bdl_arctic-wav-arctic_a0001.bin",
  "female_us": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_slt_arctic-wav-arctic_a0001.bin",
  "female_diana": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_clb_arctic-wav-arctic_a0001.bin",
  "female_luna": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_clb_arctic-wav-arctic_a0001.bin",
  "female_seraphina": "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin",
  "female_elena": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_slt_arctic-wav-arctic_a0001.bin",
  "male_david": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_rms_arctic-wav-arctic_a0001.bin",
  "male_james": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_jmk_arctic-wav-arctic_a0001.bin",
  "male_kunal": "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_ksp_arctic-wav-arctic_a0001.bin"
};

let cachedEmbeddings = {};

/**
 * Fetches speaker embeddings for a specific voice.
 */
async function getSpeakerEmbeddings(voiceKey = "male_us") {
  const url = VOICES[voiceKey] || VOICES["male_us"];
  if (cachedEmbeddings[url]) return cachedEmbeddings[url];
  
  console.log(`🔗 Fetching speaker embeddings for ${voiceKey}...`);
  cachedEmbeddings[url] = url; // Transformers.js handles URL caching.
  return url;
}

/**
 * Helper to split long text into manageable chunks for TTS (SpeechT5 limit).
 * Splits primarily by sentences while respecting a max length.
 */
function chunkTextForTTS(text, maxLen = 250) {
  if (text.length <= maxLen) return [text];
  
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
  const chunks = [];
  let currentChunk = "";

  for (const s of sentences) {
    if ((currentChunk + s).length > maxLen && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = s;
    } else {
      currentChunk += s;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  // Last resort: if any chunk is still too long, hard slice it
  return chunks.flatMap(c => {
    if (c.length <= maxLen) return [c];
    const subChunks = [];
    for (let i = 0; i < c.length; i += maxLen) {
      subChunks.push(c.slice(i, i + maxLen));
    }
    return subChunks;
  });
}

app.post("/api/audio/transcribe", audioUpload.single("audioFloat32"), async (req, res) => {
  try {
    if (!req.file) throw new Error("No audio file provided");
    // memoryStorage: use buffer directly (no temp file to clean up)
    const buffer    = req.file.buffer;
    const audioData = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / Float32Array.BYTES_PER_ELEMENT);

    const transcribe = await getTranscriber();
    const result = await transcribe(audioData);
    res.json({ text: result.text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/audio/synthesize", async (req, res) => {
  try {
    if (!WaveFile) throw new Error("Audio synthesis dependency is unavailable");
    const { text, voice = "male_us" } = req.body;
    if (!text) throw new Error("No text provided");
    
    // Check cache
    const hash = crypto.createHash("sha256").update(text + "|" + voice).digest("hex");
    const cachePath = path.join(AUDIO_CACHE_DIR, `${hash}.wav`);

    if (fs.existsSync(cachePath)) {
      addLog(null, `VOX_CACHE_HIT: [${voice}] Reusing existing audio for "${text.substring(0, 30)}..."`, "sys");
      const wavBuffer = fs.readFileSync(cachePath);
      const base64Audio = wavBuffer.toString("base64");
      return res.json({ audio: base64Audio, format: "wav", cached: true });
    }

    addLog(null, `VOX_SYNTH: [${voice}] ${text.length} chars...`, "sys");
    const synth = await getSynthesizer();
    const speaker_embeddings = await getSpeakerEmbeddings(voice);
    
    // Chunking to avoid ONNX/SpeechT5 limit hangs (400 chars for quality)
    const textChunks = chunkTextForTTS(text, 400);
    const audioResults = [];
    let samplingRate = 16000;

    console.log(`🎙️ TTS: [${voice}] Splitting into ${textChunks.length} chunks...`);
    for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        if (!chunk.trim()) continue;
        const result = await synth(chunk, { speaker_embeddings });
        audioResults.push(result.audio);
        samplingRate = result.sampling_rate;
    }

    if (audioResults.length === 0) throw new Error("Synthesis produced no audio");

    // Protection: Clear NaNs and Apply Normalization + Micro-fades
    const fadeLen = Math.floor(samplingRate * 0.005); // 5ms fade
    const processedChunks = audioResults.map(chunk => {
      const processed = new Float32Array(chunk);
      // Fade in/out
      for (let i = 0; i < Math.min(fadeLen, processed.length); i++) {
        processed[i] *= (i / fadeLen);
        const outIdx = processed.length - 1 - i;
        processed[outIdx] *= (i / fadeLen);
      }
      // Simple Low-Pass Filter (One-pole RC) to reduce high-frequency hiss
      // Cutoff ~6kHz for 16kHz sampling
      const alpha = 0.5;
      let lastVal = 0;
      for (let i = 0; i < processed.length; i++) {
        processed[i] = lastVal + alpha * (processed[i] - lastVal);
        lastVal = processed[i];
      }
      return processed;
    });

    // Concatenate processed chunks
    const totalLength = processedChunks.reduce((acc, a) => acc + a.length, 0);
    const combinedAudio = new Float32Array(totalLength);
    let offset = 0;
    for (const a of processedChunks) {
      combinedAudio.set(a, offset);
      offset += a.length;
    }

    // Normalize Volume
    let maxVal = 0;
    for (let i = 0; i < combinedAudio.length; i++) {
      const abs = Math.abs(combinedAudio[i]);
      if (abs > maxVal) maxVal = abs;
    }
    if (maxVal > 0) {
      const ratio = 0.9 / maxVal; // Target 90% peak
      for (let i = 0; i < combinedAudio.length; i++) {
        combinedAudio[i] *= ratio;
      }
    }

    // Use WaveFile's built-in high-quality converters
    const wav = new WaveFile();
    wav.fromScratch(1, samplingRate, '32f', combinedAudio);
    wav.toBitDepth('16'); 
    const wavBuffer = wav.toBuffer();
    
    // Save to cache
    try {
      fs.writeFileSync(cachePath, wavBuffer);
    } catch (e) {
      console.warn("Failed to write audio cache:", e.message);
    }
    
    // Convert to base64
    const base64Audio = Buffer.from(wavBuffer).toString('base64');
    
    res.json({ audio: base64Audio, format: "wav" });
    addLog(null, `VOX_SYNTH_COMPLETE: [${voice}] Generated ${Math.round(totalLength/samplingRate)}s of audio`, "sys");
  } catch(err) {
    console.error("TTS Endpoint Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ NEURAL MAP (Vector Visualization) ------------------
app.get("/api/session/:sessionId/vectors", async (req, res) => {
  const session = await (await ensureSessionAsync(req.params.sessionId));
  if (!session) return res.json([]);
  
  // Coordinate scaling
  const scale = 350;
  const offset = 250;

  const localNodes = (session?.vectorChunks || []).map((c, i) => {
    const x = (c.vector[0] * scale) + offset;
    const y = (c.vector[1] * scale) + offset;
    return { 
      id: `local-${i}`, 
      x, y, 
      text: c.text, 
      source: c.source || "Current Session", 
      type: "local",
      mood: { v: 0, a: 0 } // Default for session files/chunks
    };
  });

  // Smart global recall for map
  // Find top 10 most relevant memories to the last user message in the session
  const lastUserMsg = [...session.messages].reverse().find(m => m.role === "user");
  let globalNodes = [];
  
  if (lastUserMsg && globalMemory.length > 0) {
    const userVector = await embedText(lastUserMsg.content);
    const scored = globalMemory.map((m, i) => ({
      ...m,
      index: i,
      score: cosineSimilarity(userVector, m.vector)
    })).sort((a,b) => b.score - a.score).slice(0, 12);

    globalNodes = scored.map((m, i) => {
      const x = (m.vector[0] * scale) + offset;
      const y = (m.vector[1] * scale) + offset;
      return { 
        id: `global-${m.index}`, 
        x, y, 
        text: m.text, 
        mood: { 
          v: m.mood?.mood_valence ?? 0, 
          a: m.mood?.mood_arousal ?? 0 
        }
      };
    });
  }

  res.json([...localNodes, ...globalNodes]);
});

app.delete("/api/memory/:index", async (req, res) => {
  if (process.env.ENABLE_MEMORY_ADMIN_API !== "true") {
    return res.status(404).json({ error: "MEMORY_ADMIN_API_DISABLED" });
  }
  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0 || index >= globalMemory.length) {
    return res.status(400).json({ error: "Invalid memory index" });
  }

  const removed = globalMemory.splice(index, 1);
  try {
    fs.writeFileSync(GLOBAL_MEMORY_PATH, JSON.stringify(globalMemory, null, 2));
    addLog(null, `🧠 MEMORY_PRUNED: Removed entry at index ${index}`, "sys");
    res.json({ success: true, removed });
  } catch (e) {
    res.status(500).json({ error: "Failed to save memory store" });
  }
});

app.post("/api/memory/edit", async (req, res) => {
  if (process.env.ENABLE_MEMORY_ADMIN_API !== "true") {
    return res.status(404).json({ error: "MEMORY_ADMIN_API_DISABLED" });
  }
  const { index, text } = req.body;
  const idx = parseInt(index);
  
  if (isNaN(idx) || idx < 0 || idx >= globalMemory.length) {
    return res.status(400).json({ error: "Invalid memory index" });
  }

  if (!text || text.trim().length < 3) {
    return res.status(400).json({ error: "Memory text too short" });
  }

  try {
    addLog(null, `🧠 MEMORY_SYNC: Updating memory ${idx}...`, "sys");
    
    // Update text and re-generate embedding
    globalMemory[idx].text = text;
    globalMemory[idx].vector = await embedText(text);
    
    fs.writeFileSync(GLOBAL_MEMORY_PATH, JSON.stringify(globalMemory, null, 2));
    addLog(null, `✅ MEMORY_SYNC_COMPLETE: Saved changes to index ${idx}`, "sys");
    res.json({ success: true, memory: globalMemory[idx] });
  } catch (e) {
    res.status(500).json({ error: "Failed to update memory" });
  }
});

// Phase 26: Persona Memory Wipe
app.delete("/api/memory/persona/:personaId/wipe", async (req, res) => {
  if (process.env.ENABLE_MEMORY_ADMIN_API !== "true") {
    return res.status(404).json({ error: "MEMORY_ADMIN_API_DISABLED" });
  }
  const { personaId } = req.params;
  if (!personaId) return res.status(400).json({ error: "personaId required" });

  let wipedCount = 0;

  try {
    // 1. Wipe episodic global memory entries matching this persona
    const before = globalMemory.length;
    const retainedMemories = globalMemory.filter(m => m.personaId !== personaId);
    globalMemory.splice(0, globalMemory.length, ...retainedMemories);
    wipedCount += before - globalMemory.length;
    fs.writeFileSync(GLOBAL_MEMORY_PATH, JSON.stringify(globalMemory, null, 2));

    // 2. Wipe image memory entries matching this persona
    const imgDir = path.join(PERSONA_MEMORY_PERSONAS_DIR, personaId);
    if (fs.existsSync(imgDir)) {
      fs.rmSync(imgDir, { recursive: true, force: true });
      wipedCount++;
    }

    // 3. Purge from Global Image Index
    let globalIndex = loadGlobalImageIndex();
    const beforeGlobal = globalIndex.length;
    globalIndex = globalIndex.filter(img => img.persona !== personaId);
    if (beforeGlobal !== globalIndex.length) {
      saveGlobalImageIndex(globalIndex);
      wipedCount += (beforeGlobal - globalIndex.length);
    }

    // 4. Rebuild in-memory image index
    rebuildImageMemoryIndex();

    // 5. Synchronize with SQLite
    await runQuery("DELETE FROM GlobalMemory WHERE persona_id = ?", [personaId]);
    await runQuery("DELETE FROM VisualMemory WHERE persona_id = ?", [personaId]);
    await runQuery("DELETE FROM Relationships WHERE persona_id = ?", [personaId]);

    console.log(`☢️ WIPE_COMPLETE: Persona ${personaId} — ${wipedCount} records purged across JSON and SQLite.`);
    res.json({ success: true, wiped: wipedCount, personaId });
  } catch (e) {
    console.error("Memory wipe failed:", e.message);
    res.status(500).json({ error: "Wipe failed: " + e.message });
  }
});

// Snapshot / Branch Session (Ticket 22)
// ... already implemented ...

// Narrative Evaluation System (Ticket 23)
app.post("/api/chat/evaluate/:sessionId", async (req, res) => {
  const s = await (await ensureSessionAsync(req.params.sessionId));
  if (!s) return res.status(404).json({ error: "Session not found" });

  const recentHistory = s.messages.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  
  const evaluationPrompt = `
### NARRATIVE AUDIT PROTOCOL ###
You are a Narrative Integrity AI. Analyze the following 10 most recent simulation events and provide a structured evaluation.

HISTORY:
${recentHistory}

TASK:
1. FIDELITY: How well did characters adhere to their persona and logic? (0-10)
2. PROGRESSION: How much did the story move forward? (0-10)
3. ANOMALIES: List any out-of-character behaviors or logical breaks.
4. SYNOPSIS: A brief 2-sentence summary of the current world state.

OUTPUT FORMAT: JSON only.
{
  "fidelity": number,
  "progression": number,
  "anomalies": string[],
  "synopsis": string
}
### END PROTOCOL ###
`;

  try {
    const model = s.model || UTILITY_MODEL;
    const ollamaRes = await fetch((process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434") + "/api/generate", {
      method: "POST",
      body: JSON.stringify({
        model,
        prompt: evaluationPrompt,
        stream: false,
        format: "json"
      })
    });
    
    const data = await ollamaRes.json();
    let result = {};
    try {
      result = JSON.parse(data.response);
    } catch (e) {
       result = { error: "Failed to parse AI evaluation result.", raw: data.response };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/settings", async (req, res) => {
  try {
    const { getAllSettings } = await import("../services/dbService.js");
    const settings = await getAllSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings", message: err.message });
  }
});

app.post("/api/settings", validateBody(SettingSchema), async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Setting key is required." });
  
  try {
    const { upsertSetting } = await import("../services/dbService.js");
    await upsertSetting(key, value);
    res.json({ success: true, key, value });
  } catch (err) {
    res.status(500).json({ error: "Failed to save setting", message: err.message });
  }
});

app.get("/api/health", async (req, res) => {
  res.json({
    status: "online",
    ts: new Date().toISOString(),
    express: "active",
    models: 1,
    memory: "missing"
  });
});

app.get('/api/comfyui/status', async (req, res) => {
  try {
    const r = await fetch(`http://127.0.0.1:8188/system_stats`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const data = await r.json();
      return res.json({ running: true, stats: data });
    }
    return res.json({ running: false });
  } catch {
    return res.json({ running: false });
  }
});

// ---------- PHASE 12: ComfyUI Management API ----------

app.post('/api/comfyui/launch', async (req, res) => {
  if (process.env.ENABLE_COMFYUI_LAUNCH_API !== "true") {
    return res.status(404).json({ error: "COMFYUI_LAUNCH_API_DISABLED" });
  }
  const batFile = `${COMFYUI_INSTALL_DIR}\\run_nvidia_gpu.bat`;
  if (!fs.existsSync(batFile)) {
    return res.status(404).json({ error: `Launch bat not found at ${batFile}` });
  }
  console.log(`🚀 COMFYUI: Launching via ${batFile}...`);
  exec(`start "" "${batFile}"`, { cwd: COMFYUI_INSTALL_DIR }, (err) => {
    if (err) {
      console.error('ComfyUI launch error:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ launched: true, message: 'ComfyUI is starting. Please wait ~10 seconds.' });
  });
});

// GET relationship for persona (including mood_history)
app.get("/api/relationships/:sessionId/:personaId", async (req, res) => {
  const { sessionId, personaId } = req.params;
  const relKey = `${sessionId}_${personaId}`;
  const rel = (await getRelationship(relKey.split("_")[1]));
  if (!rel) return res.status(404).json({ error: "Relationship not found" });
  res.json(rel);
});


// ==========================================
// SYNAPSE AGENTIC BRIDGE (OpenClaude integration)
// ==========================================
app.post("/api/agent/chat", validateBody(AgentChatSchema), async (req, res) => {
    if (process.env.ENABLE_AGENT_API !== "true") {
        return res.status(404).json({ error: "AGENT_API_DISABLED" });
    }
    const { message, model, sessionId, systemPrompt, persona } = req.body;
    
    if (!sessionId) {
        return res.status(400).json({ error: "sessionId required for agentic chat tracking." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Persistence Hook: Define how AXON saves to this session
    const saveMessageHk = async (role, content) => {
        const s = await (await ensureSessionAsync(sessionId));
        s.messages.push({ 
            role: role === "user" ? "user" : "assistant", // Logic check: Agent role is assistant
            content, 
            time: new Date().toISOString(), 
            model: model || "qwen2.5-coder:7b",
            personaId: persona?.id
        });
        await saveSessionToDisk(s);
        addLog(sessionId, `AGENT_SAVE: Interaction committed to persistence layer.`, "sys");
    };

    // Kick off the autonomous tool loop with persona-aware traits
    await executeAgenticTask(res, model || "qwen2.5-coder:7b", systemPrompt, message, persona, {
        sessionId,
        saveMessage: saveMessageHk
    });

    res.end(); // Signal SSE completion
});

// ==========================================
// AGENTIC OPERATIONS DESK — DISPATCH ENDPOINT
// Standalone agent runner with tool filtering + loop control
// ==========================================
app.post("/api/agent/dispatch", validateBody(AgentDispatchSchema), async (req, res) => {
    if (process.env.ENABLE_AGENT_API !== "true") {
        return res.status(404).json({ error: "AGENT_API_DISABLED" });
    }
    // Note: allowedTools is intentionally excluded from AgentDispatchSchema — server owns tool policy.
    const { goal, personaId, maxLoops, history = [] } = req.body;
    
    if (!goal || !goal.trim()) {
        return res.status(400).json({ error: "Mission goal is required." });
    }

    // Resolve persona — fall back to AXON if none specified
    const persona = (await getPersona(personaId)) || (await getPersonas()).find(p => p.id === "persona-axon-agent") || null;
    const model = persona?.model || "qwen2.5-coder:7b";

    // Build a clean tool-calling system prompt
    const AGENT_DESK_PROTOCOL = `You are an autonomous AI agent with access to tools. Use your tools when needed to complete the task. Think through the problem step by step. Call tools to gather information or execute actions. When you have everything needed, produce a clear, complete final answer.`;

    const personaBase = persona
        ? [persona.system_prompt, persona.goal ? `Goal: ${persona.goal}` : '', persona.core_expertise ? `Expertise: ${persona.core_expertise}` : '']
            .filter(Boolean).join('\n\n')
        : '';

    const systemPrompt = [AGENT_DESK_PROTOCOL, personaBase].filter(Boolean).join('\n\n---\n\n');

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    console.log(`⚙️ AGENT_DISPATCH: goal="${goal.substring(0, 60)}..." | history=${history.length} | model=${model}`);

    try {
        await executeAgenticTask(res, model, systemPrompt, goal.trim(), persona, { 
            sessionId: "agent-desk",
            saveMessage: null,
            maxLoops: maxLoops || 8,
            history
        });
    } catch (err) {
        console.error("Agent Dispatch Error:", err);
        res.write(`data: ${JSON.stringify({ type: "agent-error", content: err.message })}\n\n`);
    }

    res.end();
});

}
