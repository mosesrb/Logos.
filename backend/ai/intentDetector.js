/**
 * intentDetector.js
 * Classifies user messages into specific intent categories.
 */

const INTENT_PATTERNS = {
  memory_recall: /(remember|recall|memory|forget|past|last time|did you|have we)/i,
  informational: /(what is|how to|explain|tell me|who|where|why)/i,
  creative: /(story|write|poem|draw|imagine|create|brainstorm)/i,
  emotional: /(feel|sad|happy|angry|love|hate|miss|hurts|lonely)/i
};

/**
 * Detects the primary intent of a user message.
 * @param {string} message - User input.
 * @returns {string} Detected intent category.
 */
export function detectIntent(message) {
  if (!message) return 'casual';

  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(message)) {
      return intent;
    }
  }

  return 'casual';
}
