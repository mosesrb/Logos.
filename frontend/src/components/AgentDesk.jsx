import React, { useState, useRef, useEffect } from 'react';

// Tool display names for the permission matrix
const TOOL_META = {
  executeCommand:      { label: 'SHELL_EXEC',    icon: '⚡', desc: 'Run bash commands in workspace' },
  readFileTool:        { label: 'FILE_READ',      icon: '📄', desc: 'Read any file by path' },
  listDirTool:         { label: 'DIR_LIST',       icon: '📁', desc: 'List directory contents' },
  mempalaceSearch:     { label: 'MEM_SEARCH',     icon: '🧠', desc: 'Search MemPalace (opt-in)' },
  mempalaceDiaryWrite: { label: 'MEM_WRITE',      icon: '📓', desc: 'Write to memory (opt-in)' },
};

const ALL_TOOLS = Object.keys(TOOL_META);
const DEFAULT_TOOLS_ARRAY = ['executeCommand', 'readFileTool', 'listDirTool'];

// ── Render a single trace event node ──
function TraceNode({ event }) {
  const [collapsed, setCollapsed] = useState(false);

  if (event.type === 'agent-status') {
    return (
      <div className="trace-node trace-status">
        <span className="trace-icon">⟳</span>
        <span className="trace-msg">{event.msg}</span>
      </div>
    );
  }

  if (event.type === 'thought') {
    return (
      <div className="trace-node trace-thought">
        <div className="trace-node-header" onClick={() => setCollapsed(c => !c)}>
          <span className="trace-icon">💭</span>
          <span className="trace-label">THOUGHT</span>
          <span className="trace-collapse-btn">{collapsed ? '▸' : '▾'}</span>
        </div>
        {!collapsed && <div className="trace-body trace-thought-body">{event.content}</div>}
      </div>
    );
  }

  if (event.type === 'agent-tool-start') {
    const meta = TOOL_META[event.tool] || { label: event.tool, icon: '🔧' };
    return (
      <div className="trace-node trace-tool-start">
        <div className="trace-node-header" onClick={() => setCollapsed(c => !c)}>
          <span className="trace-icon">{meta.icon}</span>
          <span className="trace-tool-badge">{meta.label}</span>
          <span className="trace-label-dim">TOOL_INVOKE</span>
          <span className="trace-collapse-btn">{collapsed ? '▸' : '▾'}</span>
        </div>
        {!collapsed && (
          <div className="trace-body">
            <div className="trace-kv-label">ARGS:</div>
            <pre className="trace-pre">{JSON.stringify(event.args, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  }

  if (event.type === 'agent-tool-result') {
    const meta = TOOL_META[event.tool] || { label: event.tool, icon: '🔧' };
    const isErr = event.result?.success === false;
    return (
      <div className={`trace-node ${isErr ? 'trace-tool-error' : 'trace-tool-result'}`}>
        <div className="trace-node-header" onClick={() => setCollapsed(c => !c)}>
          <span className="trace-icon">{isErr ? '❌' : '✅'}</span>
          <span className="trace-tool-badge">{meta.label}</span>
          <span className="trace-label-dim">RESULT</span>
          <span className="trace-collapse-btn">{collapsed ? '▸' : '▾'}</span>
        </div>
        {!collapsed && (
          <div className="trace-body">
            <pre className="trace-pre">{JSON.stringify(event.result, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  }

  if (event.type === 'agent-error') {
    return (
      <div className="trace-node trace-error">
        <span className="trace-icon">🔴</span>
        <span className="trace-msg">{event.content}</span>
      </div>
    );
  }

  return null;
}

// ── Main Component ──
export default function AgentDesk({ personas = [], API, darkMode, onExit, activeSession }) {
  // Persistence Helpers
  const getPersisted = (key, fallback) => {
    const val = localStorage.getItem(`agent_desk_${key}`);
    return val ? JSON.parse(val) : fallback;
  };

  const [goal, setGoal]                           = useState('');
  const [selectedPersonaId, setSelectedPersonaId] = useState(() => getPersisted('personaId', ''));
  const [allowedTools, setAllowedTools]           = useState(() => new Set(getPersisted('tools', DEFAULT_TOOLS_ARRAY)));
  const [maxLoops, setMaxLoops]                   = useState(() => getPersisted('maxLoops', 8));
  const [includeChatContext, setIncludeChatContext] = useState(() => getPersisted('includeContext', false));
  
  // Execution state
  const [isRunning, setIsRunning]                 = useState(false);
  const [traceEvents, setTraceEvents]             = useState([]);
  const [finalAnswer, setFinalAnswer]             = useState(null);
  const [deskHistory, setDeskHistory]             = useState([]); 
  
  // Follow-up state
  const [followUp, setFollowUp]                   = useState('');
  const [copySuccess, setCopySuccess]             = useState(false);
  const [downloadSuccess, setDownloadSuccess]     = useState(false);

  const abortControllerRef = useRef(null);
  const traceEndRef = useRef(null);

  // Auto-scroll trace
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [traceEvents]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('agent_desk_personaId', JSON.stringify(selectedPersonaId));
    localStorage.setItem('agent_desk_tools', JSON.stringify([...allowedTools]));
    localStorage.setItem('agent_desk_maxLoops', JSON.stringify(maxLoops));
    localStorage.setItem('agent_desk_includeContext', JSON.stringify(includeChatContext));
  }, [selectedPersonaId, allowedTools, maxLoops, includeChatContext]);

  function toggleTool(tool) {
    setAllowedTools(prev => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });
  }

  async function dispatchAgent(isIteration = false) {
    const promptToUse = isIteration ? followUp.trim() : goal.trim();
    if (!promptToUse) return;

    setIsRunning(true);
    setTraceEvents([]);
    
    let currentHistory = isIteration ? [...deskHistory] : [];
    
    if (!isIteration && includeChatContext && activeSession?.messages) {
      const imported = activeSession.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));
      currentHistory = [...imported];
    }

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API}/agent/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: promptToUse,
          personaId: selectedPersonaId || null,
          allowedTools: [...allowedTools],
          maxLoops,
          history: currentHistory
        }),
        signal: abortControllerRef.current.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastFinalAnswer = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, '').trim();
          if (!line || line === '[DONE]') continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'agent-final') {
              lastFinalAnswer = event.content;
              setFinalAnswer(event.content);
            }
            setTraceEvents(prev => [...prev, event]);
          } catch { /* ignore sse chunks */ }
        }
      }

      setDeskHistory(prev => [
        ...currentHistory, 
        { role: 'user', content: promptToUse },
        { role: 'assistant', content: lastFinalAnswer || '(No response captured)' }
      ]);
      
      if (isIteration) setFollowUp('');
      else setGoal('');

    } catch (err) {
      if (err.name !== 'AbortError') {
        setTraceEvents(prev => [...prev, { type: 'agent-error', content: `Connection error: ${err.message}` }]);
      }
    } finally {
      setIsRunning(false);
    }
  }

  function wipeMission() {
    setGoal('');
    setFollowUp('');
    setTraceEvents([]);
    setFinalAnswer(null);
    setDeskHistory([]);
  }

  function abortAgent() {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    setTraceEvents(prev => [...prev, { type: 'agent-status', msg: '⏹ Mission aborted by operator.' }]);
  }

  function copyAnswer() {
    if (!finalAnswer) return;
    navigator.clipboard.writeText(finalAnswer);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  function downloadAnswer() {
    if (!finalAnswer) return;
    const blob = new Blob([finalAnswer], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-output-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2000);
  }

  const selectedPersona = personas.find(p => p.id === selectedPersonaId);

  return (
    <div className={`agent-desk${darkMode ? ' dark-mode' : ''}`}>

      {/* ── DESK HEADER ── */}
      <div className="agent-desk-header">
        <div className="agent-desk-title">
          {onExit && (
            <button className="agent-back-btn" onClick={onExit} title="Return to Chat">
              ← CHAT
            </button>
          )}
          <span className="agent-desk-icon">⚙️</span>
          <span>AGENTIC_OPERATIONS_DESK</span>
          <span className="hardware-id">// LOGOS_LOOP_ENGINE v2.2</span>
        </div>
        <div className="header-actions">
          <button className="agent-wipe-btn" onClick={wipeMission} disabled={isRunning} title="Clear current mission state">
            清 WIPEE_STATE
          </button>
          {isRunning && (
            <button className="agent-abort-btn" onClick={abortAgent}>
              ⏹ ABORT_MISSION
            </button>
          )}
        </div>
      </div>

      <div className="agent-desk-body">

        {/* ══════════════════════════════════════════
             PANEL 1 — TASK CONFIGURATOR (Left column)
            ══════════════════════════════════════════ */}
        <section className="agent-panel task-configurator">
          <div className="agent-panel-label">01 // TASK_CONFIGURATOR</div>

          <div className="agent-field">
            <label className="agent-field-label">NEW_MISSION_OBJECTIVE</label>
            <textarea
              className="agent-goal-input"
              rows={5}
              placeholder="Describe the autonomous task..."
              value={goal}
              onChange={e => setGoal(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <div className="agent-field">
            <label className="agent-field-label">CONTEXT_INJECTION</label>
            <div 
              className={`context-toggle ${includeChatContext ? 'active' : ''}`}
              onClick={() => !isRunning && setIncludeChatContext(!includeChatContext)}
            >
              <div className="toggle-slider" />
              <div className="toggle-text">
                <span className="toggle-label">IMPORT_ACTIVE_CHAT_HISTORY</span>
                <span className="toggle-desc">Injects last 10 messages from current session</span>
              </div>
            </div>
          </div>

          <div className="agent-field-row">
            <div className="agent-field agent-field-half">
              <label className="agent-field-label">ENTITY_CORE</label>
              <select
                className="agent-select"
                value={selectedPersonaId}
                onChange={e => setSelectedPersonaId(e.target.value)}
                disabled={isRunning}
              >
                <option value="">⚡ Auto (AXON Agent)</option>
                {personas.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedPersona && (
                <div className="persona-mini-meta">
                  <div className="meta-row"><span>MODEL:</span> {selectedPersona.model}</div>
                  <div className="meta-row"><span>EXPERTISE:</span> {selectedPersona.core_expertise || 'Generalist'}</div>
                </div>
              )}
            </div>

            <div className="agent-field agent-field-half">
              <label className="agent-field-label">MAX_LOOPS — {maxLoops}</label>
              <input
                type="range" min={2} max={20} value={maxLoops}
                onChange={e => setMaxLoops(Number(e.target.value))}
                disabled={isRunning}
                className="agent-slider"
              />
            </div>
          </div>

          <div className="agent-field">
            <label className="agent-field-label">TOOL_PERMISSION_MATRIX</label>
            <div className="tool-matrix">
              {ALL_TOOLS.map(tool => {
                const meta = TOOL_META[tool];
                const enabled = allowedTools.has(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    className={`tool-toggle ${enabled ? 'tool-on' : 'tool-off'}`}
                    onClick={() => toggleTool(tool)}
                    disabled={isRunning}
                    title={meta.desc}
                  >
                    <span className="tool-toggle-icon">{meta.icon}</span>
                    <span className="tool-toggle-label">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className={`agent-dispatch-btn ${isRunning ? 'agent-dispatch-running' : ''}`}
            onClick={() => dispatchAgent(false)}
            disabled={!goal.trim() || isRunning}
          >
            {isRunning ? 'EXECUTING...' : '⚡ DISPATCH_AGENT'}
          </button>
        </section>

        {/* ══════════════════════════════════════════
             RIGHT COLUMN — Trace (compact) + Artifact (large)
            ══════════════════════════════════════════ */}
        <div className="agent-right-col">

          {/* PANEL 2 — EXECUTION TRACE */}
          <section className="agent-panel execution-trace">
            <div className="agent-panel-label">
              02 // EXECUTION_TRACE {deskHistory.length > 0 && `(TURN ${Math.floor(deskHistory.length/2) + 1})`}
              {isRunning && <span className="trace-live-badge">● LIVE</span>}
            </div>
            <div className="trace-scroll custom-scrollbar">
              {traceEvents.length === 0 && !isRunning && (
                <div className="trace-empty">Awaiting dispatch...</div>
              )}
              {traceEvents.map((event, i) => (
                <TraceNode key={i} event={event} />
              ))}
              <div ref={traceEndRef} />
            </div>
          </section>

          {/* PANEL 3 — ARTIFACT OUTPUT */}
          <section className="agent-panel artifact-panel">
            <div className="agent-panel-label">03 // ARTIFACT_OUTPUT</div>
            
            <div className="artifact-scroll-area custom-scrollbar">
              {finalAnswer ? (
                <div className="artifact-content">
                  <pre className="artifact-pre">{finalAnswer}</pre>
                </div>
              ) : (
                <div className="trace-empty">Output pending...</div>
              )}
            </div>

            {/* Iterative Follow-up bar */}
            <div className="artifact-footer">
              <div className="artifact-actions">
                <button className="artifact-btn" onClick={copyAnswer} disabled={!finalAnswer}>
                  {copySuccess ? '✓ COPIED' : '📋 COPY'}
                </button>
                <button className="artifact-btn" onClick={downloadAnswer} disabled={!finalAnswer}>
                  {downloadSuccess ? '✓ SAVED' : '💾 SAVE_.MD'}
                </button>
              </div>

              <div className="iteration-bar">
                <input 
                  className="iteration-input"
                  placeholder="Ask for refinement or next step..."
                  value={followUp}
                  onChange={e => setFollowUp(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && dispatchAgent(true)}
                  disabled={isRunning}
                />
                <button 
                  className="iteration-btn"
                  onClick={() => dispatchAgent(true)}
                  disabled={isRunning || !followUp.trim()}
                >
                  ⚡
                </button>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
