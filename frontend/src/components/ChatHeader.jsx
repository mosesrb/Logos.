import React, { useState } from 'react';
import SolarisIcon from './SolarisIcon';

import { useStore } from '../store/useStore';

const MODE_GUIDE = [
  { id: 'Normal', label: 'SINGLE_SYNC', desc: 'Standard 1:1 interaction with a single persona.' },
  { id: 'Agent', label: 'AUTONOMOUS_LOOP', desc: 'AXON executes tool-assisted multi-stage reasoning loops.' },
  { id: 'Debate', label: 'REFUTATION_MODE', desc: "Personas challenge and refute each other's perspectives." },
  { id: 'Collaborate', label: 'SYNTHESIS_MODE', desc: "Personas build constructively on each other's ideas." },
  { id: 'Parallel', label: 'MULTI_STREAM', desc: 'Ask all personas at once; receive simultaneous but independent answers.' },
  { id: 'Pipeline', label: 'SEQUENTIAL_FILT', desc: 'Sequential processing where output moves through a chain of personas.' },
  { id: 'Scenario', label: 'DYN_SIMULATION', desc: 'Generative environment narration with world-state persistence.' }
];

const ChatHeader = ({
  INTERACTION_MODES = [],
  MODE_DESCRIPTIONS = {},
  needsMultiModel,
  togglePersonaSelection,
  DEBATE_TURN_OPTIONS = [],
  openScenarioBuilder,
  sendMessage,
  handleSnapshot,
  handleEvaluate,
  isVisionModel,
  handleImageUpload,
  handleFileUpload
}) => {
  const {
    interactionMode,
    setInteractionMode,
    setAgentTerminalActive,
    selectedPersonaId,
    setSelectedPersonaId,
    personas,
    showModelDropdown,
    setShowModelDropdown,
    currentSession,
    personaMood,
    selectedPersonaIds,
    debateTurns,
    setDebateTurns,
    judgePersonaId,
    setJudgePersonaId,
    showJudgeDropdown,
    setShowJudgeDropdown,
    selectedScenarioId,
    setSelectedScenarioId,
    scenarios,
    simulationChaos,
    setSimulationChaos,
    isEvaluating,
    selectedModelSingle,
    darkMode,
    setDarkMode,
    webMode,
    setWebMode,
    ragMode,
    setRagMode,
    unrestrictedMode,
    setUnrestrictedMode,
    uploadStatus,
    activeView,
    setActiveView
  } = useStore();
  const [showModeInfo, setShowModeInfo] = useState(false);

  return (
    <div className="chat-header glass-panel">
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
              <SolarisIcon icon="more" size={10} />
            </span>
          </div>

          {showModeInfo && (
            <div className="mode-info-popover glass-panel">
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
              aria-label="Interaction Mode"
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
              maxWidth: '180px',
              fontFamily: 'var(--font-mono)'
            }}>
              {MODE_DESCRIPTIONS[interactionMode]}
            </span>
          </div>
        </div>

        {/* ── MODULE: PERSONA ── */}
        {(interactionMode === "Normal" || interactionMode === "Agent") && (
          <div className="header-module" style={{ position: "relative", zIndex: (!needsMultiModel && showModelDropdown) ? 50 : 1 }}>
            <span className="module-label">PERSONA</span>
            <div className="control-group">
              <button className="model-picker-btn" onClick={() => setShowModelDropdown((s) => !s)}>
                <span className="btn-label">
                  {selectedPersonaId ? (personas.find(p => p.id === selectedPersonaId)?.name || "Selected") : "Select Persona"}
                </span>
                <SolarisIcon icon="minimize" size={10} style={{ transform: 'rotate(-90deg)', opacity: 0.5 }} />
              </button>
              {showModelDropdown && (
                <div className="model-dropdown glass-panel">
                  <div
                    className={`model-dropdown-item${!selectedPersonaId ? ' active' : ''}`}
                    onClick={() => { setSelectedPersonaId(""); setShowModelDropdown(false); }}
                  >
                    — None —
                  </div>
                  {personas
                    .filter(p => {
                      if (!p.availableModes || p.availableModes.length === 0) return true;
                      // Agent mode uses Normal-mode personas (legacy personas don't have "Agent" in their list)
                      const checkMode = interactionMode === 'Agent' ? 'Normal' : interactionMode;
                      return p.availableModes.includes(interactionMode) || p.availableModes.includes(checkMode);
                    })
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
              <div className="relationship-status-badge">
                <SolarisIcon icon="user" size={8} style={{ marginRight: '4px' }} />
                {(() => {
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
              <span className="mood-label" style={{ fontSize: '10px', color: 'var(--solaris-gold)', fontFamily: 'var(--font-mono)' }}>{personaMood.label}</span>
            </div>
          </div>
        )}

        {/* ── MODULE: MULTI-PERSONA (Parallel/Debate/Scenario) ── */}
        {needsMultiModel && (
          <div className="header-module" style={{ position: "relative", zIndex: (needsMultiModel && showModelDropdown) ? 50 : 1 }}>
            <span className="module-label">PERSONAS</span>
            <div className="control-group">
              <button className="model-picker-btn" onClick={() => setShowModelDropdown((s) => !s)}>
                <span className="btn-label">{selectedPersonaIds.length} selected</span>
                <SolarisIcon icon="minimize" size={10} style={{ transform: 'rotate(-90deg)', opacity: 0.5 }} />
              </button>
              {showModelDropdown && (
                <div className="model-dropdown glass-panel">
                  {personas
                    .filter(p => {
                      if (!p.availableModes || p.availableModes.length === 0) return true;
                      const checkMode = interactionMode === 'Agent' ? 'Normal' : interactionMode;
                      return p.availableModes.includes(interactionMode) || p.availableModes.includes(checkMode);
                    })
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
              <select className="mode-select" aria-label="Debate Turns" value={debateTurns} onChange={(e) => setDebateTurns(Number(e.target.value))} style={{ height: '24px' }}>
                {DEBATE_TURN_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {interactionMode === "Debate" && (
          <div className="header-module" style={{ position: "relative", zIndex: showJudgeDropdown ? 50 : 1 }}>
            <span className="module-label">JUDGE_ENTITY</span>
            <div className="control-group">
              <button
                className={`model-picker-btn ${judgePersonaId ? 'active' : ''}`}
                onClick={() => setShowJudgeDropdown((s) => !s)}
              >
                <span className="btn-label">
                  {personas.find(p => p.id === judgePersonaId)?.name || "Default (Gemma 4)"}
                </span>
                <SolarisIcon icon="minimize" size={10} style={{ transform: 'rotate(-90deg)', opacity: 0.5 }} />
              </button>
              {showJudgeDropdown && (
                <div className="model-dropdown glass-panel" style={{ minWidth: "160px" }}>
                  <label className={`model-dropdown-item ${!judgePersonaId ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="judge-selection"
                      checked={!judgePersonaId}
                      onChange={() => { setJudgePersonaId(""); setShowJudgeDropdown(false); }}
                    />
                    <span>Default (Gemma 4)</span>
                  </label>
                  <div className="dropdown-divider" />
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
                <button className="forge-btn" onClick={() => openScenarioBuilder()} title="New Scenario">
                  <SolarisIcon icon="send" size={10} style={{ transform: 'rotate(-45deg)' }} />
                </button>
                {selectedScenarioId && (
                  <button className="forge-btn" onClick={() => openScenarioBuilder(scenarios.find(p => p.id === selectedScenarioId))} title="Edit Scenario">
                    <SolarisIcon icon="settings" size={10} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Simulation Controls Panel */}
        {interactionMode === "Scenario" && selectedScenarioId && (
          <div className="simulation-controls-hub glass-panel">
            <div className="control-group">
              <label className="control-label">Chaos Factor</label>
              <input
                type="range" min="0" max="1.5" step="0.1"
                value={simulationChaos}
                onChange={e => setSimulationChaos(parseFloat(e.target.value))}
                className="chaos-slider"
              />
            </div>
            <button className="inject-btn commit-glow-btn" style={{ padding: '4px 12px', height: '28px' }} onClick={() => {
              const event = prompt("⚠️ GLOBAL EVENT INJECTION:\nDescribe a world-altering event or narrative shift:");
              if (event) sendMessage(`[NARRATIVE_INTERRUPT]: ${event}`);
            }}>
              <SolarisIcon icon="neural" size={12} />
              Inject Event
            </button>
            <button className="sidebar-btn commit-glow-btn" style={{ padding: '4px 12px', height: '28px', border: '1px solid var(--solaris-accent)' }} onClick={handleSnapshot}>
              Branch Reality
            </button>
            <button
              className="sidebar-btn commit-glow-btn"
              style={{ padding: '4px 12px', height: '28px', border: '1px solid var(--cyan)' }}
              onClick={handleEvaluate}
              disabled={isEvaluating}
            >
              <SolarisIcon icon="metrics" size={12} />
              {isEvaluating ? "Analyzing..." : "Analyze Narrative"}
            </button>
          </div>
        )}

        {/* Status Module */}
        <div className="header-module status-module" style={{ marginLeft: 'auto', borderRight: 'none' }}>
          <span className="module-label">STATUS</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className={`retina-status ${isVisionModel(selectedModelSingle) ? "ready" : "locked"}`} style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="retina-dot"></span>
              <span style={{ color: 'var(--solaris-gold)', letterSpacing: '1px' }}>
                RETINA_{isVisionModel(selectedModelSingle) ? "ACTIVE" : "STANDBY"}
              </span>
            </div>
            <div className="brand-unit" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="brand-glyph" style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'var(--solaris-gold)' }}>LÓGOS</span>
              <button
                className={`dark-mode-btn commit-glow-btn${darkMode ? ' active' : ''}`}
                onClick={() => setDarkMode(!darkMode)}
                style={{ padding: '4px 10px', height: '24px', fontSize: '9px' }}
              >
                <SolarisIcon icon="settings" size={10} />
                {darkMode ? 'LIGHT' : 'DARK'}
              </button>
              <button
                className={`dark-mode-btn agent-desk-toggle commit-glow-btn${activeView === 'agent-desk' ? ' active' : ''}`}
                onClick={() => setActiveView(v => v === 'agent-desk' ? 'chat' : 'agent-desk')}
                style={{ padding: '4px 10px', height: '24px', fontSize: '9px' }}
              >
                <SolarisIcon icon={activeView === 'agent-desk' ? 'chat' : 'agent'} size={10} />
                {activeView === 'agent-desk' ? 'CHAT' : 'OPERATIONS'}
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
            <label className="mode-btn retina-btn commit-glow-btn" style={{ padding: '4px 10px', fontSize: '9px', height: '24px', cursor: 'pointer' }}>
              <SolarisIcon icon="neural" size={10} />
              RETINA
              <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
            </label>
            <div className={`mode-toggle ${webMode ? "active" : ""}`} role="switch" tabIndex={0} aria-checked={webMode} aria-label="Enable web context" onClick={() => setWebMode(!webMode)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setWebMode(!webMode); } }}>
              <SolarisIcon icon="terminal" size={10} />
              <span>WEB</span>
            </div>
            <div className={`mode-toggle ${ragMode ? "active" : ""}`} role="switch" tabIndex={0} aria-checked={ragMode} aria-label="Enable retrieval augmented generation" onClick={() => setRagMode(!ragMode)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setRagMode(!ragMode); } }}>
              <SolarisIcon icon="database" size={10} />
              <span>RAG</span>
            </div>
            <div
              className={`sticker-label sticker-warning ${unrestrictedMode ? "active" : ""}`}
              role="switch"
              tabIndex={0}
              aria-checked={unrestrictedMode}
              aria-label="Enable unrestricted mode"
              onClick={() => setUnrestrictedMode(!unrestrictedMode)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setUnrestrictedMode(!unrestrictedMode); } }}
              style={{
                fontSize: '8px',
                padding: '2px 6px',
                cursor: 'pointer',
                opacity: unrestrictedMode ? 1 : 0.4,
                filter: unrestrictedMode ? 'drop-shadow(0 0 5px var(--solaris-accent))' : 'none',
                transition: 'all 0.2s',
                fontFamily: 'var(--font-display)',
                border: '1px solid var(--solaris-accent)',
                color: 'var(--solaris-gold)'
              }}
            >
              UNRESTRICTED
            </div>

            {ragMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
                <input type="file" accept=".pdf,.txt,.docx" onChange={handleFileUpload} style={{ maxWidth: 120, fontSize: '9px', color: 'var(--solaris-gold)' }} />
                {uploadStatus && <span className="upload-status" style={{ fontSize: '9px', color: 'var(--solaris-accent)' }}>{uploadStatus}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;
