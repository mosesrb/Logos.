import { z } from "zod";

/**
 * Validates the core dependencies passed to route controllers.
 * Ensures that if a dependency is missing, the server fails fast on startup
 * instead of crashing later during an API request.
 */
export const ContextSchema = z.object({
  UTILITY_MODEL: z.string(),
  runModel: z.function(),
  parseCleanAnswer: z.function(),
  personas: z.array(z.any()),
  relationships: z.record(z.any()),
  scenarios: z.array(z.any()),
  addLog: z.function(),
  saveSessionToDisk: z.function(),
  savePersonas: z.function(),
  saveRelationships: z.function(),
  saveScenarios: z.function(),
  ensureSession: z.function(),
  resolvePersona: z.function(),
  buildPersonaSystemPrompt: z.function(),
  generateViaComfyUI: z.function().optional(),
  _comfyFallback: z.function().optional(),
  CHATS_DIR: z.string(),
  UPLOADS_DIR: z.string(),
  OUTPUT_DIR: z.string(),
  PERSONAS_DIR: z.string(),
  DATA_DIR: z.string(),
  PERSONA_INBOX_DIR: z.string(),
  GLOBAL_MEMORY_PATH: z.string(),
  GLOBAL_IMAGE_INDEX_PATH: z.string(),
  PERSONA_MEMORY_PERSONAS_DIR: z.string(),
  AUDIO_CACHE_DIR: z.string(),
  COMFYUI_INSTALL_DIR: z.string(),
  SCENARIOS_PATH: z.string(),
  getChatPath: z.function(),
  upload: z.any().optional(), // multer instance
  TESSERACT_BIN: z.union([z.string(), z.boolean(), z.null()]),
  extractDocumentText: z.function(),
  indexDocumentChunks: z.function(),
  buildFullPrompt: z.function(),
  getModelOptions: z.function(),
  globalMemory: z.array(z.any()),
  embedText: z.function(),
  cosineSimilarity: z.function(),
  WaveFile: z.any().optional(),
  executeAgenticTask: z.function(),
  runQuery: z.function(),
  loadGlobalImageIndex: z.function(),
  saveGlobalImageIndex: z.function(),
  rebuildImageMemoryIndex: z.function(),
});

export function validateContext(context) {
  try {
    return ContextSchema.parse(context);
  } catch (error) {
    console.error("[FATAL] Context dependency validation failed!");
    console.error(JSON.stringify(error.format(), null, 2));
    throw new Error("Missing or invalid dependencies in route context.");
  }
}
