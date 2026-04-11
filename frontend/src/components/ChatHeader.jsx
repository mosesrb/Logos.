import React, { useState } from 'react';

const MODE_GUIDE = [
  { id: 'Normal', label: 'SINGLE_SYNC', desc: 'Standard 1:1 interaction with a single persona.' },
  { id: 'Agent', label: 'AUTONOMOUS_LOOP', desc: 'AXON executes tool-assisted multi-stage reasoning loops.' },
  { id: 'Debate', label: 'REFUTATION_MODE', desc: 'Personas challenge and refute each other\'s perspectives.' },
  { id: 'Collaborate', label: 'SYNTHESIS_MODE', desc: 'Personas build constructively on each other\'s ideas.' },
  { id: 'Parallel', label: 'MULTI_STREAM', desc: 'Ask all personas at once; receive simultaneous but independent answers.' },
  { id: 'Pipeline', label: 'SEQUENTIAL_FILT', desc: 'Sequential processing where output moves through a chain of personas.' },
  { id: 'Scenario', label: 'DYN_SIMULATION', desc: 'Generative environment narration with world-state persistence.' }
];

const ChatHeader = ({
  interactionMode,
  setInteractionMode,
  setAgentTerminalActive,
  INTERACTION_MODES = [],
  MODE_DESCRIPTIONS = {},
  selectedPersonaId,
  setSelectedPersonaId,
  personas = [],
  showModelDropdown,
  setShowModelDropdown,
  currentSession,
  personaMood,
  needsMultiModel,
  selectedPersonaIds = [],
  togglePersonaSelection,
  debateTurns,
  setDebateTurns,
  DEBATE_TURN_OPTIONS = [],
  judgePersonaId,
  setJudgePersonaId,
  showJudgeDropdown,
  setShowJudgeDropdown,
  selectedScenarioId,
  setSelectedScenarioId,
  scenarios = [],
  openScenarioBuilder,
  simulationChaos,
  setSimulationChaos,
  sendMessage,
  handleSnapshot,
  handleEvaluate,
  isEvaluating,
  selectedModelSingle,
  darkMode,
  setDarkMode,
  isVisionModel,
  handleImageUpload,
  webMode,
  setWebMode,
  ragMode,
  setRagMode,
  unrestrictedMode,
  setUnrestrictedMode,
  handleFileUpload,
  uploadStatus,
  activeView,
  setActiveView,
}) => {
  const [showModeInfo, setShowModeInfo] = useState(false);
  return (
    <div className="chat-header">
      <div className="header-row">
        {/* ── MODULE: SESSION ── */}
        <div className="header-module" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="module-label">SESSION</span>
            <span 
              className="info-icon-trigger" 
              onMouseEnter={() => setShowModeInfo(true)}
              onMouseLeave={() => setShowModeInfo(false)}
            >
              ⓘ
            </span>
          </div>

          {showModeInfo && (
            <div className="mode-info-popover h-glow">
              <div className="popover-header">SYNAPSE_PROTOCOLS // QUICK_REF</div>
              <div className="popover-grid">
                {MODE_GUIDE.map(item => (
                  <div key={item.id} className={`popover-item ${interactionMode === item.id ? 'active' : ''}`}>
                    <div className="item-meta">
                      <span className="item-label">{item.label}</span>
                      <span className="item-id">[{item.id}]</span>
                    </div>
                    <div className="item-desc">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '140px' }}>
            <select
              className="mode-select"
              value={interactionMode}
              onChange={(e) => { 
                const val = e.target.value; 
                setInteractionMode(val); 
                if(val === "Agent") setAgentTerminalActive(true); 
              }}
              style={{ height: '24px', padding: '0 8px', fontSize: '11px', width: '100%' }}
            >
              {INTERACTION_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <span className="mode-desc-hint" title={MODE_DESCRIPTIONS[interactionMode]} style={{
              fontSize: '9px',
              opacity: 0.6,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '180px'
            }}>
              {MODE_DESCRIPTIONS[interactionMode]}
            </span>
          </div>
        </div>

        {/* ── MODULE: PERSONA ── */}
        {(interactionMode === "Normal" || interactionMode === "Agent") && (
          <div className="header-module" style={{ position: "relative" }}>
            <span className="module-label">PERSONA</span>
            <div className="control-group">
              <button className="model-picker-btn" onClick={() => setShowModelDropdown((s) => !s)}>
                {selectedPersonaId ? (personas.find(p => p.id === selectedPersonaId)?.name || "Selected") : "Select Persona"} ▾
              </button>
              {showModelDropdown && (
                <div className="model-dropdown">
                  <div
                    className={`model-dropdown-item${!selectedPersonaId ? ' active' : ''}`}
                    onClick={() => { setSelectedPersonaId(""); setShowModelDropdown(false); }}
                  >
                    — None —
                  </div>
                  {personas
                    .filter(p => !p.availableModes || p.availableModes.length === 0 || p.availableModes.includes(interactionMode))
                    .map((p) => (
                      <div
                        key={p.id}
                        className={`model-dropdown-item${selectedPersonaId === p.id ? ' active' : ''}`}
                        onClick={() => { setSelectedPersonaId(p.id); setShowModelDropdown(false); }}
                      >
                        {p.name}
                      </div>
                    ))
                  }
                  {personas.length === 0 && <div className="dim p-2">No personas found. Create one!</div>}
                </div>
              )}
            </div>
            {selectedPersonaId && currentSession && (
              <div className="relationship-status-badge" style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', marginLeft: '0px' }}>
                🤝 {(() => {
                  const trust = currentSession.relationship?.trust || 0.5;
                  if (trust > 0.8) return "Close";
                  if (trust > 0.6) return "Comfortable";
                  if (trust > 0.3) return "Familiar";
                  return "Neutral";
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── MODULE: BIOMETRICS ── */}
        {(interactionMode === "Normal" || interactionMode === "Agent") && selectedPersonaId && personaMood && (
          <div className="header-module">
            <span className="module-label">BIOMETRICS</span>
            <div className="mood-indicator-wrapper">
              <svg className="mood-ring" width="20" height="20" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="var(--border)" strokeWidth="1" />
                <circle
                  cx="12" cy="12" r="10"
                  fill={`hsla(${Math.max(0, (personaMood.valence + 1) * 60)}, ${Math.abs(personaMood.valence) * 70}%, 50%, 0.2)`}
                  stroke={`hsl(${Math.max(0, (personaMood.valence + 1) * 60)}, ${Math.abs(personaMood.valence) * 70}%, ${50 + (personaMood.arousal * 20)}%)`}
                  strokeWidth="2"
                  className="mood-ring-inner"
                />
              </svg>
              <span className="mood-label" style={{ fontSize: '10px' }}>{personaMood.label}</span>
            </div>
          </div>
        )}

        {/* ── MODULE: MULTI-PERSONA (Parallel/Debate/Scenario) ── */}
        {needsMultiModel && (
          <div className="header-module" style={{ position: "relative" }}>
            <span className="module-label">PERSONAS</span>
            <div className="control-group">
              <button className="model-picker-btn" onClick={() => setShowModelDropdown((s) => !s)}>
                {selectedPersonaIds.length} selected ▾
              </button>
              {showModelDropdown && (
                <div className="model-dropdown">
                  {personas
                    .filter(p => !p.availableModes || p.availableModes.length === 0 || p.availableModes.includes(interactionMode))
                    .map((p) => (
                      <label key={p.id} className={`model-dropdown-item${selectedPersonaIds.includes(p.id) ? ' active' : ''}`}>
                        <input type="checkbox" checked={selectedPersonaIds.includes(p.id)} onChange={() => togglePersonaSelection(p.id)} /> {p.name}
                      </label>
                    ))
                  }
                  {personas.length === 0 && <div className="dim p-2">No personas found. Create one!</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MODULE: DEBATE_CONFIG ── */}
        {interactionMode === "Debate" && (
          <div className="header-module">
            <span className="module-label">TURNS</span>
            <div className="control-group">
              <select value={debateTurns} onChange={(e) => setDebateTurns(Number(e.target.value))} style={{ height: '24px' }}>
                {DEBATE_TURN_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {interactionMode === "Debate" && (
          <div className="header-module" style={{ position: "relative" }}>
            <span className="module-label">JUDGE_ENTITY</span>
            <div className="control-group">
              <button
                className={`model-picker-btn ${judgePersonaId ? 'active' : ''}`}
                onClick={() => setShowJudgeDropdown((s) => !s)}
              >
                {personas.find(p => p.id === judgePersonaId)?.name || "Default (Gemma 4)"} ▾
              </button>
              {showJudgeDropdown && (
                <div className="model-dropdown" style={{ minWidth: "160px" }}>
                  <label className={`model-dropdown-item ${!judgePersonaId ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="judge-selection"
                      checked={!judgePersonaId}
                      onChange={() => { setJudgePersonaId(""); setShowJudgeDropdown(false); }}
                    />
                    <span>Default (Gemma 4)</span>
                  </label>
                  <div className="dropdown-divider" style={{
                    height: '1px',
                    background: 'var(--border)',
                    margin: '4px 0',
                    opacity: 0.3
                  }} />
                  {personas.map((p) => (
                    <label key={p.id} className={`model-dropdown-item ${judgePersonaId === p.id ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="judge-selection"
                        checked={judgePersonaId === p.id}
                        onChange={() => { setJudgePersonaId(p.id); setShowJudgeDropdown(false); }}
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                  {personas.length === 0 && <div className="dim p-2">No personas found.</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MODULE: SCENARIO_SELECT ── */}
        {interactionMode === "Scenario" && (
          <div className="header-module">
            <span className="module-label">SIMULATION</span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <select
                className="scenario-select"
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                style={{ height: '24px' }}
              >
                <option value="">— Select Narrative —</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button className="forge-btn" onClick={() => openScenarioBuilder()} title="New Scenario">+</button>
                {selectedScenarioId && (
                  <button className="forge-btn" onClick={() => openScenarioBuilder(scenarios.find(p => p.id === selectedScenarioId))} title="Edit Scenario">⚙️</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Simulation Controls Panel */}
        {interactionMode === "Scenario" && selectedScenarioId && (
          <div className="simulation-controls-hub">
            <div className="control-group">
              <label className="control-label">Chaos Factor</label>
              <input
                type="range" min="0" max="1.5" step="0.1"
                value={simulationChaos}
                onChange={e => setSimulationChaos(parseFloat(e.target.value))}
                className="chaos-slider"
              />
            </div>
            <button className="inject-btn" onClick={() => {
              const event = prompt("⚠️ GLOBAL EVENT INJECTION:\nDescribe a world-altering event or narrative shift:");
              if (event) sendMessage(`[NARRATIVE_INTERRUPT]: ${event}`);
            }}>
              💥 Inject Event
            </button>
            <button className="sidebar-btn" style={{ padding: '4px 8px', border: '1px solid var(--accent-gold)' }} onClick={handleSnapshot}>
              🌱 Branch Reality
            </button>
            <button
              className="sidebar-btn"
              style={{ padding: '4px 8px', border: '1px solid var(--cyan)' }}
              onClick={handleEvaluate}
              disabled={isEvaluating}
            >
              {isEvaluating ? "⌛ Analyzing..." : "📊 Analyze Narrative"}
            </button>
          </div>
        )}

        {/* Status Module */}
        <div className="header-module status-module" style={{ marginLeft: 'auto', borderRight: 'none' }}>
          <span className="module-label">STATUS</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className={`retina-status ${isVisionModel(selectedModelSingle) ? "ready" : "locked"}`} style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="retina-dot"></span>
              RETINA_{isVisionModel(selectedModelSingle) ? "ACTIVE" : "STANDBY"}
            </div>
            <div className="brand-unit" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="brand-glyph" style={{ fontFamily: 'Orbitron, monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'var(--cyan)' }}>LÓGOS</span>
              <button
                className={`dark-mode-btn${darkMode ? ' active' : ''}`}
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Switch to Industrial Mode' : 'Switch to Dark Mode'}
              >
                {darkMode ? '☀ LIGHT' : '🌑 DARK'}
              </button>
              <button
                className={`dark-mode-btn agent-desk-toggle${activeView === 'agent-desk' ? ' active' : ''}`}
                onClick={() => setActiveView(v => v === 'agent-desk' ? 'chat' : 'agent-desk')}
                title={activeView === 'agent-desk' ? 'Return to Chat' : 'Open Agentic Operations Desk'}
              >
                {activeView === 'agent-desk' ? '💬 CHAT' : '⚙️ AGENT_DESK'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="header-row">
        {/* ── MODULE: NETWORK ── */}
        <div className="header-module">
          <span className="module-label">NETWORK_CAPABILITIES</span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label className="mode-btn retina-btn" style={{ padding: '2px 6px', fontSize: '10px' }}>
              👁️ RETINA
              <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
            </label>
            <div className={`mode-toggle ${webMode ? "active" : ""}`} onClick={() => setWebMode(!webMode)} style={{ fontSize: '10px', padding: '2px 6px' }}>
              <input type="checkbox" checked={webMode} readOnly />
              <span>🌐 WEB</span>
            </div>
            <div className={`mode-toggle ${ragMode ? "active" : ""}`} onClick={() => setRagMode(!ragMode)} style={{ fontSize: '10px', padding: '2px 6px' }}>
              <input type="checkbox" checked={ragMode} readOnly />
              <span>📚 RAG</span>
            </div>
            <div
              className={`sticker-label sticker-warning ${unrestrictedMode ? "active" : ""}`}
              onClick={() => setUnrestrictedMode(!unrestrictedMode)}
              style={{
                fontSize: '7px',
                padding: '1px 4px',
                cursor: 'pointer',
                opacity: unrestrictedMode ? 1 : 0.4,
                filter: unrestrictedMode ? 'drop-shadow(0 0 5px var(--orange))' : 'none',
                transition: 'all 0.2s'
              }}
            >
              UNRESTRICTED
            </div>

            {ragMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
                <input type="file" accept=".pdf,.txt,.docx" onChange={handleFileUpload} style={{ maxWidth: 120, fontSize: '9px' }} />
                {uploadStatus && <span className="upload-status" style={{ fontSize: '9px' }}>{uploadStatus}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;
