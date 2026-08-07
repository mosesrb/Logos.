/**
 * contextBuilder.js
 * Orchestrates the gathering of persona info, traits, and context for the prompt.
 */

import { mapTraitsToLanguage } from './traitMapper.js';
import { mapRelationshipToLanguage } from './relationshipMapper.js';
import { detectIntent } from './intentDetector.js';
import { buildFinalPrompt } from './promptBuilder.js';
import { wakeUpWing, toWingSlug } from '../services/mempalaceBridge.js';

/**
 * Builds the prompt context for a given persona and user message.
 * @param {Object} persona - The persona configuration object.
 * @param {string} userMessage - The current user message.
 * @param {Object} options - Additional context like memory and relationship.
 * @returns {Promise<Object>} The structured context for the prompt builder.
 */
export async function buildCognitiveContext(persona, userMessage, options = {}) {
  // Defensive Guard: Handle null/undefined personas (e.g., generic pipeline stages)
  const activePersona = persona || {
    name: "Virtual Analyst",
    system_prompt: "You are a specialized AI processing unit. Maintain technical accuracy.",
    goal: "Process the given input efficiently.",
    traits: {},
    rules: [],
    core_expertise: "General Knowledge",
    personality_style: "Objective",
    quirks: ""
  };

  const {
    textMemory = [],
    externalContext = [],
    imageMemory = [],
    relationship = { familiarity: 0.5, trust: 0.5 },
    recentMessages = [],
    userPersona = { profile: {}, goals: [] }
  } = options;

  // 1. Detect Intent
  const intent = detectIntent(userMessage);

  // 2. Map Traits to Language
  const traitInstructions = mapTraitsToLanguage(activePersona.traits || {});

  // 3. Map Relationship to Language
  const relationshipText = mapRelationshipToLanguage(relationship);

  // 4. Map User Profile to Language
  const userContextParts = [];
  if (userPersona.profile.communication_style) {
    userContextParts.push(`- Style: ${userPersona.profile.communication_style}`);
  }
  if (userPersona.profile.prefers_depth) {
    userContextParts.push(`- Depth: High (prefers detailed exploration)`);
  }
  if (userPersona.profile.tone_preference) {
    userContextParts.push(`- Tone: ${userPersona.profile.tone_preference}`);
  }
  if (userPersona.goals?.length > 0) {
    userContextParts.push(`- Goals: ${userPersona.goals.join(", ")}`);
  }
  const userPersonaText = userContextParts.length > 0 
    ? "### USER PROFILE:\n" + userContextParts.join("\n") 
    : "";

  // 5. Format Memory
  // Combine text and image memory into a structured block
  const memoryParts = [];
  if (externalContext.length > 0) {
    memoryParts.push("### EXTERNAL CONTEXT (Web/RAG/System):\n" + externalContext.join('\n\n'));
  }
  if (textMemory.length > 0) {
    memoryParts.push("### CHRONOS RECALL (Conversations):\n" + textMemory.join('\n'));
  }
  if (imageMemory.length > 0) {
    const imgText = imageMemory.map(img => `![${img.prompt}](${img.url || img.path}) [Sim: ${img.sim?.toFixed(2)}]`).join('\n');
    memoryParts.push("### VISUAL RECALL (Images):\n" + imgText);
  }

  // Inject MemPalace AAAK Wake-up Context
  const slug = toWingSlug(activePersona.id || activePersona.name);
  try {
    const wakeUpRes = await wakeUpWing(slug);
    if (wakeUpRes.ok && wakeUpRes.context && wakeUpRes.context.trim() !== "") {
      // Enforce a strict token limit approximation to prevent context window overflow
      let safeContext = wakeUpRes.context;
      const MAX_WAKEUP_CHARS = 12000;
      if (safeContext.length > MAX_WAKEUP_CHARS) {
        console.warn(`[contextBuilder] MemPalace context too large (${safeContext.length} chars). Truncating to ${MAX_WAKEUP_CHARS}.`);
        safeContext = safeContext.slice(0, MAX_WAKEUP_CHARS) + "\n...[CONTEXT TRUNCATED DUE TO TOKEN LIMITS]...";
      }
      memoryParts.push("### AAAK COGNITIVE WAKE-UP (MemPalace Layer 0+1):\n" + safeContext);
    }
  } catch (e) {
    console.warn(`[contextBuilder] MemPalace wake-up failed for wing ${slug}:`, e.message);
  }

  const memoryText = memoryParts.join('\n\n');

  // 6. Format Recent Context (Token-sliding window strategy)
  // Approximate 1 token = 4 chars
  const MAX_CONTEXT_TOKENS = 4000;
  const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * 4;
  let currentChars = 0;
  const slidingWindowMessages = [];

  // Iterate backwards from the most recent message
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    const msgText = `${msg.role.toUpperCase()}: ${msg.content}`;
    
    if (currentChars + msgText.length <= MAX_CONTEXT_CHARS) {
      slidingWindowMessages.unshift(msgText);
      currentChars += msgText.length;
    } else {
      // If a single message is huge, we might need to truncate it if it's the very first one we're processing,
      // but generally we just stop including older messages.
      if (slidingWindowMessages.length === 0) {
        // Must include at least part of the most recent message
        const availableChars = MAX_CONTEXT_CHARS - currentChars - msg.role.length - 3;
        slidingWindowMessages.unshift(`${msg.role.toUpperCase()}: ${msg.content.slice(0, availableChars)}...[TRUNCATED]`);
      }
      break; // Reached token limit
    }
  }

  const recentContext = slidingWindowMessages.join('\n');

  // 7. Build Context Object
  const context = {
    personaName: activePersona.name,
    systemPrompt: activePersona.system_prompt,
    primaryGoal: activePersona.goal,
    coreExpertise: activePersona.core_expertise,
    personalityStyle: activePersona.personality_style,
    quirks: activePersona.quirks,
    rules: activePersona.rules || [],
    traitInstructions,
    relationshipText,
    userPersonaText,
    intent,
    memoryText,
    recentContext,
    userMessage
  };

  // 7. Assemble Final Prompt
  const finalPrompt = buildFinalPrompt(context);

  return {
    ...context,
    finalPrompt
  };
}
