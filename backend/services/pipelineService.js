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

// Helper for streaming to client. Note: It's copied from chatController to keep services decoupled
async function fakeStreamChunked(res, content, metaObj) {
  const chunks = content.match(/.{1,10}/g) || [content];
  for (const chunk of chunks) {
    if (chunk) {
      res.write(`data: ${JSON.stringify({ ...metaObj, content: chunk })}\n\n`);
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

export async function executePipeline({
  res, sessionId, prompt, personaIds, webMode, ragMode, images, pinnedMemories,
  pipelineStages, context
}) {
  const {
    UTILITY_MODEL, addLog, buildPersonaSystemPrompt, buildFullPrompt, getModelOptions
  } = context;

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

  if (leadPersona) {
    const relKey = `${sessionId}_${leadPersona.id}`;
    const rel = await getRelationship(relKey.split("_")[1]);
    await syncRelationship(relKey.split("_")[1], updateRelationship(rel, prompt));
    context.saveRelationships();
    tagAndStoreMemory(sessionId, prompt, "pipeline_input", (await getRelationship(relKey.split("_")[1])));
  }

  const s = await ensureSession(sessionId);
  s.messages.push({ role: "user", content: prompt, time: new Date().toISOString(), images });
  await saveSessionToDisk(s);

  addLog(sessionId, `SYNAPSE: Pipeline initiated [${pipelineStages.length} stages]`, "sys");

  let previousOutput = "";
  const pipelineResults = [];
  const pipelineTrace = []; 

  for (let i = 0; i < pipelineStages.length; i++) {
    const stage = pipelineStages[i];
    const assignedPersonaId = stage.personaId || (personaIds.length > 0 ? personaIds[Math.min(i, personaIds.length - 1)] : null);
    const persona = assignedPersonaId ? (await getPersona(assignedPersonaId)) : null;
    
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
      const rawOutput = await llmProvider.runModel(model, stagePrompt, null, images, systemPrompt, { skipRouting: true });
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

  const activePersonaId = leadPersona?.id || "assistant";
  indexEpisodicMemory(sessionId, "user", prompt, null, activePersonaId);
  indexEpisodicMemory(sessionId, "assistant", previousOutput, null, activePersonaId);

  addLog(sessionId, `SYNAPSE: Pipeline complete [${pipelineResults.length} stages]`, "sys");
  res.write(`data: ${JSON.stringify({ type: "pipeline-complete" })}\n\n`);
}
