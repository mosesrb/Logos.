/**
 * systemService.js
 * System hardware telemetry: CPU, RAM, VRAM (via nvidia-smi + systeminformation).
 * Also exposes model-level performance metrics tracking helpers.
 */

import { createRequire } from "module";
import { promisify } from "util";
import { exec } from "child_process";

const requireCJS = createRequire(import.meta.url);
const execAsync = promisify(exec);

// systeminformation is CJS-only
const si = requireCJS("systeminformation");

// ─── System Stats ─────────────────────────────────────────────────────────────

/**
 * Executes a promise with a timeout.
 */
function withTimeout(promise, ms, defaultValue) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`?? TELEMETRY_TIMEOUT: Probe exceeded ${ms}ms. Returning fallback.`);
      resolve(defaultValue);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/**
 * Gather CPU, RAM, and VRAM stats using isolated, timeout-guarded probes.
 * @returns {Promise<{cpu: number, ram: number, vram: number, details: object}>}
 */
export async function getSystemStats() {
  // Use isolated probes to prevent one hang from blocking others
  const cpuPromise = si.currentLoad().catch(() => ({ currentLoad: 0 }));
  const memPromise = si.mem().catch(() => ({ active: 0, total: 1 }));
  const graphicsPromise = si.graphics().catch(() => ({ controllers: [] }));

  const [cpu, mem, graphics] = await Promise.all([
    withTimeout(cpuPromise, 1500, { currentLoad: 0 }),
    withTimeout(memPromise, 1500, { active: 0, total: 1 }),
    withTimeout(graphicsPromise, 2500, { controllers: [] }),
  ]);

  let vramUsed = 0;
  let vramTotal = 0;

  // Prefer nvidia-smi for accurate VRAM on Windows, but guard it heavily
  try {
    const nvidiaPromise = execAsync(
      "nvidia-smi --query-gpu=memory.total,memory.used --format=csv,noheader,nounits"
    );
    const { stdout } = await withTimeout(nvidiaPromise, 2000, { stdout: "" });
    
    if (stdout && stdout.trim()) {
      const parts = stdout.split(",").map((s) => parseInt(s.trim()));
      if (parts.length >= 2 && !isNaN(parts[0])) {
        vramTotal = parts[0];
        vramUsed = parts[1];
      }
    }
  } catch {
    // Fallback to systeminformation data captured earlier
    if (graphics?.controllers?.length > 0) {
      const g = graphics.controllers.find((c) => c.vram > 0) || graphics.controllers[0];
      vramTotal = g.vram || 0;
      vramUsed = g.vramUsage || 0;
    }
  }

  return {
    cpu: Math.round(cpu.currentLoad || 0),
    ram: mem.total > 0 ? Math.round((mem.active / mem.total) * 100) : 0,
    vram: vramTotal ? Math.min(100, Math.round((vramUsed / vramTotal) * 100)) : 0,
    details: {
      memTotal: (mem.total / 1024 / 1024 / 1024).toFixed(1) + "GB",
      memUsed: (mem.active / 1024 / 1024 / 1024).toFixed(1) + "GB",
      gpuName: graphics?.controllers?.[0]?.model || "N/A",
    },
  };
}

// ─── Model Metrics ────────────────────────────────────────────────────────────

/**
 * In-memory store for per-model performance metrics.
 * Tracks total calls, cumulative latency, and heavy-model concurrency.
 */
export const modelMetricsStore = {
  metrics: {},       // { [modelId]: { calls, totalMs } }
  activeHeavy: 0,    // Count of concurrently running heavy (13B+) models

  record(modelId, elapsedMs) {
    if (!this.metrics[modelId]) {
      this.metrics[modelId] = { calls: 0, totalMs: 0 };
    }
    this.metrics[modelId].calls++;
    this.metrics[modelId].totalMs += elapsedMs;
  },

  snapshot() {
    const out = {};
    for (const [id, m] of Object.entries(this.metrics)) {
      out[id] = {
        calls: m.calls,
        avgMs: m.calls > 0 ? Math.round(m.totalMs / m.calls) : 0,
        totalMs: m.totalMs,
      };
    }
    return out;
  },
};
