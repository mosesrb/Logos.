/**
 * promptBuilder.js
 * Constructs the final structured prompt for the LLM based on Phase 13 spec.
 */

/**
 * Assemblies the final structured prompt template for the cognitive engine.
 * @param {Object} context - Context object returned by buildPromptContext.
 * @returns {string} Fully structured system prompt.
 */
export function buildFinalPrompt(context) {
  const {
    personaName,
    systemPrompt,
    primaryGoal,
    coreExpertise,
    personalityStyle,
    quirks,
    rules = [],
    traitInstructions = [],
    relationshipText = '',
    intent = 'casual',
    memoryText = '',
    recentContext = '',
    userPersonaText = '',
    userMessage
  } = context;

  const sections = [
    `### PERSONA CORE (IDENTITY ANCHOR: ${personaName})`,
    systemPrompt,
    '',
    `Primary Goal:`,
    primaryGoal,
    '',
    `Core Expertise:`,
    coreExpertise || "General Intelligence",
    '',
    `Personality & Speaking Style:`,
    personalityStyle || "Natural, adaptive",
    '',
    `Typical Phrases & Quirks:`,
    quirks || "None reported.",
    '',
    '---',
    '',
    '### IDENTITY ANCHOR (STRICT MODE)',
    'Maintain:',
    '- Tone: consistent, expressive',
    '- Style: natural, non-robotic',
    '',
    'DO NOT:',
    '- Break personality persona characteristics',
    '- Become generic or repetitive',
    '- Ignore past context if relevant',
    '',
    '---',
    '',
    '### PERSONALITY TRAITS',
    traitInstructions.length > 0 ? traitInstructions.join('\n') : "Continue as defined in your core identity.",
    '',
    '---',
    '',
    '### RELATIONSHIP CONTEXT',
    relationshipText || "Relationship initializing. Maintain respectful curiosity.",
    '',
    '---',
    '',
    '### USER PERSONA', // New section for user persona
    userPersonaText || "No specific user persona defined.",
    '',
    '---',
    '',
    '### RESPONSE MODE',
    `Current Intent: ${intent}`,
    '',
    '---',
    '',
    '### LONG-TERM MEMORY (RECALL)',
    memoryText || "No persistent memories relevant to this specific query.",
    '',
    '---',
    '',
    '### RECENT CONTEXT (SHORT-TERM)',
    recentContext || "New conversation thread.",
    '',
    '---',
    '',
    '### RESPONSE RULES',
    rules.map(r => `- ${r}`).join('\n'),
    '- Use memory only when relevant.',
    '- Do NOT over-reference the past.',
    '- Be natural and conversational.',
    '- Maintain strict identity consistency.',
    '',
    '---',
    '',
    '### INTERNAL (DO NOT SHOW USER)',
    '- Step 1: Recall relevant memory if exists',
    '- Step 2: Adjust tone based on relationship',
    '- Step 3: Apply active personality traits',
    '',
    '---',
    '',
    '### USER INPUT',
    userMessage
  ];

  return sections.join('\n');
}
