/**
 * moods.js
 * Definitions and logic for the Valence-Arousal emotional model.
 */

export const MOOD_DEFAULTS = {
  valence: 0.0, // -1.0 (Very Negative) to 1.0 (Very Positive)
  arousal: 0.5, // 0.0 (Low Energy/Calm) to 1.0 (High Energy/Excited)
  baseline_valence: 0.0,
  baseline_arousal: 0.5,
  volatility: 0.1, // How much the mood oscillates naturally
};

/**
 * Maps V-A coordinates to a discrete emotional label.
 */
export function getMoodLabel(valence, arousal) {
  if (valence > 0.5) {
    return arousal > 0.6 ? "Excited/Joyful" : "Peaceful/Content";
  } else if (valence < -0.5) {
    return arousal > 0.6 ? "Angry/Frustrated" : "Sad/Depressed";
  } else {
    if (arousal > 0.7) return "Anxious/Tense";
    if (arousal < 0.3) return "Bored/Sleepy";
    return "Neutral";
  }
}

/**
 * Translates mood state into natural language for system prompt injection.
 */
export function mapMoodToLanguage(state = MOOD_DEFAULTS) {
  const label = getMoodLabel(state.valence, state.arousal);
  const intensity = state.arousal > 0.8 ? "intense" : state.arousal > 0.4 ? "moderate" : "subtle";
  
  let description = `Your current mood is ${label.toLowerCase()} (Intensity: ${intensity}). `;
  
  if (state.valence > 0.7) description += "You feel optimistic and warm towards others. ";
  if (state.valence < -0.7) description += "You feel irritable and defensive. ";
  if (state.arousal > 0.8) description += "Your energy level is very high; you may be more impulsive or talkative. ";
  if (state.arousal < 0.2) description += "You feel lethargic and calm; your responses should be more concise and reserved. ";
  
  return description.trim();
}

/**
 * Calculates mood decay towards baseline.
 * @param {number} current - Current value.
 * @param {number} baseline - Target baseline.
 * @param {number} factor - Decay speed (0.01 - 0.1 recommended).
 */
export function calculateDecay(current, baseline, factor = 0.05) {
  const diff = baseline - current;
  return current + diff * factor;
}

/**
 * Adds natural oscillation/jitter to simulate "biological" variance.
 */
export function addOscillation(value, volatility = 0.05) {
  const jitter = (Math.random() - 0.5) * volatility;
  return Math.max(-1.0, Math.min(1.0, value + jitter));
}
