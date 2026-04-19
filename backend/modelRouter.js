// backend/modelRouter.js
// T5: Intelligent Model Routing — selects optimal model based on task complexity.
// Priority: Scenario override > Complexity detection > Session model fallback

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load registry once at startup
let MODEL_REGISTRY = [];
try {
  const raw = readFileSync(path.join(__dirname, "data", "model_registry.json"), "utf8");
  MODEL_REGISTRY = JSON.parse(raw).models || [];
  console.log(`✅ [ModelRouter] Registry loaded: ${MODEL_REGISTRY.length} models`);
} catch (e) {
  console.warn("⚠️ [ModelRouter] Could not load model_registry.json:", e.message);
}

// Complexity signal patterns
const HEAVY_PATTERNS = [
  /analyz/i, /synthesiz/i, /research/i, /comprehensive/i, /strateg/i,
  /compar.*detail/i, /in[\s-]depth/i, /generate.*report/i, /write.*essay/i,
  /explain.*thoroughly/i, /elaborate/i, /deep dive/i, /full breakdown/i,
];

/**
 * Returns the model id to use for a given request.
 * @param {string}      prompt              User's raw prompt
 * @param {string}      sessionModel        Model currently set on the session
 * @param {string|null} scenarioPreference  Explicit model_preference from scenario (overrides all)
 * @returns {string} Ollama model id
 */
export function routeModel(prompt = "", sessionModel = "phi3", scenarioPreference = null, hasImages = false) {
  // Priority 1: Vision tasks override all — if an image is attached, force a vision model
  if (hasImages) {
    console.log(`🧭 [ModelRouter] Vision task detected → forcing 'moondream'`);
    return "moondream";
  }

  // Priority 2: Scenario has an explicit model override
  if (scenarioPreference && MODEL_REGISTRY.some(m => m.id === scenarioPreference)) {
    console.log(`🧭 [ModelRouter] Scenario override → ${scenarioPreference}`);
    return scenarioPreference;
  }

  // Priority 3: Complexity detection — route heavy prompts to the heavy-tier model
  const isComplex = HEAVY_PATTERNS.some(r => r.test(prompt));
  if (isComplex) {
    const heavy = MODEL_REGISTRY.find(m => m.tier === "heavy");
    if (heavy) {
      console.log(`🧭 [ModelRouter] Complex prompt detected → ${heavy.id}`);
      return heavy.id;
    }
  }

  // Priority 3: Fallback to the user-selected session model
  console.log(`🧭 [ModelRouter] Default → ${sessionModel}`);
  return sessionModel;
}

/**
 * Returns Ollama options (num_gpu, num_thread) for a given model id.
 * Merges with any existing options object.
 * @param {string} modelId
 * @param {object} existingOptions
 * @returns {object}
 */
export function buildHybridOptions(modelId, existingOptions = {}) {
  const reg = MODEL_REGISTRY.find(m => m.id === modelId);
  if (!reg || reg.tier !== "heavy") return existingOptions;

  return {
    ...existingOptions,
    num_gpu: existingOptions.num_gpu ?? (reg.num_gpu || 30),
    num_thread: existingOptions.num_thread ?? (reg.num_thread || 8),
  };
}

/**
 * Returns the full registry for use in /api/models and stats endpoints.
 */
export function getModelRegistry() {
  return MODEL_REGISTRY;
}

/**
 * Returns the tier for a model id ("fast" | "smart" | "heavy" | "unknown")
 */
export function getModelTier(modelId) {
  return MODEL_REGISTRY.find(m => m.id === modelId)?.tier || "unknown";
}
