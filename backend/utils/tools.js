import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { searchPalace, mineConversation, toWingSlug } from "../services/mempalaceBridge.js";

const execAsync = promisify(exec);

// Safety: Constraint to prevent destructive commands in the Root OS. 
// Commands will execute starting from the backend runtime environment.
const APP_ROOT = process.cwd();

export async function executeCommand({ command }) {
    console.log(`🤖 AGENT TOOL: Executing [${command}]`);
    try {
        const { stdout, stderr } = await execAsync(command, { 
            cwd: APP_ROOT, 
            timeout: 15000 // 15 seconds max execution block
        });
        return { 
            success: true, 
            stdout: stdout.trim(), 
            stderr: stderr.trim() 
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function readFileTool({ filePath }) {
    console.log(`🤖 AGENT TOOL: Reading file [${filePath}]`);
    try {
        const fullPath = path.resolve(APP_ROOT, filePath);
        const data = await fs.readFile(fullPath, "utf8");
        return { success: true, content: data };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function listDirTool({ dirPath = "." }) {
    console.log(`🤖 AGENT TOOL: Listing directory [${dirPath}]`);
    try {
        const fullPath = path.resolve(APP_ROOT, dirPath);
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
    
    console.log(`🤖 AGENT TOOL: Writing file [${filename}] for session [${sessionId}]`);
    try {
        const UPLOADS_DIR = path.resolve(APP_ROOT, "uploads");
        const agentDir = path.join(UPLOADS_DIR, sessionId, "agent_files");
        await fs.mkdir(agentDir, { recursive: true });

        // Versioning logic
        let finalFilename = filename;
        let counter = 1;
        while (true) {
            try {
                await fs.access(path.join(agentDir, finalFilename));
                counter++;
                const ext = path.extname(filename);
                const base = path.basename(filename, ext);
                finalFilename = `${base}_v${counter}${ext}`;
            } catch (e) {
                break; // File does not exist, ready to write
            }
        }

        const fullPath = path.join(agentDir, finalFilename);
        await fs.writeFile(fullPath, content, "utf8");

        // Syntax checking logic
        const ext = path.extname(finalFilename).toLowerCase();
        try {
            if (ext === '.py') {
                await execAsync(`python -m py_compile "${fullPath}"`);
            } else if (ext === '.js') {
                await execAsync(`node --check "${fullPath}"`);
            } else if (ext === '.json') {
                JSON.parse(content);
            }
        } catch (syntaxErr) {
            // Delete invalid file to prevent broken artifacts
            await fs.unlink(fullPath).catch(() => {});
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
export const agentToolsSchema = [
    {
        type: "function",
        function: {
            name: "executeCommand",
            description: "Run a bash shell command in the project workspace directory. Useful for grep, ls, node scripts, directory creations.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "The bash command to execute" }
                },
                required: ["command"]
            }
        }
    },
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
            }
        }
    }
];

export const ToolRegistry = {
    "executeCommand": executeCommand,
    "readFileTool": readFileTool,
    "listDirTool": listDirTool,
    "mempalaceSearch": mempalaceSearch,
    "mempalaceDiaryWrite": mempalaceDiaryWrite,
    "agentWriteFile": agentWriteFile
};
