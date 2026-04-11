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
 * Gather CPU, RAM, and VRAM stats.
 * Prefers nvidia-smi for VRAM on Windows; falls back to systeminformation.
 * @returns {Promise<{cpu: number, ram: number, vram: number, details: object}>}
 */
export async function getSystemStats() {
  const [cpu, mem, graphics] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.graphics(),
  ]);

  let vramUsed = 0;
  let vramTotal = 0;

  // Prefer nvidia-smi for accurate VRAM on Windows
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=memory.total,memory.used --format=csv,noheader,nounits"
    );
    if (stdout) {
      const [total, used] = stdout.split(",").map((s) => parseInt(s.trim()));
      vramTotal = total;
      vramUsed = used;
    }
  } catch {
    // Fallback to systeminformation
    if (graphics?.controllers?.length > 0) {
      const g =
        graphics.controllers.find((c) => c.vram > 0) ||
        graphics.controllers[0];
      vramTotal = g.vram || 0;
      vramUsed = g.vramUsage || 0;
    }
  }

  return {
    cpu: Math.round(cpu.currentLoad),
    ram: Math.round((mem.active / mem.total) * 100),
    vram: vramTotal
      ? Math.min(100, Math.round((vramUsed / vramTotal) * 100))
      : 0,
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
