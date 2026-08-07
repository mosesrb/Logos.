import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const registryPath = path.join(__dirname, 'backend/data/model_registry.json');
const personasSeedPath = path.join(__dirname, 'backend/data/personas.seed.json');
const personasOutputPath = path.join(__dirname, 'backend/data/personas.json');

const registry = {
    "_schema_version": "1.1.0",
    "_updated": new Date().toISOString(),
    "models": []
};
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

if (fs.existsSync(personasSeedPath)) {
    const rawPersonas = fs.readFileSync(personasSeedPath, 'utf8');
    const personasData = JSON.parse(rawPersonas);
    const fallbackModel = "llama3.1:8b";
    
    for (const persona of personasData.personas) {
        persona.model = fallbackModel;
    }
    
    fs.writeFileSync(personasOutputPath, JSON.stringify(personasData, null, 2));
    console.log("Personas configured successfully.");
}
