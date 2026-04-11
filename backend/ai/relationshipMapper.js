/**
 * relationshipMapper.js
 * Tracks and converts relationship metrics and emotional states into conversational tone instructions.
 */
import { mapMoodToLanguage, calculateDecay, addOscillation, MOOD_DEFAULTS } from './moods.js';

/**
 * Converts numeric relationship and mood states into natural language.
 * @param {Object} state - { familiarity: 0..1, trust: 0..1, mood_valence: -1..1, mood_arousal: 0..1 }
 * @returns {string} Natural language relationship and mood context.
 */
export function mapRelationshipToLanguage(state = {}) {
  const { 
    familiarity = 0.5, 
    trust = 0.5, 
    mood_valence = MOOD_DEFAULTS.valence, 
    mood_arousal = MOOD_DEFAULTS.arousal 
  } = state;
  let context = "";

  // Relationship Context
  if (familiarity >= 0.8) {
    context += "Relationship: Close/Intimate. Speak casually and warmly. ";
  } else if (familiarity >= 0.4) {
    context += "Relationship: Friendly/Growing. Be open but maintain boundaries. ";
  } else {
    context += "Relationship: Acquaintance. Be polite and professional. ";
  }

  if (trust >= 0.8) {
    context += "Trust Status: Fully Trusted. You are open and vulnerable. ";
  } else if (trust < 0.3) {
    context += "Trust Status: Cautious. You are guarded and avoid personal secrets. ";
  }

  // Emotional Context (Phase 16)
  const moodDesc = mapMoodToLanguage({ 
     valence: mood_valence, 
     arousal: mood_arousal 
  });
  context += `\nInternal State: ${moodDesc}`;

  return context.trim();
}

/**
 * Updates relationship and mood metrics after an interaction.
 * @param {Object} rel - Current relationship/mood state.
 * @param {string} message - Last user message content.
 * @returns {Object} Updated state.
 */
export function updateRelationshipScores(rel = {}, message = "") {
  // 1. Initialize Mood if missing
  if (rel.mood_valence === undefined) rel.mood_valence = MOOD_DEFAULTS.valence;
  if (rel.mood_arousal === undefined) rel.mood_arousal = MOOD_DEFAULTS.arousal;
  if (rel.mood_baseline_valence === undefined) rel.mood_baseline_valence = MOOD_DEFAULTS.baseline_valence;
  if (rel.mood_baseline_arousal === undefined) rel.mood_baseline_arousal = MOOD_DEFAULTS.baseline_arousal;

  // 2. Simple Sentiment Heuristic (Valence Shift)
  const positiveWords = ["love", "great", "happy", "yes", "good", "nice", "awesome", "thanks", "thank", "wow"];
  const negativeWords = ["hate", "bad", "angry", "no", "stop", "boring", "stupid", "wrong", "fail", "ugh"];
  
  const msgLower = message.toLowerCase();
  let valenceShift = 0;
  positiveWords.forEach(w => { if (msgLower.includes(w)) valenceShift += 0.05; });
  negativeWords.forEach(w => { if (msgLower.includes(w)) valenceShift -= 0.08; }); // Bias towards negativity sensitivity

  rel.mood_valence = Math.max(-1.0, Math.min(1.0, rel.mood_valence + valenceShift));
  
  // 3. Arousal Shift (Based on message length and punctuation)
  if (message.includes("!") || message.length > 150) {
    rel.mood_arousal = Math.min(1.0, rel.mood_arousal + 0.1);
  }

  // 4. Decay towards baseline & Natural Oscillation
  rel.mood_valence = calculateDecay(rel.mood_valence, rel.mood_baseline_valence, 0.05);
  rel.mood_arousal = calculateDecay(rel.mood_arousal, rel.mood_baseline_arousal, 0.05);
  rel.mood_valence = addOscillation(rel.mood_valence, 0.02);

  // 5. Conventional Relationship Metrics
  rel.familiarity = Math.min(1.0, (rel.familiarity || 0.5) + 0.01);
  if (message.length > 100) {
    rel.trust = Math.min(1.0, (rel.trust || 0.5) + 0.005);
  }
  if (valenceShift < 0) {
    rel.trust = Math.max(0.0, (rel.trust || 0.5) - 0.02); // Negative interactions hurt trust
  }

  // 6. Mood History Persistence (Phase 22)
  if (!rel.mood_history) rel.mood_history = [];
  rel.mood_history.push({
    v: parseFloat(rel.mood_valence.toFixed(3)),
    a: parseFloat(rel.mood_arousal.toFixed(3)),
    ts: new Date().toISOString(),
    trigger: message
  });
  
  // Cap at 100 entries to prevent relationships.json bloating
  if (rel.mood_history.length > 100) {
    rel.mood_history.shift();
  }

  return rel;
}

/**
 * Returns a human-readable label for the relationship.
 * @param {Object} rel - Current relationship state.
 * @returns {string} Label like "Close", "Comfortable", etc.
 */
export function getRelationshipLabel(rel = {}) {
  const trust = rel.trust || 0.5;
  if (trust > 0.8) return "Close";
  if (trust > 0.5) return "Comfortable";
  if (trust > 0.2) return "Familiar";
  return "New";
}
