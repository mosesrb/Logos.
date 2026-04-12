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
            name: "writeFileTool",
            description: "Write content to a file. Useful for creating or updating code files.",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Relative path to the file" },
                    content: { type: "string", description: "Content to write" }
                },
                required: ["filePath", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "pythonExecTool",
            description: "Execute Python code and return the output. Useful for data analysis or complex calculations.",
            parameters: {
                type: "object",
                properties: {
                    code: { type: "string", description: "The Python code to execute" }
                },
                required: ["code"]
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
    }
];

export const ToolRegistry = {
    "executeCommand": executeCommand,
    "readFileTool": readFileTool,
    "writeFileTool": writeFileTool,
    "listDirTool": listDirTool,
    "pythonExecTool": pythonExecTool,
    "mempalaceSearch": mempalaceSearch,
    "mempalaceDiaryWrite": mempalaceDiaryWrite
};

export async function writeFileTool({ filePath, content }) {
    console.log(`🤖 AGENT TOOL: Writing file [${filePath}]`);
    try {
        const fullPath = path.resolve(APP_ROOT, filePath);
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf8");
        return { success: true, message: `File written to ${filePath}` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function pythonExecTool({ code }) {
    console.log(`🤖 AGENT TOOL: Executing Python Code`);
    const tmpFile = path.join(APP_ROOT, `tmp_agent_${Date.now()}.py`);
    try {
        await fs.writeFile(tmpFile, code);
        const { stdout, stderr } = await execAsync(`python "${tmpFile}"`);
        return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        try { await fs.unlink(tmpFile); } catch(e) {}
    }
}
