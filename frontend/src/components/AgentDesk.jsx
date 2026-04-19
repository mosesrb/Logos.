import React, { useState, useRef, useEffect } from 'react';

const TOOL_META = {
  executeCommand:      { label: 'SHELL_EXEC',    icon: '⚡', desc: 'Run bash commands in workspace' },
  readFileTool:        { label: 'FILE_READ',      icon: '📄', desc: 'Read any file by path' },
  listDirTool:         { label: 'DIR_LIST',       icon: '📁', desc: 'List directory contents' },
  mempalaceSearch:     { label: 'MEM_SEARCH',     icon: '🧠', desc: 'Search MemPalace (opt-in)' },
  mempalaceDiaryWrite: { label: 'MEM_WRITE',      icon: '📓', desc: 'Write to memory (opt-in)' },
  agentWriteFile:      { label: 'FILE_WRITE',     icon: '💾', desc: 'Write code & check syntax' },
};

const ALL_TOOLS = Object.keys(TOOL_META);
const DEFAULT_TOOLS_ARRAY = ['executeCommand', 'readFileTool', 'listDirTool', 'agentWriteFile'];
const MAX_LOG_ENTRIES = 20;

// ── Extract file paths from trace events ──
function extractFilesFromTrace(events) {
  const files = new Set();
  events.forEach(e => {
    if (e.type === 'agent-tool-start') {
      const args = e.args || {};
      if (args.path) files.add(args.path);
      if (args.filePath) files.add(args.filePath);
      // Detect shell writes: echo > file, > file, tee file
      if (args.command && typeof args.command === 'string') {
        const m = args.command.match(/(?:>>?\s*|tee\s+)([\w./\\-]+\.\w+)/);
        if (m) files.add(m[1]);
      }
    }
  });
  return [...files];
}

// ── Trace node renderer ──
function TraceNode({ event }) {
  const [collapsed, setCollapsed] = useState(false);

  if (event.type === 'agent-status') return (
    <div className="trace-node trace-status">
      <span className="trace-icon">⟳</span>
      <span className="trace-msg">{event.msg}</span>
    </div>
  );

  if (event.type === 'thought') return (
    <div className="trace-node trace-thought">
      <div className="trace-node-header" onClick={() => setCollapsed(c => !c)}>
        <span className="trace-icon">💭</span>
        <span className="trace-label">THOUGHT</span>
        <span className="trace-collapse-btn">{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && <div className="trace-body trace-thought-body">{event.content}</div>}
    </div>
  );

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

  if (event.type === 'agent-error') return (
    <div className="trace-node trace-error">
      <span className="trace-icon">🔴</span>
      <span className="trace-msg">{event.content}</span>
    </div>
  );

  return null;
}

// ── Mission Log Entry ──
function MissionLogEntry({ entry, onView, onDelete, isActive }) {
  const dt = new Date(entry.ts);
  const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div
      className={`mission-log-entry${isActive ? ' mission-log-entry--active' : ''}`}
      onClick={() => onView(entry)}
    >
      <div className="mle-header">
        <span className="mle-date">{dateStr} {timeStr}</span>
        <span className="mle-persona">{entry.personaName}</span>
        <button
          className="mle-delete"
          onClick={e => { e.stopPropagation(); onDelete(entry.id); }}
          title="Delete log entry"
        >×</button>
      </div>
      <div className="mle-goal">{entry.goal.slice(0, 80)}{entry.goal.length > 80 ? '…' : ''}</div>
      {entry.filesWritten.length > 0 && (
        <div className="mle-files">
          {entry.filesWritten.slice(0, 3).map((f, i) => (
            <span key={i} className="mle-file-chip">📄 {f.split(/[/\\]/).pop()}</span>
          ))}
          {entry.filesWritten.length > 3 && (
            <span className="mle-file-chip mle-file-more">+{entry.filesWritten.length - 3}</span>
          )}
        </div>
      )}
      <div className="mle-meta">
        <span>TURNS: {entry.turns}</span>
        {entry.filesWritten.length > 0 && <span>FILES: {entry.filesWritten.length}</span>}
      </div>
    </div>
  );
}

