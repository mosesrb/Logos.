import {
  getPersona,
  getRelationship,
  syncRelationship,
  saveSessionToDisk,
  ensureSession,
  getPersonas,
  syncSession
} from "./dbService.js";
import { indexEpisodicMemory } from "./memoryService.js";
import { llmProvider } from "./llm/index.js";
import { parseCleanAnswer } from "../utils/textUtils.js";
import { updateRelationship, tagAndStoreMemory } from "../ai/memoryUpdater.js";

// Helper for streaming to client. Copied from chatController to keep services decoupled
async function fakeStreamChunked(res, content, metaObj) {
  const chunks = content.match(/.{1,10}/g) || [content];
  for (const chunk of chunks) {
    if (chunk) {
      res.write(`data: ${JSON.stringify({ ...metaObj, content: chunk })}\n\n`);
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

export async function executeDebate({
  res, sessionId, prompt, personaIds, judgePersonaId, judgeModel, turns, images, 
  unrestricted, webMode, ragMode, pinnedMemories, context
}) {
  const {
    UTILITY_MODEL, addLog, buildPersonaSystemPrompt, buildFullPrompt, getModelOptions
  } = context;

  const agents = (await Promise.all(personaIds.map(id => getPersona(id)))).filter(Boolean);
  if (agents.length < 2) throw new Error("Debate requires 2 distinct personas.");

  const effectiveJudgeId = judgePersonaId || judgeModel;
  const judgePersona = (await getPersona(effectiveJudgeId));
  const resolvedJudgeModel = judgePersona?.model || (effectiveJudgeId && !judgePersona ? effectiveJudgeId : UTILITY_MODEL);

  const { prompt: basePrompt, sources } = await buildFullPrompt(sessionId, prompt, { 
    webMode, 
    ragMode, 
    pinnedMemories, 
    unrestricted,
    persona: judgePersona
  });

  const s = await ensureSession(sessionId);
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
        const rawOutput = await llmProvider.runModel(persona.model, turnPrompt, null, images, systemPrompt, options);
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
    const rawOutput = await llmProvider.runModel(resolvedJudgeModel, judgePrompt, null, images, judgeSystemPrompt, getModelOptions("Debate", judgePersona, unrestricted));
    judgeText = parseCleanAnswer(rawOutput);
    await fakeStreamChunked(res, judgeText, { type: "vote-judge-chunk", model: resolvedJudgeModel, personaId: judgePersona?.id });
  } catch (e) {
    judgeText += ` [Error: ${e.message}]`;
    res.write(`data: ${JSON.stringify({ type: "vote-judge-chunk", content: ` [Error: ${e.message}]` })}\n\n`);
  }
  
  res.write(`data: ${JSON.stringify({ type: "vote-judge-end", model: resolvedJudgeModel })}\n\n`);
  s.messages.push({ role: "vote-judge", content: judgeText, time: new Date().toISOString(), model: resolvedJudgeModel, personaId: judgePersona?.id });

  await saveSessionToDisk(s);
}
