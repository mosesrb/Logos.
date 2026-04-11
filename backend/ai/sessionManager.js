/**
 * sessionManager.js
 * Tracks session-level context like topic and mood.
 */

/**
 * Analyzes recent messages to determine the current session topic and mood.
 * @param {Object[]} recentMessages - Last few messages.
 * @returns {Object} { topic, mood }
 */
export function analyzeSession(recentMessages) {
  if (!recentMessages || recentMessages.length === 0) {
    return { topic: 'initial contact', mood: 'neutral' };
  }

  // Simple heuristic-based detection
  const lastMessage = recentMessages[recentMessages.length - 1].content.toLowerCase();
  
  let topic = 'general chat';
  if (lastMessage.includes('code') || lastMessage.includes('bug')) topic = 'technical coding';
  if (lastMessage.includes('image') || lastMessage.includes('picture')) topic = 'visual creation';
  
  let mood = 'neutral';
  if (lastMessage.includes('thanks') || lastMessage.includes('good')) mood = 'positive';
  if (lastMessage.includes('error') || lastMessage.includes('fail')) mood = 'frustrated';

  return { topic, mood };
}
