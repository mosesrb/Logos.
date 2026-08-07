import { BaseProvider } from "./BaseProvider.js";
import { buildHybridOptions, routeModel } from "../../modelRouter.js";

// Ensure global metrics object exists (if not passed via dependency injection)
if (typeof global.modelMetrics === 'undefined') {
  global.modelMetrics = {};
}

function capMessages(messages, maxTokens = 6000) {
  if (!messages || !Array.isArray(messages)) return messages;
  const maxChars = maxTokens * 4; // Approx 4 chars per token
  let currentChars = 0;
  
  const systemMessages = messages.filter(m => m.role === "system");
  const otherMessages = messages.filter(m => m.role !== "system");
  const cappedOther = [];
  
  for (const sys of systemMessages) currentChars += (sys.content || "").length;
  
  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const msg = otherMessages[i];
    // If it has tool calls, we shouldn't slice it easily, but we approximate length
    const contentLen = (msg.content || "").length + JSON.stringify(msg.tool_calls || []).length;
    if (currentChars + contentLen > maxChars && cappedOther.length > 0) {
        break; // Stop adding older historical messages
    }
    cappedOther.unshift(msg);
    currentChars += contentLen;
  }
  
  return [...systemMessages, ...cappedOther];
}

export class OllamaProvider extends BaseProvider {
  constructor(baseUrl = null) {
    super();
    this.baseUrl = baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  }

  /**
   * Helper to execute Ollama fetch stream
   */
  async _executeStream(payload, onChunkCallback) {
    const { StringDecoder } = await import('string_decoder');
    const decoder = new StringDecoder('utf8');
    
    // Enforce token limit context window capping
    if (payload.messages) {
      payload.messages = capMessages(payload.messages, 6000);
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Ollama Error (${res.status})`);

    let fullOutput = "";
    let lineBuffer = "";

    try {
      for await (const chunk of res.body) {
        lineBuffer += decoder.write(chunk);
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop(); // keep remainder

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            const content = json.response || (json.message && json.message.content);
            if (content !== undefined && content !== null) {
              fullOutput += content;
              if (onChunkCallback) onChunkCallback(content);
            }
            if (json.done) return fullOutput.trim();
          } catch (e) {
            console.error("OllamaProvider parse error:", e.message, line);
          }
        }
      }
      
      lineBuffer += decoder.end();
      if (lineBuffer.trim()) {
        try {
          const json = JSON.parse(lineBuffer);
          const content = json.response || (json.message && json.message.content);
          if (content) {
            fullOutput += content;
            if (onChunkCallback) onChunkCallback(content);
          }
        } catch(e) {}
      }
      return fullOutput.trim();
    } catch (e) {
      console.error("OllamaProvider iteration error:", e.message);
      return fullOutput.trim();
    }
  }

  async runModel(model, prompt, onChunkCallback = null, images = [], systemPrompt = null, options = null) {
    const routedModel = (options && options.skipRouting) ? model : routeModel(prompt, model, null, images?.length > 0);

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt, images });

    const hybridOpts = buildHybridOptions(routedModel, options || {});
    const payload = { model: routedModel, messages, stream: true };
    if (Object.keys(hybridOpts).length > 0) payload.options = hybridOpts;

    const t0 = Date.now();
    const result = await this._executeStream(payload, onChunkCallback);
    
    // Track metrics
    if (!global.modelMetrics[routedModel]) global.modelMetrics[routedModel] = { calls: 0, totalMs: 0 };
    global.modelMetrics[routedModel].calls++;
    global.modelMetrics[routedModel].totalMs += (Date.now() - t0);

    return result;
  }

  async runModelStructured(model, prompt, schema = null, systemPrompt = null, images = []) {
    // We disable skipRouting here normally, but could accept options if needed.
    const routedModel = routeModel(prompt, model, null, images?.length > 0);

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt, images });

    const payload = { 
      model: routedModel, 
      messages: capMessages(messages, 6000), 
      stream: false,
      format: schema ? schema : "json" // Use native JSON output if schema or just "json" format
    };

    const t0 = Date.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Ollama Error (${res.status})`);
    
    const json = await res.json();
    const content = json.response || (json.message && json.message.content);
    
    if (!global.modelMetrics[routedModel]) global.modelMetrics[routedModel] = { calls: 0, totalMs: 0 };
    global.modelMetrics[routedModel].calls++;
    global.modelMetrics[routedModel].totalMs += (Date.now() - t0);

    try {
      return JSON.parse(content);
    } catch(e) {
      console.error("Failed to parse structured output natively, falling back to raw output");
      return content;
    }
  }

  async runConversationStream(model, messages, options = null, onChunkCallback = null) {
    const payload = { 
      model, 
      messages, 
      stream: true 
    };
    if (options) payload.options = options;

    const t0 = Date.now();
    const result = await this._executeStream(payload, onChunkCallback);
    
    // Track metrics
    if (!global.modelMetrics[model]) global.modelMetrics[model] = { calls: 0, totalMs: 0 };
    global.modelMetrics[model].calls++;
    global.modelMetrics[model].totalMs += (Date.now() - t0);

    return result;
  }
}
