import express from "express";
import { spawn } from "child_process";
import { getSession, getPersonas, getPersona, getRelationships, getRelationship, syncSession, syncPersona, syncMessage, syncRelationship } from "../services/dbService.js";
import { getSystemStats, modelMetricsStore } from "../services/systemService.js";
import { getModelRegistry } from "../modelRouter.js";

export function setupModelsRoutes(app, context) {
  const { UTILITY_MODEL } = context;

  app.get("/api/models", async (req, res) => {
    try {
      // Try to get models from local 'ollama' binary
      const child = spawn("ollama", ["list"], { shell: true });
      const chunks = [];
      let responded = false;

      const timer = setTimeout(() => {
        if (!responded) {
          responded = true;
          res.json([UTILITY_MODEL, "qwen2:1.5b", "mistral:7b-instruct-q4_0", "gemma:2b", "llama3"]);
        }
      }, 5000);

      child.stdout.on("data", (c) => chunks.push(c.toString()));
      child.on("error", (err) => {
        if (responded) return;
        responded = true;
        clearTimeout(timer);
        res.json([UTILITY_MODEL, "qwen2:1.5b", "mistral:7b-instruct-q4_0", "gemma:2b", "llama3"]);
      });

      child.on("close", (code) => {
        if (responded) return;
        responded = true;
        clearTimeout(timer);
        try {
          const out = chunks.join("");
          if (code !== 0 || !out.trim()) {
            return res.json([UTILITY_MODEL, "qwen2:1.5b", "mistral:7b-instruct-q4_0", "gemma:2b", "llama3"]);
          }
          const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const models = lines
            .filter((l) => !/^name|model/i.test(l))
            .map((l) => l.split(/\s+/)[0])
            .filter(Boolean);
          res.json(models.length ? models : [UTILITY_MODEL, "qwen2:1.5b", "mistral:7b-instruct-q4_0", "gemma:2b", "llama3"]);
        } catch (e) {
          res.json([UTILITY_MODEL, "qwen2:1.5b", "mistral:7b-instruct-q4_0", "gemma:2b", "llama3"]);
        }
      });
    } catch (e) {
      console.warn("models endpoint fallback", e.message);
      res.json([UTILITY_MODEL, "qwen2:1.5b", "mistral:7b-instruct-q4_0"]);
    }
  });

  // ------------------ SYSTEM HUD ENDPOINT (via systemService) ------------------
  app.get("/api/system/stats", async (req, res) => {
    try {
      const stats = await getSystemStats();
      res.json({
        ...stats,
        modelMetrics: modelMetricsStore.snapshot(), // T6: per-model perf
        modelRegistry: getModelRegistry(),          // T1: expose registry to UI
      });
    } catch (err) {
      console.error("?? STATS_CRASH_PREVENTED:", err.message);
      res.json({ 
        cpu: 0, ram: 0, vram: 0, 
        details: { memTotal: "0GB", memUsed: "0GB", gpuName: "N/A" },
        modelMetrics: {},
        modelRegistry: { models: [] }
      });
    }
  });

  // T8: Model unload endpoint — stop a running Ollama model to free VRAM
  app.post("/api/models/unload", async (req, res) => {
    const { model } = req.body || {};
    if (!model) return res.status(400).json({ error: "Missing model name" });
    try {
      const child = spawn("ollama", ["stop", model], { shell: true });
      let out = "";
      child.stdout.on("data", d => (out += d));
      child.stderr.on("data", d => (out += d));
      child.on("close", code => {
        if (code === 0) {
          console.log(`🔌 [T8] Unloaded model: ${model}`);
          res.json({ success: true, model });
        } else {
          res.status(500).json({ error: `ollama stop exited with code ${code}`, detail: out });
        }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
