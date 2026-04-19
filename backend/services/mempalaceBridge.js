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

// ─── Core runner ─────────────────────────────────────────────────────────────
/**
 * Execute a mempalace subcommand via Python.
 * @param {string[]} args  e.g. ['search', 'what is the user building', '--wing', 'aria']
 * @param {number}   timeout  ms before we kill the process (default 30s)
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string }>}
 */
export function runMempalace(args, timeout = 30_000) {
  return new Promise((resolve) => {
    const fullArgs = ["-m", "mempalace", "--palace", PALACE_DIR, ...args];
    console.log(`🏛️  PALACE: python ${fullArgs.join(" ")}`);

    const proc = spawn("python", fullArgs, {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, stdout, stderr: `[TIMEOUT after ${timeout}ms]` });
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      if (!ok) console.warn(`🏛️  PALACE warn (exit ${code}): ${stderr.trim().slice(0, 200)}`);
      resolve({ ok, stdout: stdout.trim(), stderr: stderr.trim() });
    });
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

  // Write to a uniquely named temp file inside a per-wing sub-directory
  const wingTempDir = path.join(TEMP_CONVOS_DIR, safeWing);
  if (!fs.existsSync(wingTempDir)) fs.mkdirSync(wingTempDir, { recursive: true });

  const filename = `convo_${Date.now()}.txt`;
  const filePath = path.join(wingTempDir, filename);
  fs.writeFileSync(filePath, text, "utf8");

  try {
    const res = await runMempalace([
      "mine", wingTempDir,
      "--mode",  "convos",
      "--wing",  safeWing,
      "--agent", agentName,
      "--extract", "exchange"
    ], 60_000);

    // Clean up temp file after successful mining
    if (res.ok && fs.existsSync(filePath)) fs.unlinkSync(filePath);

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