// ── Main Component ──
export default function AgentDesk({ personas = [], API, darkMode, onExit, activeSession }) {
  const getPersisted = (key, fallback) => {
    try {
      const val = localStorage.getItem(`agent_desk_${key}`);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  // Config state
  const [goal, setGoal]                             = useState('');
  const [selectedPersonaId, setSelectedPersonaId]   = useState(() => getPersisted('personaId', ''));
  const [allowedTools, setAllowedTools]             = useState(() => {
    const p = getPersisted('tools', DEFAULT_TOOLS_ARRAY);
    return new Set(Array.isArray(p) ? p : DEFAULT_TOOLS_ARRAY);
  });
  const [maxLoops, setMaxLoops]                     = useState(() => {
    const p = getPersisted('maxLoops', 8);
    return typeof p === 'number' ? p : 8;
  });
  const [includeChatContext, setIncludeChatContext]  = useState(() => {
    const p = getPersisted('includeContext', false);
    return typeof p === 'boolean' ? p : false;
  });

  // Execution state
  const [isRunning, setIsRunning]       = useState(false);
  const [traceEvents, setTraceEvents]   = useState([]);
  const [finalAnswer, setFinalAnswer]   = useState(null);
  const [deskHistory, setDeskHistory]   = useState([]);

  // Critique / follow-up
  const [followUp, setFollowUp]         = useState('');
  const [copySuccess, setCopySuccess]   = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // ── Agent Artifacts (Files) ──
  const [agentFiles, setAgentFiles]     = useState([]);
  const [activeFileContent, setActiveFileContent] = useState(null); // {name, content}

  // ── Option A: Mission Log ──
  const [missionLog, setMissionLog] = useState(() => {
    try {
      const saved = localStorage.getItem('agent_desk_mission_log');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showMissionLog, setShowMissionLog]   = useState(false);
  const [activeMission, setActiveMission]     = useState(null); // viewing past mission

  const abortControllerRef = useRef(null);
  const traceEndRef        = useRef(null);
  const logEndRef          = useRef(null);

  useEffect(() => { traceEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [traceEvents]);

  // Persist config
  useEffect(() => {
    localStorage.setItem('agent_desk_personaId',    JSON.stringify(selectedPersonaId));
    localStorage.setItem('agent_desk_tools',        JSON.stringify([...allowedTools]));
    localStorage.setItem('agent_desk_maxLoops',     JSON.stringify(maxLoops));
    localStorage.setItem('agent_desk_includeContext', JSON.stringify(includeChatContext));
  }, [selectedPersonaId, allowedTools, maxLoops, includeChatContext]);

  // Fetch Agent Files
  const fetchAgentFiles = async () => {
    if (!activeSession || !activeSession._id) return;
    try {
      const res = await fetch(`/api/session/${activeSession._id}/agent-files`);
      if (res.ok) {
        setAgentFiles(await res.json());
      }
    } catch {}
  };

  useEffect(() => {
    fetchAgentFiles();
  }, [activeSession?._id, traceEvents.length]); // polls when trace gets longer

  function toggleTool(tool) {
    setAllowedTools(prev => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });
  }

  const handlePreviewArtifact = async (filename) => {
    try {
      const res = await fetch(`/api/session/${activeSession._id}/agent-files/${filename}/content`);
      if (res.ok) {
        const data = await res.json();
        setActiveFileContent({ name: filename, content: data.content });
      }
    } catch {}
  };

  const handleDownloadArtifact = (filename) => {
    window.open(`/api/session/${activeSession._id}/agent-files/${filename}/download`, '_blank');
  };

  // ── Option B: Critique mode — inject prior answer into history ──
  async function dispatchAgent(isIteration = false, isCritique = false) {
    const promptToUse = isIteration ? followUp.trim() : goal.trim();
    if (!promptToUse) return;

    setIsRunning(true);
    setTraceEvents([]);
    setActiveMission(null); // exit log-view mode when running

    let currentHistory = isIteration ? [...deskHistory] : [];

    // Inject active chat context on first run
    if (!isIteration && includeChatContext && activeSession?.messages) {
      const imported = activeSession.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));
      currentHistory = [...imported];
    }

    // Option B: Critique — prepend a system note so agent understands context
    if (isCritique && finalAnswer) {
      const critiquePrefix = `[CRITIQUE_MODE] Your previous response was:\n\n${finalAnswer}\n\nUser correction/refinement: `;
      currentHistory = [
        ...currentHistory,
        { role: 'assistant', content: finalAnswer },
      ];
      // Prepend critique context to the prompt itself
      const critiquePrompt = critiquePrefix + promptToUse;
      currentHistory = [
        ...currentHistory.slice(0, -1),
        {
          role: 'user',
          content: critiquePrompt,
        }
      ];
    }

    abortControllerRef.current = new AbortController();
    let localTraceEvents = [];
    let lastFinalAnswer = null;

    try {
      const response = await fetch(`${API}/agent/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: promptToUse,
          personaId: selectedPersonaId || null,
          allowedTools: [...allowedTools],
          maxLoops,
          history: currentHistory,
        }),
        signal: abortControllerRef.current.signal,
      });

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
            localTraceEvents.push(event);
            if (event.type === 'agent-final') {
              lastFinalAnswer = event.content;
              setFinalAnswer(event.content);
            }
            setTraceEvents(prev => [...prev, event]);
          } catch { /* ignore */ }
        }
      }

      const newHistory = [
        ...currentHistory,
        { role: 'user', content: promptToUse },
        { role: 'assistant', content: lastFinalAnswer || '(No response captured)' },
      ];
      setDeskHistory(newHistory);

      // ── Option A: Save to Mission Log ──
      if (lastFinalAnswer) {
        const personaName = personas.find(p => p.id === selectedPersonaId)?.name || 'Auto (AXON)';
        const filesWritten = extractFilesFromTrace(localTraceEvents);
        const entry = {
          id: Date.now(),
          ts: new Date().toISOString(),
          goal: promptToUse,
          output: lastFinalAnswer,
          personaName,
          filesWritten,
          turns: Math.ceil(newHistory.length / 2),
          traceCount: localTraceEvents.length,
        };
        setMissionLog(prev => {
          const updated = [entry, ...prev].slice(0, MAX_LOG_ENTRIES);
          localStorage.setItem('agent_desk_mission_log', JSON.stringify(updated));
          return updated;
        });
      }

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
    setActiveMission(null);
  }

  function abortAgent() {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    setTraceEvents(prev => [...prev, { type: 'agent-status', msg: '⏹ Mission aborted by operator.' }]);
  }

  function copyAnswer() {
    const text = activeMission ? activeMission.output : finalAnswer;
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  function downloadAnswer() {
    const text = activeMission ? activeMission.output : finalAnswer;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `agent-output-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2000);
  }

  function deleteLogEntry(id) {
    setMissionLog(prev => {
      const updated = prev.filter(e => e.id !== id);
      localStorage.setItem('agent_desk_mission_log', JSON.stringify(updated));
      return updated;
    });
    if (activeMission?.id === id) setActiveMission(null);
  }

  function clearAllLog() {
    setMissionLog([]);
    localStorage.removeItem('agent_desk_mission_log');
    setActiveMission(null);
  }

  function loadMissionIntoDesk(entry) {
    setGoal(entry.goal);
    setActiveMission(null);
    setShowMissionLog(false);
  }

  const selectedPersona  = personas.find(p => p.id === selectedPersonaId);
  const displayAnswer    = activeMission ? activeMission.output : finalAnswer;
  const isCritiqueMode   = !!finalAnswer && !activeMission;

  // ── RENDER ──
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
          {/* Mission Log Toggle */}
          <button
            className={`agent-log-btn${showMissionLog ? ' active' : ''}`}
            onClick={() => { setShowMissionLog(s => !s); setActiveMission(null); }}
            title={`Mission Log (${missionLog.length})`}
          >
            📋 LOG_{missionLog.length}
          </button>
          <button className="agent-wipe-btn" onClick={wipeMission} disabled={isRunning} title="Clear mission state">
            清 WIPE_STATE
          </button>
          {isRunning && (
            <button className="agent-abort-btn" onClick={abortAgent}>
              ⏹ ABORT_MISSION
            </button>
          )}
        </div>
      </div>

      <div className="agent-desk-body">

        {/* ══ PANEL 1 — TASK CONFIGURATOR ══ */}
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
                const meta    = TOOL_META[tool];
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

        {/* ══ RIGHT COLUMN ══ */}
        <div className="agent-right-col">

          {/* ── MISSION LOG VIEW ── */}
          {showMissionLog ? (
            <section className="agent-panel mission-log-panel" style={{ height: '100%' }}>
              <div className="agent-panel-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>05 // MISSION_LOG ({missionLog.length}/{MAX_LOG_ENTRIES})</span>
                {missionLog.length > 0 && (
                  <button className="mle-clear-all" onClick={clearAllLog} title="Clear all log entries">
                    🗑 CLEAR_ALL
                  </button>
                )}
              </div>

              {/* Log list + detail side-by-side */}
              <div className="mission-log-body">
                <div className="mission-log-list custom-scrollbar">
                  {missionLog.length === 0 && (
                    <div className="trace-empty">No missions logged yet.</div>
                  )}
                  {missionLog.map(entry => (
                    <MissionLogEntry
                      key={entry.id}
                      entry={entry}
                      isActive={activeMission?.id === entry.id}
                      onView={setActiveMission}
                      onDelete={deleteLogEntry}
                    />
                  ))}
                  <div ref={logEndRef} />
                </div>

                {/* Detail panel */}
                {activeMission && (
                  <div className="mission-log-detail custom-scrollbar">
                    <div className="mld-header">
                      <span className="mld-goal">{activeMission.goal}</span>
                      <div className="mld-actions">
                        <button className="artifact-btn" onClick={copyAnswer}>
                          {copySuccess ? '✓ COPIED' : '📋 COPY'}
                        </button>
                        <button className="artifact-btn" onClick={downloadAnswer}>
                          {downloadSuccess ? '✓ SAVED' : '💾 SAVE'}
                        </button>
                        <button className="artifact-btn" onClick={() => loadMissionIntoDesk(activeMission)} title="Load goal back into desk">
                          ↩ RELOAD
                        </button>
                      </div>
                    </div>
                    <pre className="artifact-pre" style={{ flex: 1 }}>{activeMission.output}</pre>
                    {activeMission.filesWritten.length > 0 && (
                      <div className="mld-files">
                        <div className="trace-kv-label">FILES_WRITTEN:</div>
                        {activeMission.filesWritten.map((f, i) => (
                          <div key={i} className="mle-file-chip">📄 {f}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <>
              {/* FILE PREVIEW OVERLAY */}
              {activeFileContent && (
                <div className="agent-file-preview-overlay" style={{ position: 'absolute', inset: 0, background: '#0a0a0c', zIndex: 50, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #1f1f23' }}>
                   <div className="agent-panel-label" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#121217', borderBottom: '1px solid #333' }}>
                      <span>📄 CODE_VERIFIED // {activeFileContent.name}</span>
                      <button onClick={() => setActiveFileContent(null)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontFamily: 'monospace' }}>[X] CLOSE</button>
                   </div>
                   <div className="artifact-scroll-area custom-scrollbar" style={{ flex: 1, padding: '15px', overflowY: 'auto' }}>
                      <pre className="artifact-pre" style={{ margin: 0, fontFamily: "'JetBrains Mono', Courier, monospace", fontSize: '13px', lineHeight: '1.4' }}>{activeFileContent.content}</pre>
                   </div>
                   <div className="artifact-footer" style={{ borderTop: '1px solid #333', padding: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#121217' }}>
                      <button className="artifact-btn" onClick={() => handleDownloadArtifact(activeFileContent.name)}>⬇ DOWNLOAD_SOURCE</button>
                   </div>
                </div>
              )}

              {/* ── PANEL 2 — EXECUTION TRACE ── */}
              <section className="agent-panel execution-trace">
                <div className="agent-panel-label">
                  02 // EXECUTION_TRACE {deskHistory.length > 0 && `(TURN ${Math.floor(deskHistory.length / 2) + 1})`}
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

              {/* ── PANEL 3 — ARTIFACT OUTPUT ── */}
              <section className="agent-panel artifact-panel">
                <div className="agent-panel-label">03 // ARTIFACT_OUTPUT</div>

                <div className="artifact-scroll-area custom-scrollbar">
                  {displayAnswer ? (
                    <div className="artifact-content">
                      <pre className="artifact-pre">{displayAnswer}</pre>
                    </div>
                  ) : (
                    <div className="trace-empty">Output pending...</div>
                  )}
                </div>

                <div className="artifact-footer">
                  <div className="artifact-actions">
                    <button className="artifact-btn" onClick={copyAnswer} disabled={!displayAnswer}>
                      {copySuccess ? '✓ COPIED' : '📋 COPY'}
                    </button>
                    <button className="artifact-btn" onClick={downloadAnswer} disabled={!displayAnswer}>
                      {downloadSuccess ? '✓ SAVED' : '💾 SAVE_.MD'}
                    </button>
                  </div>

                  {/* ── Option B: CRITIQUE MODE follow-up ── */}
                  <div className={`iteration-bar${isCritiqueMode ? ' critique-mode' : ''}`}>
                    {isCritiqueMode && (
                      <div className="critique-badge">⚡ CRITIQUE_MODE — refine above output</div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        className="iteration-input"
                        placeholder={isCritiqueMode
                          ? 'Critique or redirect agent output...'
                          : 'Ask for refinement or next step...'}
                        value={followUp}
                        onChange={e => setFollowUp(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            dispatchAgent(true, isCritiqueMode);
                          }
                        }}
                        disabled={isRunning}
                      />
                      <button
                        className={`iteration-btn${isCritiqueMode ? ' critique-btn' : ''}`}
                        onClick={() => dispatchAgent(true, isCritiqueMode)}
                        disabled={isRunning || !followUp.trim()}
                        title={isCritiqueMode ? 'Send critique to agent' : 'Send follow-up'}
                      >
                        {isCritiqueMode ? '🔁' : '⚡'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── PANEL 4 — AGENT FILES/ARTIFACTS ── */}
              <section className="agent-panel artifact-panel" style={{ flex: '0 0 auto', maxHeight: '20vh', minHeight: '80px' }}>
                <div className="agent-panel-label" style={{ color: '#00f0ff' }}>04 // SESSION_ARTIFACTS (AUTO-VERIFIED)</div>
                <div className="artifact-scroll-area custom-scrollbar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '10px' }}>
                  {agentFiles.length === 0 ? (
                    <div className="trace-empty" style={{ margin: 0, color: '#5A6066' }}>No auto-verified artifacts generated in this session yet.</div>
                  ) : (
                    agentFiles.map(f => (
                      <div key={f.name} className="mle-file-chip" title={(f.size / 1024).toFixed(2) + ' KB'} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px', border: '1px solid #1f1f23', borderRadius: '4px', background: '#121217' }} onClick={() => handlePreviewArtifact(f.name)}>
                        📄 {f.name}
                        <button onClick={(e) => { e.stopPropagation(); handleDownloadArtifact(f.name); }} title="Download" style={{ background: 'none', border: 'none', color: '#00f0ff', cursor: 'pointer', outline: 'none' }}>⬇</button>
                      </div>
                    ))
                  )}
                </div>
              </section>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
