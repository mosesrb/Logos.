import fs from 'fs';

const serverFile = 'server.js';
let content = fs.readFileSync(serverFile, 'utf8');
const lines = content.split('\n');

function replaceBlock(startPattern, endPattern, replacement) {
    const startIdx = lines.findIndex(l => l.includes(startPattern));
    const endIdx = lines.findIndex(l => l.includes(endPattern));
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
        lines.splice(startIdx, endIdx - startIdx, replacement);
        return true;
    }
    return false;
}

// Imports to add
const imports = `
import { setupModelsRoutes } from "./controllers/modelsController.js";
import { setupDatabaseRoutes } from "./controllers/databaseController.js";
import { setupRagRoutes } from "./controllers/ragController.js";
import { setupAppRoutes } from "./controllers/appController.js";
import { setupChatRoutes } from "./controllers/chatController.js";
import { setupExtraRoutes } from "./controllers/extraController.js";


`;

const importsIdx = lines.findIndex(l => l.includes('import express from "express";'));
if (importsIdx !== -1) {
    lines.splice(importsIdx + 1, 0, imports.trim());
}

// 1. Models
replaceBlock(
    '// ------------------ MODELS ENDPOINT ------------------',
    '// ------------------ SESSION CRUD ------------------',
    `setupModelsRoutes(app, { resolvePersona, getMoodLabel });\n`
);

// 2. Session/Persona (App)
replaceBlock(
    '// ------------------ SESSION CRUD ------------------',
    '// ------------------ DATABASE ENDPOINTS ------------------',
    `setupAppRoutes(app, {
  sessions, personas, scenarios, addLog, saveSessionToDisk, savePersonas, ensureSession,
  CHATS_DIR, PERSONAS_DIR, DATA_DIR, PERSONA_INBOX_DIR, GLOBAL_IMAGE_INDEX_PATH, generateViaComfyUI
});\n`
);

// 3. Database
replaceBlock(
    '// ------------------ DATABASE ENDPOINTS ------------------',
    '// ------------------ RAG / DOCUMENTS / WEB SEARCH / IMAGE GENERATION ------------------',
    `setupDatabaseRoutes(app, {
  CHATS_DIR, GLOBAL_MEMORY_PATH, GLOBAL_IMAGE_INDEX_PATH, PERSONA_MEMORY_PERSONAS_DIR,
  getChatPath, personas, savePersonas, relationships, saveRelationships
});\n`
);

// 4. RAG
replaceBlock(
    '// ------------------ RAG / DOCUMENTS / WEB SEARCH / IMAGE GENERATION ------------------',
    '// ------------------ CHAT ENDPOINTS (single + parallel) ------------------',
    `setupRagRoutes(app, {
  sessions, personas, relationships, scenarios, addLog, saveSessionToDisk, ensureSession,
  upload, generateViaComfyUI, _comfyFallback
});\n`
);

// 5. Chat
replaceBlock(
    '// ------------------ CHAT ENDPOINTS (single + parallel) ------------------',
    '// ------------------ VOX: Vocal Integration (STT & TTS) ------------------',
    `setupChatRoutes(app, {
  UTILITY_MODEL, sessions, personas, relationships, scenarios, addLog, saveSessionToDisk,
  ensureSession, resolvePersona, buildPersonaSystemPrompt, generateViaComfyUI, _comfyFallback
});\n`
);

// 6. Extra
replaceBlock(
    '// ------------------ VOX: Vocal Integration (STT & TTS) ------------------',
    '// ------------------ GLOBAL ERROR HANDLING ------------------',
    `setupExtraRoutes(app, {
  UTILITY_MODEL, sessions, personas, relationships, scenarios, addLog, saveSessionToDisk, savePersonas,
  ensureSession, CHATS_DIR, PERSONAS_DIR, DATA_DIR, generateViaComfyUI, _comfyFallback
});\n`
);

// Clean up undefined getSynthesizer calls
const preloadStart = lines.findIndex(l => l.includes('// Pre-load VOX Models (Async)'));
if (preloadStart !== -1) {
    lines.splice(preloadStart, 4); // Remove 4 lines: comment, log, getSynthesizer, getSpeakerEmbeddings
}

fs.writeFileSync(serverFile, lines.join('\n'));
console.log("Reapplied all extractions cleanly!");
