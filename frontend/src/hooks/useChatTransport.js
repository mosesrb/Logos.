import { useState, useRef } from 'react';

export function useChatTransport({
  API,
  currentSession,
  visionBuffer, setVisionBuffer,
  pinnedMemories, setPinnedMemories,
  input, setInput,
  pushLocalMessage, setLastUserMessage,
  addLog, dispatchStreamLog,
  setMetrics,
  interactionMode, selectedPersonaId, selectedPersonaIds,
  selectedModelSingle, webMode, ragMode, unrestrictedMode,
  debateTurns, judgePersonaId,
  synapsePreset, selectedScenarioId, scenarios, personaMap,
  hiddenIntents, roleModelMap, personas,
  setPipelineStatus, autoRead, speakText,
  setMessages, setMapTransform, setMapHasMoved, setIsDraggingMap, setDragStart, mapTransform, isDraggingMap, dragStart
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingBlocks, setStreamingBlocks] = useState([]);
  
  // ─── Shared SSE stream reader ───
  async function readEventStream(res, handler) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    const startTime = Date.now();
    let totalChars = 0;

    let lineBuffer = "";
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) {
        lineBuffer += decoder.decode(value, { stream: true });
        const parts = lineBuffer.split(/\r?\n/);
        // Keep the last partial line
        lineBuffer = parts.pop();

        for (const part of parts) {
          if (!part.trim()) continue;
          if (part.includes("[DONE]")) return;
          const cleaned = part.replace(/^data:\s*/, "");
          try {
            const obj = JSON.parse(cleaned);

            // 1. Intercept sources metadata
            if (obj.sources && Array.isArray(obj.sources)) {
              handler({ type: "sources", data: obj.sources });
              continue;
            }

            // 2. Process text content
            const content = obj.content || obj.response || (obj.message && obj.message.content);
            if (content) totalChars += content.length;

            // Calc TPS
            const elapsed = (Date.now() - startTime) / 1000;
            const tps = elapsed > 0 ? Math.round((totalChars / 4) / elapsed) : 0;
            setMetrics(prev => ({ ...prev, tps }));

            // Map obj so handlers don't break
            if (content && !obj.content) obj.content = content;
            handler(obj);
          } catch (e) {
            console.warn("SSE JSON parse error:", e, cleaned);
          }
        }
      }
    }
  }

  const handleMapWheel = (e) => {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const newScale = Math.max(0.1, Math.min(5, mapTransform.k + delta * zoomSpeed));
    setMapTransform(prev => ({ ...prev, k: newScale }));
  };

  const handleMapMouseDown = (e) => {
    if (e.button === 0) { // Left Click
      setIsDraggingMap(true);
      setMapHasMoved(false);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMapMouseMove = (e) => {
    if (isDraggingMap) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setMapHasMoved(true);
      }
      setMapTransform(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMapMouseUp = () => {
    setIsDraggingMap(false);
  };

  // ─── Send Message Controller ───
  const sendMessage = async (overridePrompt = null, isSpontaneous = false) => {
    const text = (overridePrompt || input).trim();
    const hasVision = visionBuffer.length > 0;

    if ((!text && !hasVision) || !currentSession?.id || isStreaming) return;

    if (!isSpontaneous) {
      pushLocalMessage({ role: "user", content: text, time: new Date().toISOString() });
      setLastUserMessage({ content: text, time: new Date().toISOString() }); // Phase 26
      setInput("");
    } else {
      addLog(`SPONTANEOUS_TRIGGER: ${text.slice(0, 30)}...`, "sys");
    }

    setIsStreaming(true);
    setStreamingBlocks([]);

    addLog(`INIT_SESSION: ${currentSession.id.slice(0, 8)}`, "sys");
    addLog(`MODE_SET: ${interactionMode}${webMode ? " + WEB" : ""}${ragMode ? " + RAG" : ""}`, "sys");

    setPipelineStatus(null);
    setMetrics(prev => ({ ...prev, latency: 0, tokens: text.length }));

    try {
      switch (interactionMode) {
        case "Agent":
          await handleAgent(text);
          break;
        case "Parallel":
          await handleParallel(text);
          break;
        case "Debate":
          await handleDebate(text);
          break;
        case "Collaborate":
          await handleCollaborate(text);
          break;
        case "Pipeline":
          await handlePipeline(text);
          break;
        case "Scenario":
          await handleScenario(text);
          break;
        default:
          await handleNormal(text);
      }
    } catch (err) {
      console.error(err);
    }
    setIsStreaming(false);
    setStreamingBlocks([]);
  };

  const abortControllerRef = useRef(null);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      setStreamingBlocks([]);
      addLog("Generation stopped by user.", "sys");
    }
  };

  // ─── Normal single chat ───
  
  async function handleAgent(prompt) {
    const currentPersona = personas.find(p => p.id === selectedPersonaId);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nexus-agent-stream", { detail: { type: "system", msg: `Initializing Agent [Persona: ${currentPersona?.name || "System"}]...` } }));
    
    // Initialize AbortController for manual stop
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    let lastDataTime = Date.now();
    let hangCheckInterval = null;

    try {
        hangCheckInterval = setInterval(() => {
            if (Date.now() - lastDataTime > 300000) { // 300s timeout
                console.warn("⏱️ Agent Stream Timeout: No data received for 300s. Aborting.");
                handleStopGeneration();
            }
        }, 5000);

        const response = await fetch(`${API}/agent/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({ 
                message: prompt, 
                model: selectedModelSingle, 
                sessionId: currentSession?.id,
                systemPrompt: currentPersona?.system_prompt || "You are an autonomous AI engineering agent. Use tools to solve the user request. Keep responses technical and concise.",
                persona: currentPersona,
                images: cleanImages
            })
        });
        setVisionBuffer([]);
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            lastDataTime = Date.now(); // Update heartbeat
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            
            for (let line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.replace("data: ", "").trim();
                    if (dataStr === "[DONE]") {
                        reader.cancel(); // Force close the reader
                        break;
                    }
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nexus-agent-stream", { detail: parsed }));
                        
                        if (parsed.type === "agent-status") {
                             setStreamingBlocks([{ label: "AGENT", content: `⚙️ ${parsed.msg}` }]);
                        }

                        if (parsed.type === "agent-final" || parsed.type === "agent-error") {
                             setStreamingBlocks([]);
                             setMessages(prev => [...prev, {
                                id: Date.now(),
                                role: "assistant",
                                content: parsed.content || parsed.text,
                                time: new Date().toLocaleTimeString()
                             }]);
                        }
                    } catch (e) {}
                }
            }
        }
    } catch(e) {
        if (e.name === 'AbortError') {
            console.log("Agent request aborted.");
        } else {
            console.error("Agent handle error:", e);
        }
    } finally {
        if (hangCheckInterval) clearInterval(hangCheckInterval);
        setIsStreaming(false);
        setStreamingBlocks([]);
    }
}


  async function handleNormal(prompt) {
    addLog(`START_STREAM: ${selectedModelSingle}`, "model");
    const startTime = Date.now();
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    let lastDataTime = Date.now();
    const hangCheckInterval = setInterval(() => {
        if (Date.now() - lastDataTime > 300000) { // 300s for normal chat
            console.warn("⏱️ Normal Stream Timeout: No data received for 300s. Aborting.");
            handleStopGeneration();
            clearInterval(hangCheckInterval);
        }
    }, 5000);

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    try {
        const res = await fetch(`${API}/chat/${currentSession.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            prompt,
            model: selectedModelSingle,
            webMode,
            ragMode,
            images: cleanImages,
            pinnedMemories,
            personaId: selectedPersonaId || null,
            unrestricted: unrestrictedMode,
          }),
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "STREAM_INITIALIZATION_CRASH" }));
          const errMsg = errorData.error || `OLLAMA_HTTP_${res.status}`;
          addLog(`❌ STREAM_ERROR: ${errMsg}`, "sys");
          pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE" });
          setVisionBuffer([]);
          return;
        }

        setVisionBuffer([]);
        setPinnedMemories([]); // Clear after send
        
        let buf = "";
        let thoughtBuf = "";
        let capturedSources = [];
        let firstChunk = true;
        let pendingTrigger = null;

        // Initial status pulse (Thinking heartbeat)
        const personaName = personas.find(p => p.id === selectedPersonaId)?.name || selectedModelSingle;
        setStreamingBlocks([{ label: personaName, content: "", thought: "Neural processing...", personaId: selectedPersonaId }]);

        await readEventStream(res, (obj) => {
          lastDataTime = Date.now(); // Heartbeat
          if (firstChunk) {
            setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
            firstChunk = false;
            setStreamingBlocks([]); // Clear the heartbeat once data arrives
          }
          if (obj.type === "status") {
            setStreamingBlocks([{ label: personaName, content: "", thought: obj.content, personaId: selectedPersonaId }]);
            return;
          }
          if (obj.type === "thought") {
            const content = obj.content ?? "";
            thoughtBuf += content;
            addLog(content, "thought");
            setStreamingBlocks([{ label: personaName, content: buf, thought: "Thinking...", personaId: selectedPersonaId }]);
            return;
          }
          if (obj.type === "sources") {
            capturedSources = obj.data;
            return;
          }
          if (obj.type === "trigger") {
            pendingTrigger = obj;
            return;
          }
          if (obj.type === "image") {
            const imgMark = `\n\n![Generated Image](${obj.content})\n\n`;
            buf += imgMark;
            dispatchStreamLog(`[IMAGE_GEN]`, 'model-chunk');
            setStreamingBlocks([{ label: personaName, content: buf, thought: thoughtBuf, personaId: selectedPersonaId }]);
            return;
          }
          const content = obj.content ?? "";
          buf += content;
          dispatchStreamLog(content, 'model-chunk');
          setMetrics(prev => ({ ...prev, tokens: prompt.length + buf.length }));
          setStreamingBlocks([{
            label: personaName,
            content: buf,
            thought: thoughtBuf,
            personaId: selectedPersonaId
          }]);
        });

        addLog(`END_STREAM: ${selectedModelSingle} (${buf.length} chars)`, "model");
        const finalContent = buf.trim() || `❌ RETINA_ERROR: Model [${selectedModelSingle}] returned an empty response.`;
        pushLocalMessage({ role: "assistant", content: finalContent, thought: thoughtBuf.trim(), model: selectedModelSingle, sources: capturedSources, personaId: selectedPersonaId });
        if (autoRead) speakText(finalContent, selectedPersonaId);

        if (pendingTrigger) {
          const trigger = pendingTrigger;
          addLog(`📡 REACTING: ${trigger.action} for ${trigger.personaId}`, "sys");
          setTimeout(() => {
            handleNormal(trigger.content); 
          }, 1500);
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log("Normal request aborted.");
        } else {
            console.error("Normal Chat Stream Failed:", e);
            addLog(`❌ NETWORK_OR_BACKEND_FAILURE: ${e.message}`, "err");
            pushLocalMessage({ role: "error", content: `❌ CONNECTION_FAILURE: ${e.message}. Ensure backend is running on :3008.`, model: "LOGOS_CORE" });
        }
    } finally {
        clearInterval(hangCheckInterval);
        abortControllerRef.current = null;
    }
  }

  // ─── Parallel ───
  async function handleParallel(prompt) {
    const ms = selectedPersonaIds.length ? selectedPersonaIds : [];
    if (!ms.length) {
      addLog("❌ PARALLEL_ERROR: No personas selected.", "err");
      setIsStreaming(false);
      return;
    }
    const buffers = {};
    ms.forEach((m) => (buffers[m] = ""));

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    const res = await fetch(`${API}/chat/parallel/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, personaIds: selectedPersonaIds, webMode, ragMode, images: cleanImages, pinnedMemories, unrestricted: unrestrictedMode }),
    });
    setPinnedMemories([]); // Clear after send

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "PARALLEL_STREAM_CRASH" }));
      const errMsg = errorData.error || `OLLAMA_HTTP_${res.status}`;
      addLog(`❌ PARALLEL_ERROR: ${errMsg}`, "sys");
      pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE" });
      setVisionBuffer([]);
      return;
    }

    setVisionBuffer([]);
    addLog(`START_PARALLEL: ${ms.join(", ")}`, "sys");
    const startTime = Date.now();
    let capturedSources = [];
    let firstChunk = true;
    await readEventStream(res, (obj) => {
      if (firstChunk) {
        setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
        firstChunk = false;
      }
      if (obj.type === "sources") {
        capturedSources = obj.data;
        return;
      }
      const m = obj.personaName || obj.model || "AI";
      const pId = obj.personaId || null;
      buffers[m] = { content: (buffers[m]?.content || "") + (obj.content ?? ""), personaId: pId };
      const totalChars = prompt.length + Object.values(buffers).reduce((a, b) => a + b.content.length, 0);
      setMetrics(prev => ({ ...prev, tokens: totalChars }));
      setStreamingBlocks(Object.entries(buffers).map(([label, data]) => ({ label, content: data.content, type: "parallel" })));
    });
    addLog(`END_PARALLEL: All streams complete`, "sys");
    Object.entries(buffers).forEach(([m, data]) =>
      pushLocalMessage({ role: `assistant-${m}`, content: data.content.trim(), model: m, sources: capturedSources, personaId: data.personaId })
    );
  }

  // ─── Debate mode (Judged) ───
  async function handleDebate(prompt) {
    const ms = selectedPersonaIds;
    if (ms.length < 2) {
      addLog("❌ DEBATE_ERROR: Select at least 2 personas for a debate.", "err");
      setIsStreaming(false);
      return;
    }
    if (ms.length < 2) {
      pushLocalMessage({ role: "system", content: "Debate mode requires at least 2 models." });
      return;
    }
    const blocks = [];
    let current = null;
    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    const res = await fetch(`${API}/chat/debate/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        personaIds: selectedPersonaIds,
        turns: debateTurns,
        judgePersonaId,
        images: cleanImages,
        pinnedMemories,
        unrestricted: unrestrictedMode
      }),
    });
    setPinnedMemories([]); // Clear after send

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "DEBATE_STREAM_CRASH" }));
      const errMsg = errorData.error || `OLLAMA_HTTP_${res.status}`;
      addLog(`❌ DEBATE_ERROR: ${errMsg}`, "sys");
      pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE" });
      setVisionBuffer([]);
      return;
    }

    setVisionBuffer([]);
    addLog(`START_DEBATE: ${ms.join(" vs ")}`, "sys");
    const startTime = Date.now();
    let capturedSources = [];
    let firstChunk = true;
    await readEventStream(res, (obj) => {
      if (firstChunk) {
        setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
        firstChunk = false;
      }
      if (obj.type === "sources") {
        capturedSources = obj.data;
        return;
      }
      if (obj.type === "turn-start") {
        addLog(`DEBATE_TURN_START: ${obj.personaName || obj.model}`, "model");
        setPipelineStatus({ stage: `Debate: ${obj.personaName || obj.model}`, current: obj.turn, total: debateTurns * ms.length + 1 });
        current = { label: obj.personaName || obj.model, model: obj.model, personaId: obj.personaId, turn: obj.turn, content: "", type: "debate" };
        blocks.push(current);
      } else if (obj.type === "turn-chunk" && current) {
        current.content += obj.content;
        dispatchStreamLog(obj.content, 'model-chunk');
        const totalChars = prompt.length + blocks.reduce((a, b) => a + (b.content?.length || 0), 0);
        setMetrics(prev => ({ ...prev, tokens: totalChars }));
        setStreamingBlocks([...blocks]);
      } else if (obj.type === "turn-end") {
        addLog(`DEBATE_TURN_END: ${obj.personaName || obj.model}`, "model");
        setStreamingBlocks([...blocks]);
      } else if (obj.type === "vote-judge-start") {
        addLog(`JUDGE_START: ${obj.personaName || obj.model}`, "model");
        setPipelineStatus({ stage: `Judging: ${obj.personaName || obj.model}`, current: debateTurns * 2 + 1, total: debateTurns * 2 + 1 });
        current = { label: `🏛 Judge Verdict`, model: obj.model, personaId: obj.personaId, content: "", type: "vote-judge" };
        blocks.push(current);
      } else if (obj.type === "vote-judge-chunk" && current) {
        current.content += obj.content;
        const totalChars = prompt.length + blocks.reduce((a, b) => a + (b.content?.length || 0), 0);
        setMetrics(prev => ({ ...prev, tokens: totalChars }));
        setStreamingBlocks([...blocks]);
      } else if (obj.type === "vote-judge-end") {
        addLog(`JUDGE_COMPLETE`, "model");
        setStreamingBlocks([...blocks]);
      }
    });
    addLog(`DEBATE_SESSION_COMPLETE`, "sys");
    if (blocks.length === 0 || blocks.every(b => !b.content.trim())) {
      pushLocalMessage({ role: "assistant", content: `❌ RETINA_ERROR: Debate failed to generate content. This usually happens if the vision encoder or judges crash.`, model: "LOGOS_CORE" });
      return;
    }
    blocks.forEach((b) => {
      if (b.type === "vote-judge") {
        pushLocalMessage({ role: "vote-judge", content: b.content.trim(), model: b.model, sources: capturedSources, personaId: b.personaId });
      } else {
        pushLocalMessage({ role: `debate-${b.model}`, content: b.content.trim(), model: b.model, turn: b.turn, sources: capturedSources, personaId: b.personaId });
      }
    });
  }

  // ─── Collaborate ───
  async function handleCollaborate(prompt) {
    const ms = selectedPersonaIds.length >= 2 ? selectedPersonaIds : [];
    if (ms.length < 2) {
      addLog("❌ COLLAB_ERROR: Select at least 2 personas for collaboration.", "err");
      setIsStreaming(false);
      return;
    }
    const stages = [];
    let currentStage = null;

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    const res = await fetch(`${API}/chat/collaborate/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, personaIds: selectedPersonaIds, webMode, ragMode, images: cleanImages, pinnedMemories, unrestricted: unrestrictedMode }),
    });
    setPinnedMemories([]); // Clear after send

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "COLLABORATE_STREAM_CRASH" }));
      const errMsg = errorData.error || `OLLAMA_HTTP_${res.status}`;
      addLog(`❌ COLLABORATE_ERROR: ${errMsg}`, "sys");
      pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE" });
      setVisionBuffer([]);
      return;
    }

    setVisionBuffer([]);
    const startTime = Date.now();
    let capturedSources = [];
    let firstChunk = true;
    await readEventStream(res, (obj) => {
      if (firstChunk) {
        setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
        firstChunk = false;
      }
      if (obj.type === "sources") {
        capturedSources = obj.data;
        return;
      }
      if (obj.type === "stage-start") {
        addLog(`COLLAB_STAGE_START: ${obj.stage} by ${obj.personaName || obj.model}`, "model");
        setPipelineStatus({ stage: `Collab: ${obj.personaName || obj.model} (${obj.stage})`, current: stages.length + 1, total: 3 });
        currentStage = { label: `${obj.stage}: ${obj.personaName || obj.model}`, model: obj.model, personaId: obj.personaId, stage: obj.stage, content: "", type: "collaborate" };
        stages.push(currentStage);
      } else if (obj.type === "stage-chunk" && currentStage) {
        currentStage.content += obj.content;
        dispatchStreamLog(obj.content, 'model-chunk');
        const totalChars = prompt.length + stages.reduce((a, b) => a + b.content.length, 0);
        setMetrics(prev => ({ ...prev, tokens: totalChars }));
        setStreamingBlocks([...stages]);
      } else if (obj.type === "stage-end") {
        addLog(`COLLAB_STAGE_COMPLETE: ${currentStage.stage}`, "model");
        setStreamingBlocks([...stages]);
      }
    });
    addLog(`COLLABORATION_COMPLETE`, "sys");
    if (stages.length === 0 || stages.every(s => !s.content.trim())) {
      pushLocalMessage({ role: "assistant", content: `❌ RETINA_ERROR: Collaboration pipeline returned empty. Ensure vision-capable models are selected.`, model: "LOGOS_CORE" });
      return;
    }
    stages.forEach((st) =>
      pushLocalMessage({ role: `collab-${st.stage.toLowerCase()}`, content: st.content.trim(), model: st.model, stage: st.stage, sources: capturedSources, personaId: st.personaId })
    );
  }

  // ─── Pipeline (SYNAPSE) ───
  async function handlePipeline(prompt) {
    addLog(`SYNAPSE: Initiating pipeline [${synapsePreset}]`, "sys");

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    const res = await fetch(`${API}/chat/pipeline/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        prompt, 
        presetKey: synapsePreset, 
        webMode, 
        ragMode, 
        images: cleanImages, 
        pinnedMemories, 
        unrestricted: unrestrictedMode,
        personaIds: selectedPersonaIds
      }),
    });
    
    // Signal Check: Ensure the persona mind is being transmitted
    console.log(`🔌 LOGOS_SYNAPSE -> Initiating Assembly Line with Personas: ${selectedPersonaIds.length > 0 ? selectedPersonaIds.join(', ') : "NONE"}`);
    
    setPinnedMemories([]);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "PIPELINE_CRASH" }));
      addLog(`❌ PIPELINE_ERROR: ${errorData.error}`, "sys");
      pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errorData.error}`, model: "LOGOS_CORE" });
      setVisionBuffer([]);
      return;
    }

    setVisionBuffer([]);
    const startTime = Date.now();
    let firstChunk = true;
    const stages = [];
    let currentStage = null;

    await readEventStream(res, (obj) => {
      if (firstChunk) {
        setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
        firstChunk = false;
      }
      if (obj.type === "pipeline-stage-start") {
        addLog(`PIPELINE_STAGE_START: ${obj.role} by ${obj.personaName || obj.model}`, "model");
        setPipelineStatus({ stage: `Synapse: ${obj.personaName || obj.model} (${obj.role})`, current: obj.stageIndex + 1, total: obj.totalStages });
        currentStage = { label: `${obj.role}: ${obj.personaName || obj.model}`, model: obj.model, role: obj.role, content: "", type: "pipeline", personaId: obj.personaId };
        stages.push(currentStage);
      } else if (obj.type === "pipeline-stage-chunk" && currentStage) {
        currentStage.content += obj.content;
        dispatchStreamLog(obj.content, 'model-chunk');
        const totalChars = prompt.length + stages.reduce((a, b) => a + b.content.length, 0);
        setMetrics(prev => ({ ...prev, tokens: totalChars }));
        setStreamingBlocks([...stages]);
      } else if (obj.type === "pipeline-stage-end") {
        addLog(`SYNAPSE_STAGE_COMPLETE: ${obj.role}`, "model");
        setStreamingBlocks([...stages]);
      }
    });

    addLog(`SYNAPSE_PIPELINE_COMPLETE`, "sys");
    setPipelineStatus(null);
    if (stages.length === 0 || stages.every(s => !s.content.trim())) {
      pushLocalMessage({ role: "assistant", content: `❌ SYNAPSE_ERROR: Pipeline returned empty. Check model availability.`, model: "LOGOS_CORE" });
      return;
    }
    stages.forEach((st) =>
      pushLocalMessage({ role: `pipeline-${st.role.toLowerCase()}`, content: st.content.trim(), model: st.model, stage: st.role })
    );
  }


  // Stale model selection functions removed (Persona-centric refactor)

  // ─── Scenario ───
  async function handleScenario(prompt) {
    if (!selectedScenarioId) return;
    const scenario = scenarios.find(s => s.id === selectedScenarioId);
    if (!scenario) return;

    addLog(`START_SCENARIO: ${scenario.name}`, "sys");
    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);

    const res = await fetch(`${API}/chat/scenario/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        scenarioId: selectedScenarioId,
        personaMap: { ...personaMap, ...(scenario.personaMap || {}) }, // Scenario personas override manual ones
        webMode,
        ragMode: scenario.rag_mode ?? ragMode,
        images: cleanImages,
        unrestricted: scenario.unrestricted_mode ?? unrestrictedMode,
        hiddenIntents: { ...hiddenIntents, ...(scenario.hiddenIntents || {}) }, // Scenario intents override manual ones
        roleModelMap
      }),
    });

    if (!res.ok) {
      addLog(`❌ SCENARIO_ERROR: ${res.status}`, "sys");
      setVisionBuffer([]);
      return;
    }
    setVisionBuffer([]);

    setVisionBuffer([]);
    const roleBuffers = {};
    scenario.participant_roles.forEach(r => roleBuffers[r] = { content: "", thought: "", personaId: null });

    await readEventStream(res, (obj) => {
      if (obj.type === "scenario-role-start") {
        addLog(`ROLE_ACTIVATE: ${obj.role}`, "sys");
      }
      if (obj.role) {
        if (!roleBuffers[obj.role]) roleBuffers[obj.role] = { content: "", thought: "", personaId: obj.personaId };
        
        if (obj.type === "thought") {
          roleBuffers[obj.role].thought += obj.content;
        } else if (obj.content) {
          roleBuffers[obj.role].content += obj.content;
          dispatchStreamLog(obj.content, 'model-chunk');
        }

        setStreamingBlocks(Object.entries(roleBuffers)
          .filter(([_, data]) => data.content.length > 0 || data.thought.length > 0)
          .map(([role, data]) => ({ label: role, content: data.content, thought: data.thought, personaId: data.personaId }))
        );
      }
    });

    Object.entries(roleBuffers).forEach(([role, data]) => {
      if (data.content) {
        pushLocalMessage({
          role: `scenario-${role}`,
          content: data.content.trim(),
          thought: data.thought.trim(),
          model: role,
          personaId: data.personaId,
          isScenarioResponse: true
        });
      }
    });
    setIsStreaming(false);
  }


  return {
    isStreaming, setIsStreaming,
    streamingBlocks, setStreamingBlocks,
    sendMessage, handleStopGeneration
  };
}
