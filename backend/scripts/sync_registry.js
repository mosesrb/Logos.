/**
 * backend/scripts/sync_registry.js
 * Synchronizes model_registry.json with locally installed Ollama models.
 * Applies intelligent tiering and metadata.
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, "..", "data", "model_registry.json");

async function sync() {
  console.log("🔄 NEXUS_SYNC: Starting registry synchronization...");

  try {
    // 1. Get Ollama models
    const { stdout } = await execAsync("ollama list");
    const lines = stdout.split("\n").filter(l => l.trim() && !l.toLowerCase().includes("name"));
    const localModels = lines.map(l => {
      const parts = l.split(/\s+/);
      return { id: parts[0], sizeStr: parts[2] };
    });

    // 2. Load current registry
    let registryData = { models: [] };
    if (fs.existsSync(REGISTRY_PATH)) {
      registryData = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    }

    const existingIds = new Set(registryData.models.map(m => m.id));
    let addedCount = 0;

    // 3. Process each local model
    for (const model of localModels) {
      if (existingIds.has(model.id)) continue;

      const id = model.id.toLowerCase();
      let tier = "smart";
      let capabilities = [];
      let description = `Local version of ${model.id}`;

      // Heuristic: Tiering (Keywords first)
      if (id.includes("coder") || id.includes("dolphin") || id.includes("hermes")) {
        tier = "heavy";
        capabilities.push("complex_logic");
      } else if (/\b(14b|26|31b|70b)\b/.test(id)) {
        tier = "heavy";
        capabilities.push("complex_logic");
      } else if (/\b(1\.5b|2b|3b)\b/.test(id) || id.includes("phi") || id.includes("qwen2:1.5b")) {
        tier = "fast";
        capabilities.push("fast");
      } else {
        tier = "smart"; // Default for 7b-9b general models
      }

      // Heuristic: Capabilities
      if (id.includes("coder")) capabilities.push("coding");
      if (id.includes("vision") || id.includes("moondream") || id.includes("llava")) capabilities.push("vision");
      if (id.includes("instruct") || id.includes("gemma4") || id.includes("llama3")) capabilities.push("agentic");

      // Estimate VRAM (rough heuristic: size + 1.5GB slack)
      const sizeVal = parseFloat(model.sizeStr) || 4;
      const vram_gb = Math.ceil(sizeVal + 1);

      // Add to registry
      registryData.models.push({
        id: model.id,
        size: model.sizeStr,
        tier,
        vram_gb,
        description,
        capabilities
      });
      
      console.log(`✨ Added: ${model.id} [Tier: ${tier.toUpperCase()}]`);
      addedCount++;
    }

    // 4. Save
    registryData._updated = new Date().toISOString().split("T")[0];
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registryData, null, 2), "utf8");

    console.log(`\n✅ SYNC_COMPLETE: Added ${addedCount} new models to registry.`);
    console.log(`📁 File updated: ${REGISTRY_PATH}`);

  } catch (err) {
    console.error("❌ SYNC_ERROR:", err.message);
    process.exit(1);
  }
}

sync();
