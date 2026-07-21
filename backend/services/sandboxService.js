import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const execFileAsync = promisify(execFile);

const APP_ROOT = process.cwd();
const SANDBOX_DIR = path.resolve(APP_ROOT, "uploads", "sandbox");

class SandboxService {
    /**
     * Executes code securely using a disposable Docker container.
     * @param {string} code The source code to run
     * @param {string} language 'python', 'javascript', or 'json'
     * @param {number} timeoutMs Max execution time in milliseconds
     * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, error?: string}>}
     */
    async executeInSandbox(code, language, timeoutMs = 15000) {
        if (language === 'json') {
            try {
                JSON.parse(code);
                return { success: true, stdout: "Valid JSON" };
            } catch (e) {
                return { success: false, stderr: e.message };
            }
        }

        const runId = uuidv4();
        const runDir = path.join(SANDBOX_DIR, runId);
        
        try {
            await fs.mkdir(runDir, { recursive: true });
        } catch (e) {
            return { success: false, error: "Failed to create sandbox directory: " + e.message };
        }

        let filename, dockerImage, entryCommand;
        
        if (language === 'python') {
            filename = 'script.py';
            dockerImage = 'python:3.11-alpine';
            entryCommand = 'python3';
        } else if (language === 'javascript' || language === 'js') {
            filename = 'script.js';
            dockerImage = 'node:20-alpine';
            entryCommand = 'node';
        } else {
            await this.cleanup(runDir);
            return { success: false, error: `Unsupported language: ${language}` };
        }

        const scriptPath = path.join(runDir, filename);
        await fs.writeFile(scriptPath, code, 'utf8');

        // Note: For Windows Docker Desktop, volume mounting expects Windows paths to be converted
        // or properly handled. We'll use the standard mount format.
        const dockerArgs = [
            'run',
            '--rm',                     // Remove container after run
            '--network', 'none',        // Disable network access
            '--memory', '256m',         // Memory limit
            '--cpus', '0.5',            // CPU limit
            '-v', `${scriptPath}:/app/${filename}:ro`, // Mount file read-only
            '-w', '/app',               // Working directory
            dockerImage,
            entryCommand,
            filename
        ];

        try {
            const { stdout, stderr } = await execFileAsync('docker', dockerArgs, { 
                timeout: timeoutMs,
                maxBuffer: 1024 * 1024 // 1MB output limit
            });
            return { success: true, stdout, stderr };
        } catch (err) {
            if (err.killed) {
                return { success: false, error: `Execution timed out after ${timeoutMs}ms.` };
            }
            return { 
                success: false, 
                error: "Execution Failed",
                stderr: err.stderr || err.message,
                stdout: err.stdout
            };
        } finally {
            await this.cleanup(runDir);
        }
    }

    async cleanup(dirPath) {
        try {
            await fs.rm(dirPath, { recursive: true, force: true });
        } catch (e) {
            console.error(`Failed to cleanup sandbox directory ${dirPath}:`, e);
        }
    }
}

export default new SandboxService();
