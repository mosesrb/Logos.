import fetch from 'node-fetch';

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

export async function listLocalModels() {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
        const data = await response.json();
        return data.models || [];
    } catch (error) {
        console.error("Failed to list Ollama models:", error.message);
        return [];
    }
}

export async function pullModel(modelName, onProgress) {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
            method: 'POST',
            body: JSON.stringify({ name: modelName }),
        });

        if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);

        const reader = response.body;
        reader.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const status = JSON.parse(line);
                    if (onProgress) onProgress(status);
                } catch (e) {
                    // Ignore parse errors for partial chunks
                }
            }
        });

        return new Promise((resolve, reject) => {
            reader.on('end', resolve);
            reader.on('error', reject);
        });
    } catch (error) {
        console.error("Failed to pull Ollama model:", error.message);
        throw error;
    }
}

export async function deleteModel(modelName) {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
            method: 'DELETE',
            body: JSON.stringify({ name: modelName }),
        });
        if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
        return true;
    } catch (error) {
        console.error("Failed to delete Ollama model:", error.message);
        throw error;
    }
}
