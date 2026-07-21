import React, { useState, useRef, useEffect, useMemo } from 'react';
import SolarisIcon from './SolarisIcon';
import { useAppSettings } from '../hooks/useAppSettings';

const TOOL_META = {
  readFileTool:        { label: 'FILE_READ',      icon: 'scenario', desc: 'Read any file by path' },
  listDirTool:         { label: 'DIR_LIST',       icon: 'database', desc: 'List directory contents' },
  mempalaceSearch:     { label: 'MEM_SEARCH',     icon: 'neural', desc: 'Search MemPalace (opt-in)' },
  mempalaceDiaryWrite: { label: 'MEM_WRITE',      icon: 'evaluation', desc: 'Write to memory (opt-in)' },
  agentWriteFile:      { label: 'FILE_WRITE',     icon: 'send', desc: 'Write code & check syntax' },
};

const ALL_TOOLS = Object.keys(TOOL_META);
const DEFAULT_TOOLS_ARRAY = ['readFileTool', 'listDirTool', 'agentWriteFile'];
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
    <div className="trace-node trace-status glass-panel">
      <SolarisIcon icon="settings" size={14} className="trace-icon" />
      <span className="trace-msg">{event.msg}</span>
    </div>
  );

  if (event.type === 'thought') return (
    <div className="trace-node trace-thought glass-panel">
      <div className="trace-node-header" role="button" tabIndex={0} aria-expanded={!collapsed} onClick={() => setCollapsed(c => !c)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setCollapsed(c => !c); } }}>
        <SolarisIcon icon="neural" size={14} className="trace-icon" />
        <span className="trace-label">THOUGHT</span>
        <span className="trace-collapse-btn">{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && <div className="trace-body trace-thought-body">{event.content}</div>}
    </div>
  );

  if (event.type === 'agent-tool-start') {
    const meta = TOOL_META[event.tool] || { label: event.tool, icon: 'terminal' };
    return (
      <div className="trace-node trace-tool-start glass-panel">
        <div className="trace-node-header" role="button" tabIndex={0} aria-expanded={!collapsed} onClick={() => setCollapsed(c => !c)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setCollapsed(c => !c); } }}>
          <SolarisIcon icon={meta.icon} size={14} className="trace-icon" />
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
    const meta = TOOL_META[event.tool] || { label: event.tool, icon: 'terminal' };
    const isErr = event.result?.success === false;
    return (
      <div className={`trace-node glass-panel ${isErr ? 'trace-tool-error' : 'trace-tool-result'}`}>
        <div className="trace-node-header" role="button" tabIndex={0} aria-expanded={!collapsed} onClick={() => setCollapsed(c => !c)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setCollapsed(c => !c); } }}>
          <SolarisIcon icon={isErr ? 'close' : 'agent'} size={14} className="trace-icon" />
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
    <div className="trace-node trace-error glass-panel">
      <SolarisIcon icon="close" size={14} className="trace-icon" />
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
      className={`mission-log-entry glass-panel${isActive ? ' mission-log-entry--active' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Open mission: ${entry.goal}`}
      onClick={() => onView(entry)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onView(entry); } }}
    >
      <div className="mle-header">
        <span className="mle-date">{dateStr} {timeStr}</span>
        <span className="mle-persona">{entry.personaName}</span>
        <button
          className="mle-delete"
          onClick={e => { e.stopPropagation(); onDelete(entry.id); }}
          title="Delete log entry"
        >
          <SolarisIcon icon="close" size={12} />
        </button>
      </div>
      <div className="mle-goal">{entry.goal.slice(0, 80)}{entry.goal.length > 80 ? '…' : ''}</div>
      {entry.filesWritten.length > 0 && (
        <div className="mle-files">
          {entry.filesWritten.slice(0, 3).map((f, i) => (
            <span key={i} className="mle-file-chip">
              <SolarisIcon icon="scenario" size={10} /> {f.split(/[/\\]/).pop()}
            </span>
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

// Helper to check if file is visual/renderable
const isPreviewableFile = (name) => {
  if (!name) return false;
  const ext = name.split('.').pop().toLowerCase();
  return ['html', 'htm', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'].includes(ext);
};

// ── Main Component ──
export default function AgentDesk({ personas = [], API, darkMode, onExit, activeSession }) {
  const { getSetting, updateSetting } = useAppSettings();

  const getPersisted = (key, fallback) => {
    return getSetting(`agent_desk_${key}`, fallback);
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

  const [previewTab, setPreviewTab] = useState('code'); // 'code' | 'preview'
  const [viewportMode, setViewportMode] = useState('responsive'); // 'desktop' | 'tablet' | 'mobile' | 'responsive'
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Auto-select best tab when active file changes
  useEffect(() => {
    if (activeFileContent) {
      if (isPreviewableFile(activeFileContent.name)) {
        setPreviewTab('preview');
        setIframeLoading(true);
      } else {
        setPreviewTab('code');
      }
    }
  }, [activeFileContent?.name]);

  const handleRefreshIframe = () => {
    setIframeLoading(true);
    setIframeKey(prev => prev + 1);
  };

  // ── Option A: Mission Log ──
  const [missionLog, setMissionLog] = useState(() => getSetting('agent_desk_mission_log', []));
  const [showMissionLog, setShowMissionLog]   = useState(false);
  const [activeMission, setActiveMission]     = useState(null); // viewing past mission

  const abortControllerRef = useRef(null);
  const traceEndRef        = useRef(null);
  const logEndRef          = useRef(null);

  useEffect(() => { traceEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [traceEvents]);

  // Persist config
  useEffect(() => {
    updateSetting('agent_desk_personaId', selectedPersonaId);
    updateSetting('agent_desk_tools', [...allowedTools]);
    updateSetting('agent_desk_maxLoops', maxLoops);
    updateSetting('agent_desk_includeContext', includeChatContext);
  }, [selectedPersonaId, allowedTools, maxLoops, includeChatContext]);

  // Fetch Agent Files
  const fetchAgentFiles = async () => {
    if (!activeSession || !activeSession.id) return;
    try {
      const res = await fetch(`/api/session/${activeSession.id}/agent-files`);
      if (res.ok) {
        setAgentFiles(await res.json());
      }
    } catch {}
  };

  useEffect(() => {
    fetchAgentFiles();
  }, [activeSession?.id, traceEvents.length]); // polls when trace gets longer

  function toggleTool(tool) {
    setAllowedTools(prev => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });
  }

  const handlePreviewArtifact = async (filename) => {
    try {
      const res = await fetch(`/api/session/${activeSession.id}/agent-files/${filename}/content`);
      if (res.ok) {
        const data = await res.json();
        setActiveFileContent({ name: filename, content: data.content });
      }
    } catch {}
  };

  const handleDownloadArtifact = (filename) => {
    window.open(`/api/session/${activeSession.id}/agent-files/${filename}/download`, '_blank');
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
          updateSetting('agent_desk_mission_log', updated);
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
      updateSetting('agent_desk_mission_log', updated);
      return updated;
    });
    if (activeMission?.id === id) setActiveMission(null);
  }

  function clearAllLog() {
    setMissionLog([]);
    updateSetting('agent_desk_mission_log', []);
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
      <div className="agent-desk-header glass-panel">
        <div className="agent-desk-title">
          {onExit && (
            <button className="agent-back-btn" onClick={onExit} title="Return to Chat">
              <SolarisIcon icon="chat" size={14} /> CHAT
            </button>
          )}
          <SolarisIcon icon="settings" size={18} className="agent-desk-icon" />
          <span>AGENTIC_OPERATIONS_DESK</span>
          <span className="hardware-id">// SOLARIS_LOOP_ENGINE v3.0</span>
        </div>
        <div className="header-actions">
          {/* Mission Log Toggle */}
          <button
            className={`agent-log-btn glass-panel${showMissionLog ? ' active' : ''}`}
            onClick={() => { setShowMissionLog(s => !s); setActiveMission(null); }}
            title={`Mission Log (${missionLog.length})`}
          >
            <SolarisIcon icon="database" size={14} /> LOG_{missionLog.length}
          </button>
          <button className="agent-wipe-btn glass-panel" onClick={wipeMission} disabled={isRunning} title="Clear mission state">
            <SolarisIcon icon="trash" size={14} /> WIPE_STATE
          </button>
          {isRunning && (
            <button className="agent-abort-btn glass-panel" onClick={abortAgent}>
              <SolarisIcon icon="close" size={14} /> ABORT_MISSION
            </button>
          )}
        </div>
      </div>

      <div className="agent-desk-body">

        {/* ══ PANEL 1 — TASK CONFIGURATOR ══ */}
        <section className="agent-panel task-configurator glass-panel">
          <div className="agent-panel-label"><SolarisIcon icon="settings" size={10} /> 01 // TASK_CONFIGURATOR</div>

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
                className="agent-select glass-panel"
                value={selectedPersonaId}
                onChange={e => setSelectedPersonaId(e.target.value)}
                disabled={isRunning}
              >
                <option value=""><SolarisIcon icon="neural" size={10} /> Auto (AXON Agent)</option>
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
                    className={`tool-toggle glass-panel ${enabled ? 'tool-on' : 'tool-off'}`}
                    onClick={() => toggleTool(tool)}
                    disabled={isRunning}
                    title={meta.desc}
                  >
                    <SolarisIcon icon={meta.icon} size={14} className="tool-toggle-icon" />
                    <span className="tool-toggle-label">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className={`agent-dispatch-btn commit-glow-btn ${isRunning ? 'agent-dispatch-running' : ''}`}
            onClick={() => dispatchAgent(false)}
            disabled={!goal.trim() || isRunning}
          >
            {isRunning ? 'EXECUTING...' : <><SolarisIcon icon="neural" size={14} /> DISPATCH_AGENT</>}
          </button>
        </section>

        {/* ══ RIGHT COLUMN ══ */}
        <div className="agent-right-col">

          {/* ── MISSION LOG VIEW ── */}
          {showMissionLog ? (
            <section className="agent-panel mission-log-panel glass-panel" style={{ height: '100%' }}>
              <div className="agent-panel-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><SolarisIcon icon="database" size={10} /> 05 // MISSION_LOG ({missionLog.length}/{MAX_LOG_ENTRIES})</span>
                {missionLog.length > 0 && (
                  <button className="mle-clear-all glass-panel" onClick={clearAllLog} title="Clear all log entries">
                    <SolarisIcon icon="trash" size={12} /> CLEAR_ALL
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
              {/* EXPORT PROGRESS OVERLAY */}
              <ExportProgressOverlay events={traceEvents} />

              {/* FILE PREVIEW OVERLAY */}
              {activeFileContent && (
                <div className="agent-file-preview-overlay glass-panel" style={{ position: 'absolute', inset: 0, background: 'var(--solaris-void)', zIndex: 50, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)' }}>
                   {/* Upper Panel Label and Close controls */}
                   <div className="agent-panel-label" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', background: 'var(--solaris-void)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <SolarisIcon icon="data" size={12} style={{ color: 'var(--solaris-gold)' }} />
                        <span style={{ color: 'var(--solaris-gold)' }}>CODE_VERIFIED // {activeFileContent.name}</span>
                      </div>
                      <button onClick={() => setActiveFileContent(null)} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>[X] CLOSE_PREVIEW</button>
                   </div>

                   {/* Navigation / Mode Tab Header */}
                   {isPreviewableFile(activeFileContent.name) && (
                     <div className="preview-tabs-container">
                       <button className={`preview-tab-btn ${previewTab === 'preview' ? 'active' : ''}`} onClick={() => setPreviewTab('preview')}>
                         👁️ LIVE_PREVIEW
                       </button>
                       <button className={`preview-tab-btn ${previewTab === 'code' ? 'active' : ''}`} onClick={() => setPreviewTab('code')}>
                         📝 SOURCE_CODE
                       </button>
                     </div>
                   )}

                   {/* Render Area */}
                   {previewTab === 'code' ? (
                     <>
                       <div className="artifact-scroll-area custom-scrollbar" style={{ flex: 1, padding: '15px', overflowY: 'auto' }}>
                          <pre className="artifact-pre" style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: '13px', lineHeight: '1.4', color: 'var(--solaris-gold)' }}>{activeFileContent.content}</pre>
                       </div>
                       <div className="artifact-footer" style={{ borderTop: '1px solid var(--border)', padding: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'var(--solaris-void)' }}>
                          <button className="artifact-btn commit-glow-btn" onClick={() => handleDownloadArtifact(activeFileContent.name)}>
                            <SolarisIcon icon="data" size={12} /> DOWNLOAD_SOURCE
                          </button>
                       </div>
                     </>
                   ) : (
                     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                       {/* Dynamic Device Toolbar */}
                       <div className="preview-toolbar">
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                           <button className="preview-btn" onClick={handleRefreshIframe}>
                             <SolarisIcon icon="settings" size={12} className={iframeLoading ? "spin" : ""} />
                             REFRESH
                           </button>
                           <div className="preview-address-bar">
                             <span style={{ color: 'var(--text-dim)', marginRight: '6px' }}>GET</span>
                             {`/uploads/${activeSession.id}/agent_files/${activeFileContent.name}`}
                           </div>
                         </div>

                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <div className="preview-viewport-group">
                             <button className={`preview-viewport-btn ${viewportMode === 'mobile' ? 'active' : ''}`} onClick={() => setViewportMode('mobile')}>
                               📱 PHONE
                             </button>
                             <button className={`preview-viewport-btn ${viewportMode === 'tablet' ? 'active' : ''}`} onClick={() => setViewportMode('tablet')}>
                               📐 TABLET
                             </button>
                             <button className={`preview-viewport-btn ${viewportMode === 'desktop' ? 'active' : ''}`} onClick={() => setViewportMode('desktop')}>
                               💻 DESKTOP
                             </button>
                             <button className={`preview-viewport-btn ${viewportMode === 'responsive' ? 'active' : ''}`} onClick={() => setViewportMode('responsive')}>
                               🔄 FILL
                             </button>
                           </div>

                           <button className="preview-btn" onClick={() => window.open(`/uploads/${activeSession.id}/agent_files/${activeFileContent.name}`, '_blank')}>
                             🌐 OPEN_NEW_TAB
                           </button>
                         </div>
                       </div>

                       {/* Viewport Frame Sandbox Container */}
                       <div className="preview-sandbox-viewport-container">
                         {iframeLoading && (
                           <div className="preview-loader-overlay">
                             <div className="preview-loader-spinner" />
                             <div>RENDER_STREAM_INITIALIZING...</div>
                           </div>
                         )}
                         
                         <div className={`device-frame-wrapper ${viewportMode}`}>
                           {/* Cyber Laser Scanline overlay for high aesthetic render status */}
                           {iframeLoading && <div className="preview-scanline" />}
                           
                           <iframe
                             key={iframeKey}
                             src={`/uploads/${activeSession.id}/agent_files/${activeFileContent.name}`}
                             sandbox="allow-scripts allow-forms allow-popups"
                             style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff', display: 'block' }}
                             onLoad={() => setIframeLoading(false)}
                           />
                         </div>
                       </div>
                     </div>
                   )}
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
              <section className="agent-panel artifact-panel glass-panel" style={{ flex: '0 0 auto', maxHeight: '20vh', minHeight: '80px' }}>
                <div className="agent-panel-label" style={{ color: 'var(--solaris-gold)' }}>
                  <SolarisIcon icon="data" size={10} /> 04 // SESSION_ARTIFACTS (AUTO-VERIFIED)
                </div>
                <div className="artifact-scroll-area custom-scrollbar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '10px' }}>
                  {agentFiles.length === 0 ? (
                    <div className="trace-empty" style={{ margin: 0, color: 'var(--text-dim)' }}>No auto-verified artifacts generated in this session yet.</div>
                  ) : (
                    agentFiles.map(f => (
                      <div key={f.name} className="mle-file-chip glass-panel" title={(f.size / 1024).toFixed(2) + ' KB'} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px' }} onClick={() => handlePreviewArtifact(f.name)}>
                        <SolarisIcon icon="scenario" size={12} style={{ color: 'var(--solaris-gold)' }} />
                        <span style={{ fontSize: '11px', color: 'var(--solaris-gold)' }}>{f.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleDownloadArtifact(f.name); }} title="Download" style={{ background: 'none', border: 'none', color: 'var(--solaris-gold)', cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center' }}>
                          <SolarisIcon icon="data" size={10} />
                        </button>
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

// ── Export Progress Overlay ──
function ExportProgressOverlay({ events }) {
  const currentOp = useMemo(() => {
    const lastStart = [...events].reverse().find(e => e.type === 'agent-tool-start' && e.tool === 'agentWriteFile');
    if (!lastStart) return null;

    const hasFinished = events.some(e => 
      e.type === 'agent-tool-result' && 
      e.tool === 'agentWriteFile' && 
      e.id === lastStart.id // if we added IDs, or just check timestamp/order
    );

    // If there's a start without a subsequent result, it's in progress
    // Finding the specific one is easier if we just look at the last one
    const lastResult = [...events].reverse().find(e => e.type === 'agent-tool-result' && e.tool === 'agentWriteFile');
    
    // Simplistic check: if the last tool start was agentWriteFile and there's no result for it yet
    const lastEvent = events[events.length - 1];
    const isWriting = lastStart && (!lastResult || events.indexOf(lastStart) > events.indexOf(lastResult));

    if (!isWriting) return null;

    return {
      path: lastStart.args?.path || 'file',
      step: events.length // use this for some pseudo-animation
    };
  }, [events]);

  if (!currentOp) return null;

  return (
    <div className="export-overlay">
      <div className="export-modal glass-panel">
        <div className="export-header">
          <SolarisIcon icon="send" size={16} className="export-icon pulse" />
          <div className="export-title">SYNAPSE_EXPORT_PROTOCOL</div>
        </div>
        
        <div className="export-path">
          <span className="export-path-label">TARGET:</span>
          <span className="export-path-val">{currentOp.path}</span>
        </div>

        <div className="export-progress-container">
          <div className="export-progress-bar">
            <div className="export-progress-fill animate-progress" />
          </div>
          <div className="export-status-line">
            <span className="status-text">WRITING_CHUNKS...</span>
            <span className="status-pct">SYNCING</span>
          </div>
        </div>

        <div className="export-details">
          NEURAL_SYNAPSE is committing architectural changes to the local filesystem.
          Integrity check will follow.
        </div>
      </div>
    </div>
  );
}
