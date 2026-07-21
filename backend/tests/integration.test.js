import { describe, it, expect } from "vitest";
import { validateContext } from "../utils/dependencyContract.js";

describe("Phase 2: Integration & Dependency Validation", () => {
  it("should fail-fast if context is missing critical dependencies", () => {
    const invalidContext = {
      // missing most required properties
      UTILITY_MODEL: "mistral"
    };

    expect(() => validateContext(invalidContext)).toThrowError("Missing or invalid dependencies");
  });

  it("should pass validation with a full valid context mock", () => {
    const validContext = {
      UTILITY_MODEL: "test",
      runModel: () => {},
      parseCleanAnswer: () => {},
      sessions: {},
      personas: [],
      relationships: {},
      scenarios: [],
      addLog: () => {},
      saveSessionToDisk: () => {},
      savePersonas: () => {},
      saveRelationships: () => {},
      saveScenarios: () => {},
      ensureSession: () => {},
      resolvePersona: () => {},
      buildPersonaSystemPrompt: () => {},
      generateViaComfyUI: undefined,
      _comfyFallback: undefined,
      CHATS_DIR: "/mock/chats",
      UPLOADS_DIR: "/mock/uploads",
      OUTPUT_DIR: "/mock/output",
      PERSONAS_DIR: "/mock/personas",
      DATA_DIR: "/mock/data",
      PERSONA_INBOX_DIR: "/mock/inbox",
      GLOBAL_MEMORY_PATH: "/mock/memory.json",
      GLOBAL_IMAGE_INDEX_PATH: "/mock/images.json",
      PERSONA_MEMORY_PERSONAS_DIR: "/mock/memory_personas",
      AUDIO_CACHE_DIR: "/mock/audio",
      COMFYUI_INSTALL_DIR: "/mock/comfyui",
      SCENARIOS_PATH: "/mock/scenarios.json",
      getChatPath: () => {},
      upload: undefined,
      TESSERACT_BIN: null,
      extractDocumentText: () => {},
      indexDocumentChunks: () => {},
      getActiveHeavyModels: () => 0,
      incrementHeavyModels: () => {},
      decrementHeavyModels: () => {},
      MAX_CONCURRENT_HEAVY: 1,
      buildFullPrompt: () => {},
      getModelOptions: () => {},
      globalMemory: [],
      embedText: () => {},
      cosineSimilarity: () => {},
      WaveFile: undefined,
      executeAgenticTask: () => {},
      runQuery: () => {},
      loadGlobalImageIndex: () => {},
      saveGlobalImageIndex: () => {},
      rebuildImageMemoryIndex: () => {}
    };

    expect(() => validateContext(validContext)).not.toThrow();
  });
});
