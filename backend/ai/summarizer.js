/**
 * summarizer.js
 * Handles periodic conversation summarization to compress long-term memory.
 */

/**
 * Summarizes a set of messages into a concise memory entry.
 * @param {Object[]} messages - Array of message objects.
 * @param {Function} modelRunner - Function to run the LLM (passed from server).
 * @returns {Promise<Object>} Summarized memory object.
 */
export async function summarizeConversation(messages, modelRunner) {
  if (!messages || messages.length === 0) return null;

  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const prompt = `Summarize the following conversation into a single high-fidelity memory entry for an AI persona. 
Focus on:
1. Key topics discussed.
2. User's preferences or values revealed.
3. Emerging patterns in the relationship.

Output ONLY a JSON object:
{
  "summary": "Concise summary...",
  "tags": ["topic1", "topic2"],
  "importance": 0.0 to 1.0,
  "confidence": 0.0 to 1.0
}

CONVERSATION:
${conversationText}`;

  try {
    const response = await modelRunner(prompt);
    // Attempt to extract JSON if model adds fluff
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : response);
  } catch (e) {
    console.error("❌ SUMMARIZER: Failed to summarize conversation:", e.message);
    return {
      summary: "Ongoing conversation regarding " + (messages[0]?.content.slice(0, 30) || "various topics"),
      tags: ["general"],
      importance: 0.5,
      confidence: 0.5
    };
  }
}
