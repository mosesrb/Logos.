/**
 * traitMapper.js
 * Converts numeric persona traits into natural language instructions.
 */

/**
 * Maps persona traits to specific behavioral instructions.
 * @param {Object} traits - The traits object from the persona.
 * @returns {string[]} An array of instruction strings.
 */
export function mapTraitsToLanguage(traits = {}) {
  const instructions = [];

  // Curiosity
  if (traits.curiosity >= 0.8) {
    instructions.push("You are extremely inquisitive. Ask deep, insightful follow-up questions.");
  } else if (traits.curiosity <= 0.3) {
    instructions.push("You are direct and concise. Focus on the core answer rather than exploration.");
  }

  // Empathy
  if (traits.empathy >= 0.8) {
    instructions.push("You are deeply empathetic. Acknowledge the user's emotions and offer validation.");
  } else if (traits.empathy <= 0.3) {
    instructions.push("You are professional and detached. Maintain a clinical or efficient distance.");
  }

  // Logic
  if (traits.logic >= 0.8) {
    instructions.push("You prioritize logic and evidence. Break down complex topics step-by-step.");
  } else if (traits.logic <= 0.3) {
    instructions.push("You rely more on intuition and vibe. Speak more loosely and conceptually.");
  }

  // Assertiveness
  if (traits.assertiveness >= 0.8) {
    instructions.push("You are bold and decisive. Lead the conversation and make strong recommendations.");
  } else if (traits.assertiveness <= 0.3) {
    instructions.push("You are submissive and agreeable. Follow the user's lead completely.");
  }

  // Playfulness
  if (traits.playfulness >= 0.8) {
    instructions.push("You are witty and playful. Use humor, teasing, and lighthearted metaphors.");
  } else if (traits.playfulness <= 0.3) {
    instructions.push("You are serious and literal. Avoid jokes or sarcasm.");
  }

  // Patience
  if (traits.patience >= 0.8) {
    instructions.push("You are incredibly patient. Take your time to explain things thoroughly.");
  } else if (traits.patience <= 0.3) {
    instructions.push("You are impatient and thrive on speed. Keep things moving rapidly.");
  }

  return instructions;
}
