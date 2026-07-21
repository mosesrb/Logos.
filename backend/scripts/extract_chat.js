import fs from 'fs';

const serverFile = 'server.js';
const chatControllerFile = 'controllers/chatController.js';

let content = fs.readFileSync(serverFile, 'utf8');
const lines = content.split('\n');

const startIdx = lines.findIndex(l => l.includes('// ------------------ CHAT ENDPOINTS (single + parallel) ------------------'));
const endIdx = lines.findIndex(l => l.includes('// ------------------ VOX: Vocal Integration (STT & TTS) ------------------'));

if (startIdx !== -1 && endIdx !== -1) {
    const chatLines = lines.slice(startIdx, endIdx);
    
    const wrapperStart = `import { buildCognitiveContext } from "../ai/contextBuilder.js";
import { updateRelationship, tagAndStoreMemory } from "../ai/memoryUpdater.js";
import { mapRelationshipToLanguage } from "../ai/relationshipMapper.js";
import { summarizeConversation } from "../ai/summarizer.js";
import { getMoodLabel } from "../ai/moods.js";
import { executeAgenticTask } from "../services/agentService.js";
import { routeModel, buildHybridOptions } from "../modelRouter.js";
import { semanticSearch, getWebContext } from "../services/ragService.js";

export function setupChatRoutes(app, context) {
  const {
    UTILITY_MODEL,
    sessions,
    personas,
    relationships,
    scenarios,
    addLog,
    saveSessionToDisk,
    ensureSession,
    resolvePersona,
    buildPersonaSystemPrompt,
    generateViaComfyUI,
    _comfyFallback
  } = context;
`;

    const wrapperEnd = `\n}\n`;

    fs.writeFileSync(chatControllerFile, wrapperStart + chatLines.join('\n') + wrapperEnd);
    console.log("Wrote controllers/chatController.js");

    // Replace in server.js
    const importStatement = `import { setupChatRoutes } from "./controllers/chatController.js";\n`;
    
    // Add import right after setupDatabaseRoutes
    const dbImportIdx = lines.findIndex(l => l.includes('import { setupDatabaseRoutes } from "./controllers/databaseController.js";'));
    if (dbImportIdx !== -1) {
        lines.splice(dbImportIdx + 1, 0, importStatement.trim());
    }

    const newStartIdx = lines.findIndex(l => l.includes('// ------------------ CHAT ENDPOINTS (single + parallel) ------------------'));
    const newEndIdx = lines.findIndex(l => l.includes('// ------------------ VOX: Vocal Integration (STT & TTS) ------------------'));

    const replacement = `// Register extracted CHAT routes
setupChatRoutes(app, {
  UTILITY_MODEL,
  sessions,
  personas,
  relationships,
  scenarios,
  addLog,
  saveSessionToDisk,
  ensureSession,
  resolvePersona,
  buildPersonaSystemPrompt,
  generateViaComfyUI,
  _comfyFallback
});
`;
    lines.splice(newStartIdx, newEndIdx - newStartIdx, replacement);

    fs.writeFileSync(serverFile, lines.join('\n'));
    console.log("Updated server.js");
} else {
    console.log("Could not find bounds");
}
