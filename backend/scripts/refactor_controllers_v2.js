import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllersDir = path.join(__dirname, '..', 'controllers');
const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('Controller.js'));

files.forEach(file => {
    let content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
    
    // Convert endpoints to async if they aren't already
    // match: app.get("/...", (req, res) => {
    // avoid: async (req, res)
    content = content.replace(/(app\.(get|post|delete|put|patch)\([^,]+,\s*(?:upload\.[a-zA-Z]+\([^)]+\),\s*)?)\(req,\s*res\)\s*=>/g, '$1async (req, res) =>');
    
    // ensureSession(id) -> await ensureSession(id)
    content = content.replace(/const (\w+) = ensureSession\(([^)]+)\);/g, 'const $1 = await ensureSession($2);');
    // direct call
    content = content.replace(/ensureSession\(([^)]+)\);/g, 'await ensureSession($1);');

    // saveSessionToDisk(sessionId) -> await saveSessionToDisk(s)
    // Wait, the controllers mostly do saveSessionToDisk(sessionId). We changed saveSessionToDisk to expect the session object `s`.
    // It's safer to change saveSessionToDisk back to taking a sessionId, so we don't have to guess the variable name.
    
    fs.writeFileSync(path.join(controllersDir, file), content, 'utf8');
    console.log(`✅ Refactored async endpoints in ${file}`);
});
