import { getSession, getPersonas, getPersona, getRelationships, getRelationship, syncSession, syncPersona, syncMessage, syncRelationship, runQuery } from "../services/dbService.js";
import { buildCognitiveContext } from "../ai/contextBuilder.js";
import { updateRelationship, tagAndStoreMemory } from "../ai/memoryUpdater.js";
import { mapRelationshipToLanguage } from "../ai/relationshipMapper.js";
import { summarizeConversation } from "../ai/summarizer.js";
import { getMoodLabel } from "../ai/moods.js";
import { executeAgenticTask } from "../services/agentService.js";
import { routeModel, buildHybridOptions } from "../modelRouter.js";
import { semanticSearch, getWebContext } from "../services/ragService.js";
import { modelMetricsStore as modelMetrics } from "../services/systemService.js";
import { cleanImages } from "../utils/textUtils.js";
import { loadUserPersona } from "../ai/userPersonaStore.js";
import { indexEpisodicMemory, queryGlobalMemory, indexImageMemory, queryImageMemory, scanPersonaReferences } from "../services/memoryService.js";
import { getModelTier } from "../modelRouter.js";
import { validateBody, ChatBodySchema } from "../middleware/validate.js";

export function setupChatRoutes(app, context) {

  const {
    UTILITY_MODEL,
    sessions,
    personas,
    relationships,
    scenarios,
    addLog,
    saveSessionToDisk,
    ensureSession,
    resolvePersona,
    buildPersonaSystemPrompt,
    generateViaComfyUI,
    _comfyFallback,
    saveRelationships,
    buildFullPrompt,
    getModelOptions,
    MAX_CONCURRENT_HEAVY,
    getActiveHeavyModels,
    incrementHeavyModels,
    decrementHeavyModels
  } = context;
// ------------------ CHAT ENDPOINTS (single + parallel) ------------------
// Single chat streaming
app.post("/api/chat/:sessionId", validateBody(ChatBodySchema), async (req, res) => {
  const { sessionId } = req.params;
  const { prompt, model = UTILITY_MODEL, webMode = false, ragMode = false, images = [], pinnedMemories = [], personaId = null, unrestricted = false } = req.body || {};
  
  if (!sessionId) return res.status(400).json({ error: "missing session id" });
  const s0 = await (await ensureSession(sessionId)); // Ensure session is loaded in memory
  
  const routedModel = routeModel(prompt, model, s0?.scenarioModelPreference || null, images?.length > 0);
  
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "missing prompt" });

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const persona = (await getPersona(personaId));
    const userPersona = loadUserPersona();
    const { prompt: fullPrompt, sources, intent } = await buildFullPrompt(sessionId, prompt, { 
      webMode, ragMode, pinnedMemories, unrestricted, persona, userPersona
    });

    if (persona) {
      const relKey = `${sessionId}_${persona.id}`;
      /* replaced relationship assign */ await syncRelationship(relKey.split("_")[1], updateRelationship((await getRelationship(relKey.split("_")[1])), prompt));
      saveRelationships();
      tagAndStoreMemory(sessionId, prompt, "user_input", (await getRelationship(relKey.split("_")[1])));
    }

    const systemPrompt = buildPersonaSystemPrompt(persona, sessionId);
    const options = getModelOptions("Normal", persona, unrestricted);
    const s = await ensureSession(sessionId);
    s.messages.push({ role: "user", content: prompt, time: new Date().toISOString(), images });
    s.lastUpdate = new Date().toISOString();
    await saveSessionToDisk(s);

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

    // Include recent chat history (exclude the very last one which is the current prompt, take last 20)
    const history = s.messages.slice(0, -1).slice(-20);
    for (const msg of history) {
      const historyMsg = { role: msg.role, content: msg.content };
      if (msg.images) {
        historyMsg.images = cleanImages(msg.images);
      }
      messages.push(historyMsg);
    }

    messages.push({ role: "user", content: fullPrompt, images: cleanImages(images) });

    const hybridOptions = buildHybridOptions(routedModel, options);
    const modelTier = getModelTier(routedModel);
    if (modelTier === "heavy") {
      if (getActiveHeavyModels() >= MAX_CONCURRENT_HEAVY) {
        return res.status(429).json({ error: "A heavy model is already running." });
      }
      incrementHeavyModels();
    }

    addLog(sessionId, `Neural Sync Loop [${routedModel}]`, "sys");
    const _t0 = Date.now();

    let currentMessages = [...messages];
    let maxIterations = 5;
    let iteration = 0;
    let finalAnswerOutput = "";
    const turnImages = [];
    const executedActions = new Set();
    let accumulatedThought = "";

    try {
      if (sources && sources.length > 0) {
        res.write(`data: ${JSON.stringify({ sources })}\n\n`);
      }

      let isAborted = false;
      req.on("close", () => { isAborted = true; });

      while (iteration < maxIterations && !isAborted) {
        iteration++;
        let currentTag = ""; 
        let rawBuffer = "";
        let thoughtBuf = "";
        let actionBuf = "";
        let toolInputBuf = "";
        let contentBuf = "";

        const ollamaPayload = {
          model: routedModel,
          messages: currentMessages,
          stream: true,
          options: hybridOptions,
        };

        const response = await fetch((process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434") + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ollamaPayload),
        });

        if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);

        let jsonBuffer = "";
        for await (const chunk of response.body) {
          if (isAborted) break;
          jsonBuffer += Buffer.from(chunk).toString("utf-8");
          
          let newlineIndex;
          while ((newlineIndex = jsonBuffer.indexOf("\n")) !== -1) {
            const line = jsonBuffer.slice(0, newlineIndex);
            jsonBuffer = jsonBuffer.slice(newlineIndex + 1);
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.done) {
                if (rawBuffer.length > 0) {
                  if (!currentTag) currentTag = "FINAL_ANSWER";
                  let finalFlush = rawBuffer;
                  if (currentTag === "FINAL_ANSWER" && contentBuf.length === 0) finalFlush = finalFlush.replace(/^[\s\]]+/, "");
                  if (finalFlush.length > 0) {
                    if (currentTag === "THOUGHT") {
                      thoughtBuf += finalFlush;
                      accumulatedThought += finalFlush;
                      res.write(`data: ${JSON.stringify({ type: "thought", content: finalFlush })}\n\n`);
                    } else if (currentTag === "FINAL_ANSWER") {
                      contentBuf += finalFlush;
                      finalAnswerOutput += finalFlush;
                      res.write(`data: ${JSON.stringify({ content: finalFlush })}\n\n`);
                    } else if (currentTag === "ACTION") {
                      actionBuf += finalFlush;
                    } else if (currentTag === "TOOL_INPUT") {
                      toolInputBuf += finalFlush;
                    }
                  }
                }
                break;
              }
              const delta = json.message?.content || "";
              rawBuffer += delta;

              // Phase 1: Tag State Machine Updates
              if (rawBuffer.includes("[THOUGHT]")) {
                currentTag = "THOUGHT";
                rawBuffer = rawBuffer.slice(rawBuffer.indexOf("[THOUGHT]") + 9);
              } else if (rawBuffer.includes("[ACTION]")) {
                currentTag = "ACTION";
                rawBuffer = rawBuffer.slice(rawBuffer.indexOf("[ACTION]") + 8);
              } else if (rawBuffer.includes("[TOOL_INPUT]")) {
                currentTag = "TOOL_INPUT";
                rawBuffer = rawBuffer.slice(rawBuffer.indexOf("[TOOL_INPUT]") + 12);
              } else if (rawBuffer.includes("[FINAL_ANSWER]")) {
                currentTag = "FINAL_ANSWER";
                rawBuffer = rawBuffer.slice(rawBuffer.indexOf("[FINAL_ANSWER]") + 14);
              }

              // Fallback for non-agentic models: If significant text without tags appears, default to FINAL_ANSWER
              if (!currentTag && rawBuffer.length > 20 && !rawBuffer.includes("[")) {
                currentTag = "FINAL_ANSWER";
              }

              // Phase 2: Wait until a tag is established
              if (!currentTag) {
                // Keep accumulating rawBuffer until Tag or Fallback applies so no text is lost
                continue;
              }

              // Phase 3: Secure Streaming Buffer (Hold partial brackets)
              let flushable = "";
              const lastBracket = rawBuffer.lastIndexOf("[");
              
              if (lastBracket !== -1 && (rawBuffer.length - lastBracket) <= 25 && !rawBuffer.slice(lastBracket).includes("\n")) {
                // A tag might be forming. Strictly flush only the safe text BEFORE the '['
                flushable = rawBuffer.slice(0, lastBracket);
                rawBuffer = rawBuffer.slice(lastBracket);
              } else {
                // No open tags or max search distance exceeded, safe to flush all
                flushable = rawBuffer;
                rawBuffer = "";
              }

              // Phase 4: Stream to destination based on current tag
              if (flushable.length > 0) {
                // Auto-clean stray closing brackets at the very beginning of a fallback output
                if (contentBuf.length === 0 && currentTag === "FINAL_ANSWER" && flushable.trim().startsWith("]")) {
                  flushable = flushable.replace(/^[\s\]]+/, "");
                }

                if (flushable.length > 0) {
                  if (currentTag === "THOUGHT") {
                    thoughtBuf += flushable;
                    accumulatedThought += flushable;
                    res.write(`data: ${JSON.stringify({ type: "thought", content: flushable })}\n\n`);
                  } else if (currentTag === "ACTION") {
                    actionBuf += flushable;
                  } else if (currentTag === "TOOL_INPUT") {
                    toolInputBuf += flushable;
                  } else if (currentTag === "FINAL_ANSWER") {
                    contentBuf += flushable;
                    finalAnswerOutput += flushable;
                    res.write(`data: ${JSON.stringify({ content: flushable })}\n\n`);
                  }
                }
              }
            } catch (e) {}
          }
        }

        if (isAborted) break;

        const action = actionBuf.trim().toLowerCase();
        if (action && action !== "none" && action !== "null") {
          let toolResult = "Action failed.";
          const input = toolInputBuf.trim();
          const actionKey = `${action}:${input}`;

          if (executedActions.has(actionKey)) {
            currentMessages.push({ role: "system", content: "Error: Tool loop detected. Stop action." });
            break;
          }
          executedActions.add(actionKey);
          res.write(`data: ${JSON.stringify({ type: "status", content: `⚙️ Using tool: ${action}...` })}\n\n`);

          try {
            if (action === "retrieve_text_memory") {
              const mems = await queryGlobalMemory(input, 3, null, personaId);
              toolResult = mems.length ? mems.join("\n") : "No records found.";
            } else if (action === "retrieve_image_memory" || action === "query_visual_memory") {
              const images = await queryImageMemory(input, personaId);
              if (images && images.length > 0) {
                images.forEach(img => turnImages.push(img.url || img.path));
                res.write(`data: ${JSON.stringify({ type: "image", content: images[0].url || images[0].path })}\n\n`);
                toolResult = `Visual recall: ${images.map(i => i.caption).join(", ")}`;
              } else {
                toolResult = "No images found.";
              }
            } else if (action === "generate_image") {
              let p = {}; try { p = JSON.parse(input); } catch(e) { p = { prompt: input }; }
              const returnedUrls = await generateViaComfyUI({ prompt: p.prompt || input, mode: p.mode || "fast", references: scanPersonaReferences(p.target || persona?.name) });
              if (returnedUrls?.length) {
                const finalUrl = await indexImageMemory({ UTILITY_MODEL, runModel, getPersonas: () => personas }, sessionId, "generated", p.prompt || input, returnedUrls[0], personaId);
                turnImages.push(finalUrl || returnedUrls[0]);
                res.write(`data: ${JSON.stringify({ type: "image", content: finalUrl || returnedUrls[0] })}\n\n`);
                toolResult = `Generated image. URL: ${finalUrl || returnedUrls[0]}`;
              }
            } else if (action === "web_search") {
              toolResult = await getWebContext(input);
            }
          } catch (err) { toolResult = `Error: ${err.message}`; }

          currentMessages.push({ role: "assistant", content: `[THOUGHT]${thoughtBuf}[ACTION]${action}[TOOL_INPUT]${input}[FINAL_ANSWER]` });
          currentMessages.push({ role: "system", content: `TOOL_RESULT: ${toolResult}\nContinue.` });
        } else {
          break;
        }
      }

      if (!isAborted) {
        // Epistemic Persistence
        const finalContent = finalAnswerOutput.trim() || "Simulation stabilized.";
        s.messages.push({
          role: "assistant",
          content: finalContent,
          thought: accumulatedThought.trim(),
          time: new Date().toISOString(),
          model: routedModel,
          personaId,
          images: turnImages
        });
        await saveSessionToDisk(s);

        // Summarizer & Memory indexing
        if (s.messages.length % 20 === 0) {
          summarizeConversation(s.messages.slice(-20), (p) => runModel(UTILITY_MODEL, p)).then(sum => {
            if (sum) indexEpisodicMemory(sessionId, "assistant", `[SUMMARY] ${sum.summary}`, null, personaId);
          });
        }
        const mood = persona ? (await getRelationship(`${sessionId}_${persona.id}`.split("_")[1])) : null;
        indexEpisodicMemory(sessionId, "user", prompt, mood, personaId);
        indexEpisodicMemory(sessionId, "assistant", finalContent, mood, personaId);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      require('fs').appendFileSync('error_log.txt', new Date().toISOString() + ' Stream Error: ' + err.stack + '\n');
      console.error("Stream Error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.end();
    } finally {
      if (modelTier === "heavy") decrementHeavyModels();
    }
  } catch (err) {
    require('fs').appendFileSync('error_log.txt', new Date().toISOString() + ' Outer Route Error: ' + err.stack + '\n');
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Parallel chat streaming (sequential run of models to conserve VRAM)
app.post("/api/chat/parallel/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { prompt, personaIds = [], webMode = false, ragMode = false, images = [], pinnedMemories = [], unrestricted = false } = req.body || {};

  if (!prompt) return res.status(400).json({ error: "missing prompt" });

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Unified prompt building (Web + RAG) - We use the first persona if available for the base prompt intro
    const firstPersona = personaIds.length > 0 ? (await getPersona(personaIds[0])) : null;
    const { prompt: fullPromptBase, sources } = await buildFullPrompt(sessionId, prompt, { 
      webMode, 
      ragMode, 
      pinnedMemories, 
      unrestricted,
      persona: firstPersona
    });
    
    const s = await (await ensureSession(sessionId));
    s.messages.push({ role: "user", content: prompt, time: new Date().toISOString(), images });
    await saveSessionToDisk(s);

    // Resolve models from personas
    const effectiveAgents = await Promise.all(personaIds.map(async id => {
      const p = (await getPersona(id));
      return { model: p?.model || UTILITY_MODEL, persona: p };
    }));

    // If no personas, fallback to utility model (Gemma 4)
    if (effectiveAgents.length === 0) {
      effectiveAgents.push({ model: UTILITY_MODEL, persona: null });
    }

    // T9: Sort agents — run fast/smart models first, heavy (13B+) last to prevent early VRAM saturation
    const TIER_ORDER = { fast: 0, smart: 1, unknown: 2, heavy: 3 };
    effectiveAgents.sort((a, b) => {
      const ta = TIER_ORDER[getModelTier(a.model)] ?? 2;
      const tb = TIER_ORDER[getModelTier(b.model)] ?? 2;
      return ta - tb;
    });

    // run each agent sequentially to avoid VRAM contention
    for (const agent of effectiveAgents) {
      const model = agent.model;
      const persona = agent.persona;

      let modelBuf = "";
      const systemPrompt = buildPersonaSystemPrompt(persona, sessionId);
      const options = getModelOptions("Parallel", persona, unrestricted);

      addLog(sessionId, `PARALLEL_INJECTION: ${persona?.name || model} for ${model}`, "sys");

      const cleanedImages = cleanImages(images);
      
      const messages = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: fullPromptBase, images: cleanedImages });

      const ollamaPayload = {
        model: model,
        messages: messages,
        stream: false,
        options: options || {}
      };

      const ollamaRes = await fetch((process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434") + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });

      if (!ollamaRes.ok) {
        const errorText = await ollamaRes.text();
        res.write(`data: ${JSON.stringify({ model, error: `Ollama Error (${ollamaRes.status}): ${errorText}` })}\n\n`);
        continue;
      }

      try {
        if (sources && sources.length > 0) {
          res.write(`data: ${JSON.stringify({ sources })}\n\n`);
        }
        
        const data = await ollamaRes.json();
        const contentStr = data.message ? data.message.content : (data.response || "{}");
        let finalContent = contentStr;
        try {
          const parsed = JSON.parse(contentStr);
          finalContent = parsed.final_answer || contentStr;
        } catch(e) {}

        const chunks = finalContent.match(/.{1,10}/g) || [finalContent];
        for (const chunk of chunks) {
          res.write(`data: ${JSON.stringify({ model, personaName: persona?.name, personaId: persona?.id, content: chunk })}\n\n`);
          await new Promise(r => setTimeout(r, 10)); // tiny delay
        }

        s.messages.push({ role: `parallel-${model}`, content: finalContent.trim(), time: new Date().toISOString(), model, personaId: persona?.id });
        await saveSessionToDisk(s);
      } catch (e) {
        console.error("Parallel model run error:", e.message);
      }
    }

    // TRAILING DONE
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("parallel chat error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

async function fakeStreamChunked(res, content, metaObj) {
  const chunks = content.match(/.{1,10}/g) || [content];
  for (const chunk of chunks) {
    if (chunk) {
      res.write(`data: ${JSON.stringify({ ...metaObj, content: chunk })}\n\n`);
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

// --- DEBATE MODE (Merged with Vote) ---


app.post("/api/chat/debate/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { 
    prompt, 
    personaIds = [], 
    judgePersonaId,  // Phase 25: Support persona-based judge
    judgeModel = UTILITY_MODEL, 
    turns = 1, 
    images = [], 
    unrestricted = false, 
    webMode = false, 
    ragMode = false, 
    pinnedMemories = [] 
  } = req.body || {};

  if (!prompt || !Array.isArray(personaIds) || personaIds.length < 2) {
    return res.status(400).json({ error: "Need prompt and at least 2 personas for debate" });
  }

  const agents = (await Promise.all(personaIds.map(id => getPersona(id)))).filter(Boolean);
  if (agents.length < 2) return res.status(400).json({ error: "Debate requires 2 distinct personas." });

  // Resolve judge persona and model
  const effectiveJudgeId = judgePersonaId || judgeModel;
  const judgePersona = (await getPersona(effectiveJudgeId));
  const resolvedJudgeModel = judgePersona?.model || (effectiveJudgeId && !judgePersona ? effectiveJudgeId : UTILITY_MODEL);

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Unified prompt building (Web + RAG)
    const { prompt: basePrompt, sources } = await buildFullPrompt(sessionId, prompt, { 
      webMode, 
      ragMode, 
      pinnedMemories, 
      unrestricted,
      persona: judgePersona
    });


    const s = await (await ensureSession(sessionId));
    s.messages.push({ role: "user", content: prompt, time: new Date().toISOString(), images });
    await saveSessionToDisk(s);

    const debateHistory = [];
    const debateLog = [];

    if (sources && sources.length > 0) {
      res.write(`data: ${JSON.stringify({ sources })}\n\n`);
    }

    // Phase 1: The Debate
    for (let t = 1; t <= turns; t++) {
      for (const persona of agents) {
        addLog(sessionId, `DEBATE_TURN ${t}: ${persona.name} activating...`, "sys");
        res.write(`data: ${JSON.stringify({ type: "turn-start", model: persona.model, personaId: persona.id, personaName: persona.name, turn: t })}\n\n`);

        const systemPrompt = buildPersonaSystemPrompt(persona, sessionId);
        const options = getModelOptions("Debate", persona, unrestricted);
        
        let turnPrompt;
        if (debateHistory.length === 0) {
          turnPrompt = `You are a participant in a debate. Defend your perspective on the following topic:\nTopic: ${basePrompt}`;
        } else {
          turnPrompt = `Historical Topic: ${prompt}\n\nCurrent Debate History:\n${debateHistory.map(h => `${h.role}: ${h.content}`).join("\n\n")}\n\nRespond to the debate so far, continuing your argument. Keep it concise but piercing.`;
        }

        let turnText = "";
        try {
          const rawOutput = await runModel(persona.model, turnPrompt, null, images, systemPrompt, options);
          turnText = parseCleanAnswer(rawOutput);
          await fakeStreamChunked(res, turnText, { type: "turn-chunk", model: persona.model, personaId: persona.id });
        } catch (e) {
          turnText += ` [Error: ${e.message}]`;
          res.write(`data: ${JSON.stringify({ type: "turn-chunk", content: ` [Error: ${e.message}]` })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: "turn-end", model: persona.model })}\n\n`);
        
        debateLog.push(`[${persona.name} (Turn ${t})]: ${turnText}`);
        debateHistory.push({ role: persona.name, content: turnText });
        s.messages.push({ role: `debate-${persona.name}`, content: turnText, time: new Date().toISOString(), model: persona.model, personaId: persona.id });
      }
    }

    // Phase 2: Judge Evaluation
    addLog(sessionId, `JUDGE_START: ${resolvedJudgeModel}`, "sys");
    res.write(`data: ${JSON.stringify({ type: "vote-judge-start", model: resolvedJudgeModel, personaId: judgePersona?.id, personaName: judgePersona?.name })}\n\n`);

    const judgeSystemPrompt = judgePersona ? buildPersonaSystemPrompt(judgePersona, sessionId) : `You are a neutral judge. Evaluate the following debate between two AI personas.`;
    const judgePrompt = `Original Topic: ${prompt}\n\nDebate Transcript:\n${debateHistory.map(h => `${h.role}: ${h.content}`).join("\n\n")}\n\nProvide a final verdict. Who won? Why?`;
    
    let judgeText = "";
    try {
      const rawOutput = await runModel(resolvedJudgeModel, judgePrompt, null, images, judgeSystemPrompt, getModelOptions("Debate", judgePersona, unrestricted));
      judgeText = parseCleanAnswer(rawOutput);
      await fakeStreamChunked(res, judgeText, { type: "vote-judge-chunk", model: resolvedJudgeModel, personaId: judgePersona?.id });
    } catch (e) {
      judgeText += ` [Error: ${e.message}]`;
      res.write(`data: ${JSON.stringify({ type: "vote-judge-chunk", content: ` [Error: ${e.message}]` })}\n\n`);
    }
    
    res.write(`data: ${JSON.stringify({ type: "vote-judge-end", model: resolvedJudgeModel })}\n\n`);
    s.messages.push({ role: "vote-judge", content: judgeText, time: new Date().toISOString(), model: resolvedJudgeModel, personaId: judgePersona?.id });

    await saveSessionToDisk(s);
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

// ------------------ COLLABORATE ENDPOINT ------------------
app.post("/api/chat/collaborate/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { prompt, personaIds = [], webMode = false, ragMode = false, images = [], pinnedMemories = [], unrestricted = false } = req.body || {};

  if (!prompt || !Array.isArray(personaIds) || personaIds.length < 2) {
    return res.status(400).json({ error: "Need prompt and at least 2 personas for collaboration" });
  }

  // Resolve personas
  const agents = (await Promise.all(personaIds.map(id => getPersona(id)))).filter(Boolean);
  if (agents.length < 2) {
    return res.status(400).json({ error: "Collaboration requires 2 distinct personas." });
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Unified prompt building (Web + RAG)
    const leadPersona = personaIds.length > 0 ? (await getPersona(personaIds[0])) : null;
    const { prompt: basePrompt, sources } = await buildFullPrompt(sessionId, prompt, { 
      webMode, 
      ragMode, 
      pinnedMemories, 
      unrestricted,
      persona: leadPersona
    });

    const s = await (await ensureSession(sessionId));
    s.messages.push({ role: "user", content: prompt, time: new Date().toISOString(), images });
    await saveSessionToDisk(s);

    const stages = ["Draft", "Refine", "Review"];
    let previousOutput = "";
    const collaborationResults = [];

    for (let i = 0; i < Math.min(agents.length, stages.length); i++) {
      const agent = agents[i];
      const model = agent.model || UTILITY_MODEL;
      const stage = stages[i];

      let stagePrompt;
      if (i === 0) {
        stagePrompt = `You are the first contributor in a collaborative process. Write a thorough initial draft for the following request:\n\n${basePrompt}`;
      } else if (i === 1) {
        stagePrompt = `You are refining a draft written by another AI. Improve clarity, fix errors, add missing details, and strengthen the answer.\n\nOriginal request: "${prompt}"\n\nDraft to refine:\n"${previousOutput}"`;
      } else {
        stagePrompt = `You are the final reviewer. Polish this response for quality, correctness, and completeness. Provide the final answer.\n\nOriginal request: "${prompt}"\n\nCurrent draft:\n"${previousOutput}"`;
      }

      res.write(`data: ${JSON.stringify({ type: "stage-start", model, stage, stageIndex: i, personaName: agent.name, personaId: agent.id })}\n\n`);

      const systemPrompt = buildPersonaSystemPrompt(agent, sessionId);
      const options = getModelOptions("Collaborate", agent, unrestricted);
      addLog(sessionId, `PERSONA_COLLAB: ${agent.name} for ${stage}`, "sys");

      let modelBuf = "";
      
      if (i === 0 && sources && sources.length > 0) {
        res.write(`data: ${JSON.stringify({ sources })}\n\n`);
      }

      try {
        const rawOutput = await runModel(model, stagePrompt, null, images, systemPrompt, options);
        modelBuf = parseCleanAnswer(rawOutput);
        await fakeStreamChunked(res, modelBuf, { type: "stage-chunk", model, stage, personaId: agent.id });
      } catch (e) {
        modelBuf += ` [Error: ${e.message}]`;
        res.write(`data: ${JSON.stringify({ type: "stage-chunk", model, stage, content: ` [Error: ${e.message}]` })}\n\n`);
      }

      previousOutput = modelBuf.trim();
      collaborationResults.push({ model, stage, content: previousOutput, personaName: agent.name, personaId: agent.id });
      res.write(`data: ${JSON.stringify({ type: "stage-end", model, stage })}\n\n`);
    }

    // Save all stages to session
    for (const entry of collaborationResults) {
      s.messages.push({
        role: `collab-${entry.stage.toLowerCase()}`,
        content: entry.content,
        model: entry.model,
        stage: entry.stage,
        personaId: entry.personaId,
        time: new Date().toISOString(),
      });
    }
    await saveSessionToDisk(s);

    res.write(`data: ${JSON.stringify({ type: "collaborate-complete" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

// ------------------ SYNAPSE: Workflow Orchestration ------------------
const SYNAPSE_PRESETS = {
  "code-review": {
    name: "Code Review",
    stages: [
      { role: "Drafter", instruction: "Write or analyze the code as requested. Be thorough and include all details." },
      { role: "Critic", instruction: "You are a senior code reviewer. Critique the previous output: find bugs, suggest optimizations, and flag anti-patterns." },
      { role: "Fixer", instruction: "You are a senior engineer. Apply the critic's feedback to produce a final, production-ready version." }
    ]
  },
  "doc-writer": {
    name: "Documentation Writer",
    stages: [
      { role: "Outliner", instruction: "Create a structured outline for the documentation requested." },
      { role: "Drafter", instruction: "Write full documentation based on the outline. Be clear, use examples, and cover edge cases." },
      { role: "Editor", instruction: "Polish the documentation: fix grammar, improve flow, ensure completeness and technical accuracy." }
    ]
  },
  "bug-hunter": {
    name: "Bug Hunter",
    stages: [
      { role: "Reproducer", instruction: "Analyze the issue. Describe the likely root cause and how to reproduce it step by step." },
      { role: "Diagnostician", instruction: "Given the reproduction steps and analysis, diagnose the exact cause. Identify the faulty code path." },
      { role: "Fixer", instruction: "Write a complete fix for the diagnosed bug. Include the corrected code and explain why it works." }
    ]
  },
  "brainstorm": {
    name: "Brainstorm",
    stages: [
      { role: "Ideator", instruction: "Generate 5 creative and diverse ideas or approaches for the given problem. Think outside the box." },
      { role: "Critic", instruction: "Evaluate each idea. Identify strengths, weaknesses, and feasibility. Rank them." },
      { role: "Synthesizer", instruction: "Combine the best elements from the top ideas into a single actionable plan." }
    ]
  }
};

// GET presets listing
app.get("/api/synapse/presets", async (req, res) => {
  const listing = Object.entries(SYNAPSE_PRESETS).map(([key, val]) => ({
    key,
    name: val.name,
    stageCount: val.stages.length,
    roles: val.stages.map(s => s.role)
  }));
  res.json(listing);
});

// Pipeline execution endpoint
app.post("/api/chat/pipeline/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { prompt, stages = [], presetKey, webMode = false, ragMode = false, images = [], pinnedMemories = [], personaIds = [] } = req.body || {};

  // Resolve stages from preset or custom config
  let pipelineStages = stages;
  if (presetKey && SYNAPSE_PRESETS[presetKey]) {
    pipelineStages = SYNAPSE_PRESETS[presetKey].stages;
  }

  // Diagnostic Telemetry: Track the persona signal
  addLog(sessionId, `DEBUG: Pipeline Request [${presetKey}] PersonaIDs: ${personaIds.join(',') || "NONE"}`, "sys");

  if (!prompt || !Array.isArray(pipelineStages) || pipelineStages.length < 2) {
    return res.status(400).json({ error: "Need prompt and at least 2 pipeline stages" });
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const leadPersona = personaIds.length > 0 ? (await getPersona(personaIds[0])) : null;
    if (personaIds.length > 0 && !leadPersona) {
      addLog(sessionId, `⚠️ WARNING: Lead Persona ID [${personaIds[0]}] failed to resolve. Falling back to Session model.`, "sys");
    }

    const { prompt: basePrompt, sources } = await buildFullPrompt(sessionId, prompt, { 
      webMode, 
      ragMode, 
      pinnedMemories,
      persona: leadPersona
    });

    // Phase 14/16: Pipeline Emotional Update
    if (leadPersona) {
      const relKey = `${sessionId}_${leadPersona.id}`;
      /* replaced relationship assign */ await syncRelationship(relKey.split("_")[1], updateRelationship((await getRelationship(relKey.split("_")[1])), prompt));
      saveRelationships();
      tagAndStoreMemory(sessionId, prompt, "pipeline_input", (await getRelationship(relKey.split("_")[1])));
    }

    const s = await (await ensureSession(sessionId));
    s.messages.push({ role: "user", content: prompt, time: new Date().toISOString(), images });
    await saveSessionToDisk(s);

    addLog(sessionId, `SYNAPSE: Pipeline initiated [${pipelineStages.length} stages]`, "sys");

    let previousOutput = "";
    const pipelineResults = [];
    const pipelineTrace = []; // Chain of Custody History

    for (let i = 0; i < pipelineStages.length; i++) {
      const stage = pipelineStages[i];
      // Hierarchical Escalation logic:
      const assignedPersonaId = stage.personaId || (personaIds.length > 0 ? personaIds[Math.min(i, personaIds.length - 1)] : null);
      const persona = assignedPersonaId ? (await getPersona(assignedPersonaId)) : null;
      
      // HARD-STOP FALLBACK: Prioritize Persona > Stage > Session Model > Utility
      const model = persona?.model || stage.model || s.model || UTILITY_MODEL;
      const roleName = stage.role || `Stage ${i + 1}`;

      let stagePrompt;
      let traceLog = pipelineTrace.length > 0 ? pipelineTrace.map(t => `[${t.role} Output]:\n${t.content}`).join("\n\n") : "None";

      const formatRules = "FORMATTING RULES:\n1. KEEP IT EXTREMELY SIMPLE. Make high-level statements rather than long paragraphs.\n2. Output format MUST use standard bullet points (-).\n3. You MUST press Enter twice before each bullet point so it is properly spaced.\n4. Output ONLY the final response. Do NOT output meta-commentary, internal thoughts, or instructions acting as a critic.";

      if (i === 0) {
        stagePrompt = `[SYNAPSE ROLE: ${roleName}]\n${stage.instruction}\n\n${formatRules}\n\nUser request:\n${basePrompt}`;
      } else {
        stagePrompt = `[SYNAPSE ROLE: ${roleName}]\n${stage.instruction}\n\n${formatRules}\n\nOriginal request: "${prompt}"\n\nAssembly Line History:\n${traceLog}`;
      }

      addLog(sessionId, `SYNAPSE STAGE ${i+1}/${pipelineStages.length}: ${roleName} (${model})`, "sys");
      res.write(`data: ${JSON.stringify({ type: "pipeline-stage-start", model, role: roleName, stageIndex: i, totalStages: pipelineStages.length, personaId: persona?.id, personaName: persona?.name })}\n\n`);

      const systemPrompt = buildPersonaSystemPrompt(persona, sessionId);
      let modelBuf = "";
      try {
        const rawOutput = await runModel(model, stagePrompt, null, images, systemPrompt, { skipRouting: true });
        modelBuf = parseCleanAnswer(rawOutput);
        await fakeStreamChunked(res, modelBuf, { type: "pipeline-stage-chunk", model, role: roleName, personaId: persona?.id });
      } catch (e) {
        modelBuf += ` [Error: ${e.message}]`;
        res.write(`data: ${JSON.stringify({ type: "pipeline-stage-chunk", model, role: roleName, content: ` [Error: ${e.message}]`, personaId: persona?.id })}\n\n`);
      }

      previousOutput = modelBuf.trim();
      pipelineResults.push({ model, role: roleName, content: previousOutput, personaId: persona?.id || null });
      pipelineTrace.push({ role: roleName, content: previousOutput });
      addLog(sessionId, `SYNAPSE STAGE ${i+1} COMPLETE: ${roleName}`, "sys");
      res.write(`data: ${JSON.stringify({ type: "pipeline-stage-end", model, role: roleName, stageIndex: i })}\n\n`);
    }

    // Save all stages to session
    for (const entry of pipelineResults) {
      s.messages.push({
        role: `pipeline-${entry.role.toLowerCase()}`,
        content: entry.content,
        model: entry.model,
        stage: entry.role,
        personaId: entry.personaId || null,
        time: new Date().toISOString(),
      });
    }
    await saveSessionToDisk(s);

    // Index final output in CHRONOS
    const activePersonaId = leadPersona?.id || "assistant";
    indexEpisodicMemory(sessionId, "user", prompt, null, activePersonaId);
    indexEpisodicMemory(sessionId, "assistant", previousOutput, null, activePersonaId);

    addLog(sessionId, `SYNAPSE: Pipeline complete [${pipelineResults.length} stages]`, "sys");
    res.write(`data: ${JSON.stringify({ type: "pipeline-complete" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

// ------------------ SCENARIO: Simulation Engine ------------------


app.post("/api/chat/scenario/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { 
    prompt, 
    scenarioId, 
    personaMap = {}, 
    roleModelMap = {}, 
    webMode = false, 
    ragMode = false, 
    images = [], 
    unrestricted = false, 
    hiddenIntents = {} 
  } = req.body || {};

  if (!prompt || !scenarioId) return res.status(400).json({ error: "missing prompt or scenarioId" });

  try {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return res.status(404).json({ error: "scenario not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const s = await (await ensureSession(sessionId));
    s.messages.push({ role: "user", content: prompt, time: new Date().toISOString(), images });
    await saveSessionToDisk(s);

    // Index User Input into CHRONOS
    indexEpisodicMemory(sessionId, "user", prompt, null, "scenario_global"); 

    // Execute each role in the scenario
    for (const role of scenario.participant_roles) {
      const personaId = personaMap[role];
      const persona = personaId ? (await getPersona(personaId)) : null;
      const hIntent = hiddenIntents[role] || null;
      const model = persona?.model || roleModelMap[role] || s.model || UTILITY_MODEL; 
      
      // Phase 14/16: Update Relationship & Mood State before building context
      if (persona) {
        const relKey = `${sessionId}_${persona.id}`;
        /* replaced relationship assign */ await syncRelationship(relKey.split("_")[1], updateRelationship((await getRelationship(relKey.split("_")[1])), prompt));
        saveRelationships();
        
        // Emotional tagging for the episodic memory
        tagAndStoreMemory(sessionId, prompt, "user_input", (await getRelationship(relKey.split("_")[1])));
      }

      const systemPrompt = await buildSimulationContext(scenario, role, persona, s, prompt, unrestricted, hIntent);
      const options = getModelOptions("Scenario", persona, unrestricted);

      addLog(sessionId, `SCENARIO: Role "${role}" activating via model "${model}"...`, "sys");
      res.write(`data: ${JSON.stringify({ type: "scenario-role-start", role, model, personaId: persona?.id })}\n\n`);

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt, images: cleanImages(images) }
      ];

      try {
        const ollamaRes = await fetch((process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434") + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, stream: true, options }),
        });

        if (!ollamaRes.ok) throw new Error(`Ollama Error: ${ollamaRes.status}`);

        let roleFullBuf = "";
        let characterBuf = "";
        let thoughtBuf = "";
        let isThinking = false;
        let lineBuffer = "";

        for await (const chunk of ollamaRes.body) {
          lineBuffer += Buffer.from(chunk).toString("utf-8");
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              const content = json.response || (json.message && json.message.content);
              if (content) {
                roleFullBuf += content;
                
                // Thought Parsing Logic
                if (roleFullBuf.includes("<thought>") && !roleFullBuf.includes("</thought>")) {
                  isThinking = true;
                  // Extract what's inside <thought> so far
                  const startIdx = roleFullBuf.indexOf("<thought>") + 9;
                  const currentThoughtChunk = roleFullBuf.slice(startIdx);
                  const piece = currentThoughtChunk.slice(thoughtBuf.length);
                  if (piece) {
                    thoughtBuf = currentThoughtChunk;
                    res.write(`data: ${JSON.stringify({ role, type: "thought", content: piece })}\n\n`);
                  }
                } else if (roleFullBuf.includes("</thought>")) {
                   if (isThinking) {
                     // Just finished thinking
                     const endIdx = roleFullBuf.indexOf("</thought>");
                     const startIdx = roleFullBuf.indexOf("<thought>") + 9;
                     thoughtBuf = roleFullBuf.slice(startIdx, endIdx);
                     isThinking = false;
                     addLog(sessionId, `SCENARIO: Role "${role}" finished cognitive planning [${thoughtBuf.length} chars]`, "sys");
                     res.write(`data: ${JSON.stringify({ role, type: "thought-complete" })}\n\n`);
                   }
                   // Everything after </thought> is character content
                   const characterStart = roleFullBuf.indexOf("</thought>") + 10;
                   const newContent = roleFullBuf.slice(characterStart);
                   // Only stream the NEW character content
                   const currentLen = characterBuf.length;
                   const piece = newContent.slice(currentLen);
                   if (piece) {
                     characterBuf += piece;
                     res.write(`data: ${JSON.stringify({ role, content: piece })}\n\n`);
                   }
                } else {
                  // Standard content if no <thought> tag detected at all (fallback)
                  if (!roleFullBuf.includes("<thought>")) {
                    characterBuf += content;
                    res.write(`data: ${JSON.stringify({ role, content })}\n\n`);
                  }
                }
              }
              if (json.done) {
                s.messages.push({ 
                  role: `scenario-${role}`, 
                  content: characterBuf.trim(), 
                  thought: thoughtBuf.trim(), 
                  time: new Date().toISOString(), 
                  model,
                  personaId: persona?.id,
                  scenarioId
                });

                await saveSessionToDisk(s);

                // Index Character Response (not thoughts) into CHRONOS
                indexEpisodicMemory(sessionId, `scenario-${role}`, characterBuf.trim(), null, persona?.id || role);
                break;
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.error(`Scenario role ${role} failed:`, e.message);
        res.write(`data: ${JSON.stringify({ role, error: e.message })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: "scenario-role-end", role })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: "scenario-complete" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();

  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

}

// T4: runModel with hybrid GPU options and T6 metrics
export async function runModel(model, prompt, onChunkCallback = null, images = [], systemPrompt = null, options = null) {
  // Safely route model (forces moondream if images exist to prevent RETINA_ERROR)
  const routedModel = (options && options.skipRouting) ? model : routeModel(prompt, model, null, images?.length > 0);

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt, images: cleanImages(images) });

  // T3/T4: Inject hybrid GPU layer config for heavy-tier models
  const hybridOpts = buildHybridOptions(routedModel, options || {});
  const payload = { model: routedModel, messages, stream: true };
  if (Object.keys(hybridOpts).length > 0) payload.options = hybridOpts;

  const _rmT0 = Date.now();
  const ollamaRes = await fetch((process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434") + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  if (!ollamaRes.ok) throw new Error(`Ollama Error (${ollamaRes.status})`);
  
  let fullOutput = "";
  let runModelLineBuffer = "";
  try {
    for await (const chunk of ollamaRes.body) {
      runModelLineBuffer += Buffer.from(chunk).toString("utf-8");
      const lines = runModelLineBuffer.split("\n");
      runModelLineBuffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const content = json.response || (json.message && json.message.content);
          if (content !== undefined && content !== null) {
            fullOutput += content;
            if (onChunkCallback) onChunkCallback(content);
          }
          if (json.done) {
            // T6: Track metrics
            if (!modelMetrics[routedModel]) modelMetrics[routedModel] = { calls: 0, totalMs: 0 };
            modelMetrics[routedModel].calls++;
            modelMetrics[routedModel].totalMs += (Date.now() - _rmT0);
            return fullOutput.trim();
          }
        } catch (e) {
          console.error("runModel parse error:", e.message, line);
        }
      }
    }
    // Trailing buffer
    if (runModelLineBuffer.trim()) {
      try {
        const json = JSON.parse(runModelLineBuffer);
        const content = json.response || (json.message && json.message.content);
        if (content) {
          fullOutput += content;
          if (onChunkCallback) onChunkCallback(content);
        }
      } catch(e) {}
    }
    return fullOutput.trim();
  } catch (e) {
    console.error("runModel iteration error:", e.message);
    return fullOutput.trim();
  }
}

// Helper for extracting clean answers when JSON options are forced
export function parseCleanAnswer(rawOutput) {
  if (!rawOutput) return "";
  
  // 1. Initial cleanup: Remove standard wrappers and markdown blocks
  let cleaned = rawOutput
    .replace(/^Response:\s*/i, '')
    .replace(/^JSON_SCHEMA\s*/i, '')
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // 2. High-Fidelity Tag Extraction: Support [FINAL ANSWER] and [FINAL_ANSWER]
  // We look for any variation of the final answer tag to isolate the payload.
  const finalAnswerMarkers = ["[FINAL ANSWER]", "[FINAL_ANSWER]", "FINAL ANSWER:", "FINAL_ANSWER:"];
  for (const marker of finalAnswerMarkers) {
    if (cleaned.includes(marker)) {
      const parts = cleaned.split(marker);
      // If there is content after the marker, prioritize it.
      // Otherwise, if the marker is at the end, the content is before it.
      let candidate = parts[parts.length - 1].trim();
      if (!candidate && parts.length > 1) {
        candidate = parts[parts.length - 2].trim();
      }
      cleaned = candidate;
      break; 
    }
  }

  // 3. Command Blackhole Filter: Strip raw tool calls like 'generate_image' { ... } or tool_call(...)
  // These often leak when models hallucinate tool-use in narrative modes.
  const toolCallRegex = /['"]?[\w_]+['"]?\s*\{[\s\S]*?\}\s*/g;
  const funcCallRegex = /[\w_]+\s*\([\s\S]*?\)\s*/g;
  cleaned = cleaned.replace(toolCallRegex, "").replace(funcCallRegex, "").trim();

  // 4. Brute-Force Tag Strip: Fuzzy matching for [THOUGHT], [ACTION], [TOOL INPUT], etc.
  // We use [\s_]? to handle both spaces and underscores.
  const agenticTags = /\[(?:THOUGHT|ACTION|TOOL[\s_]INPUT|RESULT|RESPONSE|INTERIM[\s_]MESSAGE|SYNTHESIZING|FINAL[\s_]ANSWER|REASONING|PLAN|THOUGHT[\s_]PROCESS)\]/gi;
  cleaned = cleaned.replace(agenticTags, "").trim();

  // 5. Standard JSON Parsing Attempt (If the model is strictly following schema)
  try {
    const parsed = JSON.parse(cleaned);
    let ans = parsed.final_answer || parsed.result || parsed.message || parsed.content || parsed.text || parsed.response || parsed.interim_message;
    if (ans) return typeof ans === 'string' ? ans.trim() : JSON.stringify(ans).trim();
    
    // If it parsed but NO target key is found (null fields), and it leaked 'thought', hide the noise.
    if (parsed.thought && !ans) {
       if (parsed.action && parsed.action !== "null" && parsed.action !== "none") {
          return `*(Executing ${parsed.action}...)*`;
       }
       return "*(Synthesizing thoughts...)*";
    }
  } catch(e) {}

  // 6. Partial JSON / Block Rescue Logic (Outer Braces)
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonBlock = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonBlock);
      let ans = parsed.final_answer || parsed.result || parsed.message || parsed.content || parsed.text || parsed.response || parsed.interim_message;
      
      if (ans) {
         let remainder = cleaned.substring(lastBrace + 1).trim();
         ans = typeof ans === 'string' ? ans.trim() : JSON.stringify(ans).trim();
         if (remainder && remainder.length > 5 && !remainder.startsWith(ans.substring(0, 5))) {
            return ans + "\n\n" + remainder;
         }
         return ans;
      }
      if (parsed.thought) return cleaned.substring(lastBrace + 1).trim();
    } catch(err) {}
  }
  
  // 7. Binary Field Rescue: Extract 'final_answer' from fragments
  if (cleaned.includes('"final_answer"')) {
      const fieldMatch = cleaned.match(/"final_answer"\s*:\s*"((?:\\.|[^"\\])*)"/s);
      if (fieldMatch && fieldMatch[1]) {
          return fieldMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
      }
  }

  // 8. Final Cleanup: Leftover fragments and structural markers
  return cleaned
    .replace(/^(Thought|Action|Tool[\s_]Input):\s*/gim, "")
    .replace(/[\[\]]/g, "") // Final pass to strip any stray brackets
    .trim();
}
