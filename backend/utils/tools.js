import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { searchPalace, mineConversation, toWingSlug } from "../services/mempalaceBridge.js";

import { resolveSafePath } from "./pathResolver.js";

const execFileAsync = promisify(execFile);

// All agent filesystem operations are rooted in the backend runtime workspace.
const APP_ROOT = process.cwd();
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export async function readFileTool({ filePath }) {
    console.log(`🤖 AGENT TOOL: Reading file [${filePath}]`);
    try {
        const fullPath = resolveSafePath(APP_ROOT, filePath);
        const data = await fs.readFile(fullPath, "utf8");
        return { success: true, content: data };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function listDirTool({ dirPath = "." }) {
    console.log(`🤖 AGENT TOOL: Listing directory [${dirPath}]`);
    try {
        const fullPath = resolveSafePath(APP_ROOT, dirPath);
        const files = await fs.readdir(fullPath);
        return { success: true, files };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function mempalaceSearch({ query, wing, results = 5 }) {
    console.log(`🤖 AGENT TOOL: MemPalace Search [${query}] in wing [${wing || 'all'}]`);
    try {
        const res = await searchPalace(query, wing, results);
        return { success: res.ok, results: res.results, error: res.ok ? null : "Search failed" };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function mempalaceDiaryWrite({ text, wing, agentName = "Nexus" }) {
    console.log(`🤖 AGENT TOOL: MemPalace Diary Write for wing [${wing}]`);
    try {
        const res = await mineConversation(text, wing, agentName);
        return { success: res.ok, details: res.details, error: res.ok ? null : res.error };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function agentWriteFile({ filename, content, sessionId }) {
    if (!sessionId) return { success: false, error: "Missing sessionId scope." };
    if (!filename || !content) return { success: false, error: "Missing filename or content." };
    if (typeof sessionId !== "string" || !SAFE_SESSION_ID.test(sessionId)) {
        return { success: false, error: "Security Exception: Invalid session scope." };
    }
    
    console.log(`🤖 AGENT TOOL: Writing file [${filename}] for session [${sessionId}]`);
    try {
        const UPLOADS_DIR = path.resolve(APP_ROOT, "uploads");
        const agentDir = path.resolve(UPLOADS_DIR, sessionId, "agent_files");

        // Security check for path traversal
        const requestedPath = resolveSafePath(agentDir, filename);

        const targetDir = path.dirname(requestedPath);
        await fs.mkdir(targetDir, { recursive: true });

        // Versioning logic
        let finalFilename = path.basename(filename);
        let finalPath = requestedPath;
        let counter = 1;
        while (true) {
            try {
                await fs.access(finalPath);
                counter++;
                const ext = path.extname(filename);
                const base = path.basename(filename, ext);
                finalFilename = `${base}_v${counter}${ext}`;
                finalPath = path.join(targetDir, finalFilename);
            } catch (e) {
                break; // File does not exist, ready to write
            }
        }

        await fs.writeFile(finalPath, content, "utf8");

        // Syntax checking logic
        const ext = path.extname(finalFilename).toLowerCase();
        try {
            if (ext === '.py') {
                await execFileAsync("python", ["-m", "py_compile", finalPath]);
            } else if (ext === '.js') {
                await execFileAsync("node", ["--check", finalPath]);
            } else if (ext === '.json') {
                JSON.parse(content);
            }
        } catch (syntaxErr) {
            // Delete invalid file to prevent broken artifacts
            await fs.unlink(finalPath).catch(() => {});
            return { 
                success: false, 
                error: `Syntax Error in ${filename}. Please correct your code and call agentWriteFile again.\nDetails:\n${syntaxErr.stderr || syntaxErr.message}` 
            };
        }

        return { success: true, saved_as: finalFilename, message: `File saved successfully and passed syntax check.` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Ollama Tool Schema export mapped identically to the OpenAI schema spec
// Enriched with Phase 4 manifest properties for capability service
export const agentToolsSchema = [
    {
        type: "function",
        function: {
            name: "readFileTool",
            description: "Read the UTF-8 text contents of a file to analyze code.",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Relative path to the file" }
                },
                required: ["filePath"]
            },
            // Phase 4 Manifest properties
            manifest: {
                requiresApproval: false,
                sideEffect: "read",
                timeoutMs: 5000,
                quota: 100
            }
        }
    },
    {
        type: "function",
        function: {
            name: "listDirTool",
            description: "List all files and sub-folders in a specific directory.",
            parameters: {
                type: "object",
                properties: {
                    dirPath: { type: "string", description: "Relative directory path. E.g., '.' or 'frontend/src'" }
                }
            },
            manifest: {
                requiresApproval: false,
                sideEffect: "read",
                timeoutMs: 5000,
                quota: 100
            }
        }
    },
    {
        type: "function",
        function: {
            name: "mempalaceSearch",
            description: "Semantic search across MemPalace memory wings. Use this to find relevant past conversations or facts.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Natural language search query" },
                    wing: { type: "string", description: "Optional wing name (persona slug) to limit search" },
                    results: { type: "number", description: "Number of results to return (default 5)" }
                },
                required: ["query"]
            },
            manifest: {
                requiresApproval: false,
                sideEffect: "read",
                timeoutMs: 10000,
                quota: 50
            }
        }
    },
    {
        type: "function",
        function: {
            name: "mempalaceDiaryWrite",
            description: "Write important discoveries or events to a persona's long-term memory diary. This ensures the facts are preserved beyond the current session.",
            parameters: {
                type: "object",
                properties: {
                    text: { type: "string", description: "The content to remember (facts, observations, or summaries)" },
                    wing: { type: "string", description: "The persona wing slug this memory belongs to" }
                },
                required: ["text", "wing"]
            },
            manifest: {
                requiresApproval: true,
                sideEffect: "write",
                timeoutMs: 15000,
                quota: 20
            }
        }
    },
    {
        type: "function",
        function: {
            name: "agentWriteFile",
            description: "Write a complete code file to the agent workspace. Automatically checks syntax for Python, JS, and JSON before saving. If it returns a syntax error, YOU MUST rewrite it correctly.",
            parameters: {
                type: "object",
                properties: {
                    filename: { type: "string", description: "Name of the file including extension (e.g. index.py, script.js)" },
                    content: { type: "string", description: "The full UTF-8 source code content to write" }
                },
                required: ["filename", "content"]
            },
            manifest: {
                requiresApproval: true,
                sideEffect: "write",
                timeoutMs: 30000,
                quota: 10
            }
        }
    }
];

export const ToolRegistry = {
    "readFileTool": readFileTool,
    "listDirTool": listDirTool,
    "mempalaceSearch": mempalaceSearch,
    "mempalaceDiaryWrite": mempalaceDiaryWrite,
    "agentWriteFile": agentWriteFile
};

export function validateToolArgs(funcName, args) {
    const spec = agentToolsSchema.find(t => t.function.name === funcName);
    if (!spec) return { valid: false, error: `Tool ${funcName} not found in schema.` };
    
    const params = spec.function.parameters;
    if (!params) return { valid: true };
    
    if (params.required) {
        for (const req of params.required) {
            if (args[req] === undefined || args[req] === null) {
                return { valid: false, error: `Missing required parameter: ${req}` };
            }
        }
    }
    
    if (params.properties) {
        for (const [key, value] of Object.entries(args)) {
            const propSpec = params.properties[key];
            if (propSpec) {
                if (propSpec.type === "string" && typeof value !== "string") {
                    return { valid: false, error: `Parameter '${key}' must be a string.` };
                }
                if (propSpec.type === "number" && typeof value !== "number") {
                    return { valid: false, error: `Parameter '${key}' must be a number.` };
                }
                if (propSpec.type === "boolean" && typeof value !== "boolean") {
                    return { valid: false, error: `Parameter '${key}' must be a boolean.` };
                }
            }
        }
    }
    
    return { valid: true };
}

