import fs from 'fs';

const serverFile = 'server.js';
const extraControllerFile = 'controllers/extraController.js';

let content = fs.readFileSync(serverFile, 'utf8');
const lines = content.split('\n');

const startIdx = lines.findIndex(l => l.includes('// ------------------ VOX: Vocal Integration (STT & TTS) ------------------'));
const endIdx = lines.findIndex(l => l.includes('// ------------------ GLOBAL ERROR HANDLING ------------------'));

if (startIdx !== -1 && endIdx !== -1) {
    const chunkLines = lines.slice(startIdx, endIdx);
    
    const wrapperStart = `import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import { pipeline } from "stream/promises";

import { routeModel } from "../modelRouter.js";
import { getMoodLabel } from "../ai/moods.js";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

export function setupExtraRoutes(app, context) {
  const {
    UTILITY_MODEL,
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
    TTS_DIR,
    generateViaComfyUI,
    _comfyFallback
  } = context;
`;

    const wrapperEnd = `\n}\n`;

    fs.writeFileSync(extraControllerFile, wrapperStart + chunkLines.join('\n') + wrapperEnd);
    console.log("Wrote controllers/extraController.js");

    // Replace in server.js
    const importStatement = `import { setupExtraRoutes } from "./controllers/extraController.js";\n`;
    
    // Add import right after setupAppRoutes
    const appImportIdx = lines.findIndex(l => l.includes('import { setupAppRoutes } from "./controllers/appController.js";'));
    if (appImportIdx !== -1) {
        lines.splice(appImportIdx + 1, 0, importStatement.trim());
    }

    const newStartIdx = lines.findIndex(l => l.includes('// ------------------ VOX: Vocal Integration (STT & TTS) ------------------'));
    const newEndIdx = lines.findIndex(l => l.includes('// ------------------ GLOBAL ERROR HANDLING ------------------'));

    const replacement = `// Register extracted Extra (VOX, Memory, Settings, Agents) routes
setupExtraRoutes(app, {
  UTILITY_MODEL,
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
  TTS_DIR,
  generateViaComfyUI,
  _comfyFallback
});
`;
    lines.splice(newStartIdx, newEndIdx - newStartIdx, replacement);
    
    // Remove the multer upload declaration if it was present above
    const cleanLines = lines.join('\n').replace(/const upload = multer\(\{[\s\S]*?\}\);/, '');

    fs.writeFileSync(serverFile, cleanLines);
    console.log("Updated server.js");
} else {
    console.log("Could not find bounds");
}
