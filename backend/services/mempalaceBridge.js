/**
 * mempalaceBridge.js
 * Phase 1 — Node.js ↔ Python CLI bridge for MemPalace.
 *
 * All communication happens via child_process.spawn so we get
 * proper streaming and exit-code handling without a REST server.
 *
 * Key contract:
 *   - PALACE_DIR   – source of truth, inside the project (portable)
 *   - Every function is async and returns a { ok, data, error } envelope
 *   - Failures are soft (logged, never crash the Express server)
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Palace path ─────────────────────────────────────────────────────────────
export const PALACE_DIR = path.resolve(
  __dirname,
  "../data/mempalace"
);

// Temp dir for transient conversation files fed to `mine`
const TEMP_CONVOS_DIR = path.join(PALACE_DIR, "_temp_convos");

// Ensure directories exist on module load
if (!fs.existsSync(PALACE_DIR))       fs.mkdirSync(PALACE_DIR, { recursive: true });
if (!fs.existsSync(TEMP_CONVOS_DIR))  fs.mkdirSync(TEMP_CONVOS_DIR, { recursive: true });

let daemonProc = null;
let requestQueue = [];

function getDaemon() {
  if (daemonProc) return daemonProc;
  console.log("🏛️  PALACE: Starting persistent Python daemon...");
  daemonProc = spawn("python", ["daemon.py"], {
    cwd: __dirname,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }
  });
  
  const rl = readline.createInterface({ input: daemonProc.stdout });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const res = JSON.parse(line);
      const req = requestQueue.shift();
      if (req) {
        clearTimeout(req.timer);
        req.resolve(res);
      }
    } catch (e) {
      console.warn("🏛️  PALACE unparseable output:", line);
    }
  });
  
  daemonProc.stderr.on('data', (d) => {
    console.warn(`🏛️  PALACE DAEMON ERR: ${d.toString()}`);
  });
  
  daemonProc.on('close', () => {
    daemonProc = null;
    requestQueue.forEach(req => req.resolve({ ok: false, error: "Daemon closed", stderr: "Daemon closed", stdout: "" }));
    requestQueue = [];
  });
  
  return daemonProc;
}

export function runMempalace(args, timeout = 30_000, stdinPayload = null) {
  return new Promise((resolve) => {
    const proc = getDaemon();
    
    let timer;
    if (timeout > 0) {
      timer = setTimeout(() => {
        const idx = requestQueue.findIndex(r => r.timer === timer);
        if (idx !== -1) requestQueue.splice(idx, 1);
        resolve({ ok: false, stderr: `[TIMEOUT after ${timeout}ms]`, stdout: "" });
      }, timeout);
    }
    
    requestQueue.push({ resolve, timer });
    
    // Format message and ensure no newlines inside JSON structure break readline
    const msg = JSON.stringify({
      args: ["--palace", PALACE_DIR, ...args],
      stdinPayload: stdinPayload
    });
    
    proc.stdin.write(msg + "\\n");
  });
}

// ─── status ──────────────────────────────────────────────────────────────────
/**
 * Get palace overview (wings, rooms, drawer counts).
 * @returns {Promise<{ ok: boolean, text: string }>}
 */
export async function palaceStatus() {
  const res = await runMempalace(["status"]);
  return { ok: res.ok, text: res.stdout || res.stderr };
}

// ─── mine ────────────────────────────────────────────────────────────────────
/**
 * Index a block of conversation text into a named Wing.
 *
 * We write the text to a temp `.txt` file then point `mine` at its
 * parent directory so MemPalace can classify + store it automatically.
 *
 * @param {string} text      Raw conversation text (turn-by-turn).
 * @param {string} wing      Wing/persona slug  e.g. "aria", "driftwood"
 * @param {string} agentName Human-readable label for the drawer (e.g. "Nexus")
 */
export async function mineConversation(text, wing, agentName = "Nexus") {
  if (!text || text.trim().length < 30) {
    return { ok: false, error: "Text too short to mine." };
  }

  // Sanitise wing name for filesystem
  const safeWing = wing.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

  try {
    const res = await runMempalace([
      "mine", "-", // "-" signifies read from stdin
      "--mode",  "convos",
      "--wing",  safeWing,
      "--agent", agentName,
      "--extract", "exchange"
    ], 60_000, text);

    return { ok: res.ok, wing: safeWing, details: res.stdout };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── search ──────────────────────────────────────────────────────────────────
/**
 * Semantic search across a Wing (or all wings).
 * @param {string}  query      Natural-language search query.
 * @param {string}  wing       Optional wing slug to scope the search.
 * @param {number}  results    Max results to return (default 5).
 * @returns {Promise<{ ok: boolean, results: string[] }>}
 */
export async function searchPalace(query, wing = null, results = 5) {
  if (!query) return { ok: false, results: [] };

  const args = ["search", query, "--results", String(results)];
  if (wing) {
    args.push("--wing", wing.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
  }

  const res = await runMempalace(args, 20_000);

  // MemPalace outputs one result per line — normalise to array
  const lines = res.stdout
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 10);

  return { ok: res.ok, results: lines };
}

// ─── wake-up ─────────────────────────────────────────────────────────────────
/**
 * Load the AAAK-compressed Layer-0 + Layer-1 context for a Wing.
 * This is injected into the system prompt so the persona "wakes up"
 * with its full identity and key facts intact.
 *
 * @param {string} wing  Optional wing slug.
 * @returns {Promise<{ ok: boolean, context: string }>}
 */
export async function wakeUpWing(wing = null) {
  const args = ["wake-up"];
  if (wing) {
    args.push("--wing", wing.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
  }

  const res = await runMempalace(args, 20_000);

  // If palace is empty (first run) return a graceful empty string
  const context = res.ok ? res.stdout : "";
  return { ok: res.ok, context };
}

// ─── Utility: slug a persona name to a stable wing key ───────────────────────
/**
 * Convert a persona name (or ID) to a stable wing slug.
 * "Aria Bot" → "aria_bot" | "persona-driftwood" → "persona_driftwood"
 */
export function toWingSlug(nameOrId = "assistant") {
  return nameOrId.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
