import fs from 'fs';

const serverFile = 'server.js';
const appControllerFile = 'controllers/appController.js';

let content = fs.readFileSync(serverFile, 'utf8');
const lines = content.split('\n');

const startIdx = lines.findIndex(l => l.includes('// ------------------ SESSION CRUD ------------------'));
const endIdx = lines.findIndex(l => l.includes('// Register extracted RAG routes'));

if (startIdx !== -1 && endIdx !== -1) {
    const chunkLines = lines.slice(startIdx, endIdx);
    
    const wrapperStart = `import fs from "fs";
import path from "path";
import crypto from "crypto";
import { promisify } from "util";
import { exec } from "child_process";
const execAsync = promisify(exec);

import { loadUserPersona, saveUserPersona } from "../ai/userPersonaStore.js";
import { TRAIT_KEYS, defaultTraits } from "../ai/personaTraits.js";
import { getMoodLabel } from "../ai/moods.js";

export function setupAppRoutes(app, context) {
  const {
    sessions,
    personas,
    scenarios,
    addLog,
    saveSessionToDisk,
    savePersonas,
    saveScenarios,
    ensureSession,
    CHATS_DIR,
    PERSONAS_DIR,
    DATA_DIR,
    PERSONA_INBOX_DIR,
    GLOBAL_IMAGE_INDEX_PATH,
    inboxUpload,
    generateViaComfyUI
  } = context;
`;

    const wrapperEnd = `\n}\n`;

    fs.writeFileSync(appControllerFile, wrapperStart + chunkLines.join('\n') + wrapperEnd);
    console.log("Wrote controllers/appController.js");

    // Replace in server.js
    const importStatement = `import { setupAppRoutes } from "./controllers/appController.js";\n`;
    
    // Add import right after setupDatabaseRoutes
    const dbImportIdx = lines.findIndex(l => l.includes('import { setupDatabaseRoutes } from "./controllers/databaseController.js";'));
    if (dbImportIdx !== -1) {
        lines.splice(dbImportIdx + 1, 0, importStatement.trim());
    }

    const newStartIdx = lines.findIndex(l => l.includes('// ------------------ SESSION CRUD ------------------'));
    const newEndIdx = lines.findIndex(l => l.includes('// Register extracted RAG routes'));

    const replacement = `// Register extracted App (Session/Persona/Scenarios) routes
setupAppRoutes(app, {
  sessions,
  personas,
  scenarios,
  addLog,
  saveSessionToDisk,
  savePersonas,
  saveScenarios,
  ensureSession,
  CHATS_DIR,
  PERSONAS_DIR,
  DATA_DIR,
  PERSONA_INBOX_DIR,
  GLOBAL_IMAGE_INDEX_PATH,
  inboxUpload,
  generateViaComfyUI
});
`;
    lines.splice(newStartIdx, newEndIdx - newStartIdx, replacement);

    fs.writeFileSync(serverFile, lines.join('\n'));
    console.log("Updated server.js");
} else {
    console.log("Could not find bounds");
}
