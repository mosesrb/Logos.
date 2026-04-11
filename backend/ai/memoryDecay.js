/**
 * memoryDecay.js
 * Implements a simple decay function to reduce the importance of memories over time.
 */

/**
 * Applies decay to a set of memories.
 * @param {Object[]} memories - Array of memory objects.
 * @param {number} decayRate - Rate of decay (0 to 1).
 * @returns {Object[]} Processed memories.
 */
export function applyDecay(memories, decayRate = 0.05) {
  return memories.map(m => {
    const importance = (m.importance || 0.5) - decayRate;
    return {
      ...m,
      importance: Math.max(0, importance)
    };
  }).filter(m => m.importance > 0.1); // Filter out "forgotten" memories
}
