const readline = require('readline');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const registryPath = path.join(__dirname, '../data/model_registry.json');
const personasSeedPath = path.join(__dirname, '../data/personas.seed.json');
const personasOutputPath = path.join(__dirname, '../data/personas.json');

const models = {
    fast: [
        { id: "phi3:latest", name: "Phi-3 (Lightweight, 2GB VRAM)", size: "3.8b", tier: "fast", vram_gb: 2, description: "Fast, lightweight — ideal for simple queries." },
        { id: "qwen2.5:1.5b", name: "Qwen 2.5 1.5B (Ultra-fast, 1GB VRAM)", size: "1.5b", tier: "fast", vram_gb: 1, description: "Ultra-fast, minimal footprint." }
    ],
    smart: [
        { id: "llama3.1:8b", name: "Llama 3.1 8B (Standard, 6GB VRAM)", size: "8b", tier: "smart", vram_gb: 6, description: "Solid standard for agentic operations.", capabilities: ["agentic", "fast"] },
        { id: "gemma2:9b", name: "Gemma 2 9B (Versatile, 7GB VRAM)", size: "9b", tier: "smart", vram_gb: 7, description: "SOTA logic for mid-range GPUs.", capabilities: ["agentic", "multimodal"] }
    ],
    heavy: [
        { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B (Logic Heavy, 6GB VRAM)", size: "7b", tier: "heavy", vram_gb: 6, description: "Specialized for complex logic and coding tasks.", capabilities: ["complex_logic", "coding"] },
        { id: "hermes3:8b", name: "Hermes 3 8B (Reasoning Heavy, 6GB VRAM)", size: "8b", tier: "heavy", vram_gb: 6, description: "Excels at complex reasoning.", capabilities: ["complex_logic"] }
    ]
};

async function promptTier(tierName, options) {
    console.log(`\n=== Select ${tierName} Tier Model ===`);
    options.forEach((opt, index) => {
        console.log(`${index + 1}) ${opt.name}`);
    });
    console.log(`${options.length + 1}) Skip downloading ${tierName} tier`);
    
    while (true) {
        const answer = await question(`Select an option (1-${options.length + 1}): `);
        const choice = parseInt(answer.trim());
        if (!isNaN(choice) && choice >= 1 && choice <= options.length + 1) {
            if (choice === options.length + 1) return null;
            return options[choice - 1];
        }
        console.log("Invalid selection. Please try again.");
    }
}

async function runOllamaPull(modelId) {
    console.log(`\n>>> Downloading ${modelId} via Ollama... This may take a while depending on internet speed.`);
    return new Promise((resolve, reject) => {
        const proc = spawn('ollama', ['pull', modelId], { stdio: 'inherit', shell: true });
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Ollama pull failed with exit code ${code}`));
        });
        proc.on('error', (err) => {
            console.error(`Error executing Ollama: Make sure Ollama is installed and running.\n${err.message}`);
            resolve(); // Don't crash, just proceed
        });
    });
}

async function main() {
    console.log("\n==============================================");
    console.log("   LÓGOS AI Platform - Model Provisioning     ");
    console.log("==============================================");
    console.log("We will now download the AI models required to power the personas.");
    console.log("You can choose to download 1 model per physical tier, or skip.");
    
    try {
        const fastChoice = await promptTier("Fast", models.fast);
        const smartChoice = await promptTier("Smart", models.smart);
        const heavyChoice = await promptTier("Heavy", models.heavy);
        
        const selectedModels = [];
        if (fastChoice) selectedModels.push(fastChoice);
        if (smartChoice) selectedModels.push(smartChoice);
        if (heavyChoice) selectedModels.push(heavyChoice);
        
        rl.close();
        
        if (selectedModels.length > 0) {
            console.log(`\nPreparing to download ${selectedModels.length} models...`);
            for (const model of selectedModels) {
                try {
                    await runOllamaPull(model.id);
                } catch (err) {
                    console.error(err.message);
                }
            }
        } else {
            console.log("\nSkipped all model downloads. Assuming you have local models ready.");
        }
        
        // 1. Update model_registry.json
        console.log("\nUpdating Model Registry...");
        const registry = {
            "_schema_version": "1.1.0",
            "_updated": new Date().toISOString(),
            "models": selectedModels
        };
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        
        // 2. Generate personas.json from the seed template with correct model assignments
        console.log("Configuring Personas with selected models...");
        if (fs.existsSync(personasSeedPath)) {
            const rawPersonas = fs.readFileSync(personasSeedPath, 'utf8');
            const personasData = JSON.parse(rawPersonas);
            
            // Determine fallback models in case user skipped
            const fallbackHeavy = heavyChoice ? heavyChoice.id : (smartChoice ? smartChoice.id : (fastChoice ? fastChoice.id : "llama3.1:8b"));
            const fallbackSmart = smartChoice ? smartChoice.id : (heavyChoice ? heavyChoice.id : (fastChoice ? fastChoice.id : "llama3.1:8b"));
            const fallbackFast = fastChoice ? fastChoice.id : (smartChoice ? smartChoice.id : (heavyChoice ? heavyChoice.id : "llama3.1:8b"));
            
            const mapping = {
                "persona-default": fallbackSmart,
                "logos-architect": fallbackHeavy,
                "neon-scout": fallbackSmart,
                "aether-analyst": fallbackHeavy,
                "chronos-curator": fallbackSmart,
                "zen-guide": fallbackFast,
                "persona-axon-agent": fallbackHeavy
            };
            
            for (const persona of personasData.personas) {
                if (mapping[persona.id]) {
                    persona.model = mapping[persona.id];
                }
            }
            
            fs.writeFileSync(personasOutputPath, JSON.stringify(personasData, null, 2));
            console.log("Personas configured successfully.");
        } else {
            console.warn("personas.json not found! Skipping persona configuration.");
        }
        
        console.log("\n==============================================");
        console.log("   Setup Complete! Starting LÓGOS...          ");
        console.log("==============================================\n");
        
    } catch (e) {
        console.error("Setup exited with error:", e);
        rl.close();
    }
}

main();
