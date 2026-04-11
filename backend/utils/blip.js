import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let blipProcess = null;
let blipInterface = null;
let isReady = false;
let pendingRequest = null;
const requestQueue = [];

/**
 * Initializes the persistent BLIP worker.
 */
function initBlipService() {
  if (blipProcess) return;

  const pythonScript = path.join(__dirname, "..", "ai", "blip_caption.py");
  const pythonCmd = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

  console.log(`🤖 BLIP_SERVICE: Starting persistent worker using ${pythonCmd}...`);
  blipProcess = spawn(pythonCmd, [pythonScript]);

  blipInterface = readline.createInterface({
    input: blipProcess.stdout,
    terminal: false
  });

  blipInterface.on("line", (line) => {
    const output = line.trim();
    if (output === "READY") {
      console.log("✅ BLIP_SERVICE: Worker is READY.");
      isReady = true;
      processQueue();
      return;
    }

    if (pendingRequest) {
      const { resolve, reject } = pendingRequest;
      pendingRequest = null;
      if (output.startsWith("Error:")) {
        reject(new Error(output));
      } else {
        resolve(output);
      }
      processQueue();
    }
  });

  blipProcess.stderr.on("data", (data) => {
    const msg = data.toString();
    // Filter out common noise from transformers library
    if (msg.includes("tied weights") || msg.includes("unexpected keys") || msg.includes("UNEXPECTED")) {
      return; 
    }
    console.error(`❌ BLIP_SERVICE_STDERR: ${msg}`);
  });

  blipProcess.on("close", (code) => {
    console.warn(`⚠️ BLIP_SERVICE: Worker exited with code ${code}.`);
    blipProcess = null;
    isReady = false;
    if (pendingRequest) {
      pendingRequest.reject(new Error("BLIP worker crashed during request."));
      pendingRequest = null;
    }
  });
}

/**
 * Processes the next item in the queue.
 */
function processQueue() {
  if (!isReady || pendingRequest || requestQueue.length === 0) return;

  const { imagePath, resolve, reject } = requestQueue.shift();
  pendingRequest = { resolve, reject };
  
  // Send path to python stdin
  blipProcess.stdin.write(imagePath + "\n");
}

/**
 * Generates a caption for an image using the persistent BLIP service.
 * @param {string} imagePath - Absolute path to the image
 * @returns {Promise<string>} - The generated caption
 */
export async function getBlipCaption(imagePath) {
  return new Promise((resolve, reject) => {
    initBlipService();
    requestQueue.push({ imagePath, resolve, reject });
    processQueue();
    
    // Safety timeout for the specific request
    setTimeout(() => {
        if (pendingRequest && pendingRequest.resolve === resolve) {
            console.error("⚠️ BLIP_SERVICE: Request timed out.");
            reject(new Error("BLIP caption timeout (30s)"));
            pendingRequest = null;
            processQueue();
        }
    }, 45000); // 45s timeout per image
  });
}

