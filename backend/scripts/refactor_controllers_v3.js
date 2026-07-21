import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllersDir = path.join(__dirname, '..', 'controllers');
const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('Controller.js'));

files.forEach(file => {
    let content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
    
    // Convert (req, res) to async (req, res) where needed
    content = content.replace(/(app\.(?:get|post|delete|put|patch)\([^,]+,\s*(?:upload\.[a-zA-Z]+\([^)]+\),\s*)?)\(req,\s*res\)\s*=>/g, '$1async (req, res) =>');
    
    // ensureSession(id) -> await ensureSession(id)
    content = content.replace(/const (\w+) = ensureSession\(([^)]+)\);/g, 'const $1 = await ensureSession($2);');
    content = content.replace(/ensureSession\(([^)]+)\);(?!(\s*\.))/g, 'await ensureSession($1);'); // don't replace if it's already awaited somehow

    // saveSessionToDisk(sessionId) -> await saveSessionToDisk(s) if we can confidently guess 's'
    // Actually, let's just make saveSessionToDisk accept the session object `s`.
    content = content.replace(/saveSessionToDisk\(([^)]+)\);/g, 'await saveSessionToDisk(s);');

    fs.writeFileSync(path.join(controllersDir, file), content, 'utf8');
    console.log(`✅ Refactored async endpoints in ${file}`);
});
