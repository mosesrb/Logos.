/**
 * memoryUpdater.js
 * Updates relationship states and handles conversation indexing for Phase 14.
 */

import { updateRelationshipScores } from './relationshipMapper.js';

/**
 * Updates relationship metrics after an interaction.
 * @param {Object} currentState - { familiarity: 0..1, trust: 0..1 }
 * @param {string} userMessage - The last user message content.
 * @returns {Object} Updated state.
 */
export function updateRelationship(currentState = { familiarity: 0.5, trust: 0.5 }, userMessage = "") {
  return updateRelationshipScores(currentState, userMessage);
}

/**
 * Placeholder for memory tagging and persistence.
 * @param {string} sessionId - Current session.
 * @param {string} text - Message text.
 * @param {string} intent - Detected intent.
 * @param {Object} mood - { valence, arousal }
 */
export async function tagAndStoreMemory(sessionId, text, intent, mood = {}) {
  // Phase 16: Emotional context tagging
  const emotionalContext = mood.valence !== undefined ? `[Mood: v=${mood.valence.toFixed(2)}, a=${mood.arousal.toFixed(2)}]` : "";
  console.log(`🧠 MEMORY: Tagging memory for session ${sessionId} as ${intent} ${emotionalContext}`);
  
  // In a real implementation, this would be pushed to global_episodic_memory.json
  // with the emotional metadata attached to the vector embedding.
}
