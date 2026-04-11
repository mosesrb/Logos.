import React, { useEffect } from 'react';

const PersonaForge = ({
  showPersonaForge,
  setShowPersonaForge,
  personas = [],
  editingPersona,
  setEditingPersona,
  forgeTab,
  setForgeTab,
  forgeData,
  setForgeData,
  models = [],
  setModels,
  moodHistory = [],
  setMoodHistory,
  handleSavePersona,
  forgeSaveStatus = "idle",
  deletePersona,
  openForge,
  API,
  sessionId,
  addLog
}) => {
  if (!showPersonaForge) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content forge-modal manager-overhaul">
        <div className="hardware-header">
          <span>PERSONA_MANAGER_v3</span>
          <span className="hardware-id">UNIT: BRAIN-GEN-04</span>
        </div>
        <div className="decal-label" style={{ position: 'absolute', top: 50, right: 20 }}>[PROPERTY_OF_MAINFRAME_CORP]</div>

        <button className="close-btn" onClick={() => { setShowPersonaForge(false); setForgeTab('settings'); }}>×</button>

        <div className="forge-container">
          {/* --- SIDEBAR LIST --- */}
          <aside className="forge-sidebar">
            <div className="sidebar-header">
              <span className="sidebar-label">ENTITIES_LIST</span>
              <button className="add-persona-btn" onClick={() => openForge()} title="Create New Persona">
                + NEW_ENTITY
              </button>
            </div>
            <div className="persona-list-scroll">
              {personas.map(p => (
                <div
                  key={p.id}
                  className={`persona-list-item ${editingPersona?.id === p.id ? 'active' : ''}`}
                  onClick={() => openForge(p)}
                >
                  <div className="persona-item-info">
                    <span className="persona-item-name">{p.name}</span>
                    <span className="persona-item-meta">{p.model || "No model"} // {p.voice || "No voice"}</span>
                  </div>
                  <button
                    className="persona-item-delete"
                    onClick={(e) => { e.stopPropagation(); deletePersona(p.id); }}
                    title="Delete Persona"
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {personas.length === 0 && <div className="dim p-4">NO_ENTITIES_FOUND</div>}
            </div>
          </aside>

          {/* --- EDITOR MAIN --- */}
          <main className="forge-editor">
            <div className="modal-header">
              <h2>{editingPersona ? `🔧 ${editingPersona.name}` : "🔨 Forge New Persona"}</h2>
              <div className="modal-tabs">
                <button className={`nav-tab ${forgeTab === 'settings' ? 'active' : ''}`} onClick={() => setForgeTab('settings')}>IDENTITY_CORE</button>
                {editingPersona && (
                  <button className={`nav-tab ${forgeTab === 'history' ? 'active' : ''}`} onClick={() => {
                    setForgeTab('history');
                    fetch(`${API}/relationships/${sessionId}/${editingPersona.id}`)
                      .then(r => r.json())
                      .then(d => setMoodHistory(d.mood_history || []))
                      .catch(() => setMoodHistory([]));
                  }}>NEURAL_TELEMETRY</button>
                )}
              </div>
            </div>

            <div className="forge-form">
              {forgeTab === 'settings' ? (
                <>
                  <div className="form-group">
                    <label>Persona Name</label>
                    <input
                      type="text"
                      value={forgeData.name}
                      onChange={e => setForgeData({ ...forgeData, name: e.target.value })}
                      placeholder="e.g., Glitch Weaver"
                    />
                  </div>
                  <div className="form-group">
                    <label>IDENTITY_MATRIX (SYSTEM_PROMPT)</label>
                    <textarea
                      rows={4}
                      value={forgeData.system_prompt}
                      onChange={e => setForgeData({ ...forgeData, system_prompt: e.target.value })}
                      placeholder="Define behavior, tone, constraints..."
                    />
                  </div>
                  <div className="form-group">
                    <label>PRIMARY_OBJECTIVE</label>
                    <input
                      type="text"
                      value={forgeData.goal}
                      onChange={e => setForgeData({ ...forgeData, goal: e.target.value })}
                      placeholder="What is this entity trying to achieve?"
                    />
                  </div>
                  <div className="form-group">
                    <label>CORE_EXPERTISE</label>
                    <input
                      type="text"
                      value={forgeData.core_expertise || ""}
                      onChange={e => setForgeData({ ...forgeData, core_expertise: e.target.value })}
                      placeholder="What is this entity's specialized field?"
                    />
                  </div>
                  <div className="form-group">
                    <label>PERSONALITY_STYLE</label>
                    <textarea
                      rows={2}
                      value={forgeData.personality_style || ""}
                      onChange={e => setForgeData({ ...forgeData, personality_style: e.target.value })}
                      placeholder="Describe their speaking style and attitude..."
                    />
                  </div>
                  <div className="form-group">
                    <label>TYPICAL_PHRASES_QUIRKS</label>
                    <textarea
                      rows={2}
                      value={forgeData.quirks || ""}
                      onChange={e => setForgeData({ ...forgeData, quirks: e.target.value })}
                      placeholder="List any unique catchphrases or behavioral quirks..."
                    />
                  </div>

                  <div className="form-group traits-forge">
                    <label>PERSONALITY_TRAITS</label>
                    <div className="traits-grid">
                      {Object.entries(forgeData.traits || {}).map(([trait, value]) => (
                        <div key={trait} className="trait-slider-box">
                          <div className="trait-label-row">
                            <span className="trait-name">{trait.toUpperCase()}</span>
                            <span className="trait-val">{value.toFixed(1)}</span>
                          </div>
                          <input
                            type="range" min="0" max="1" step="0.1"
                            value={value}
                            onChange={e => {
                              const newTraits = { ...(forgeData.traits || {}), [trait]: parseFloat(e.target.value) };
                              setForgeData({ ...forgeData, traits: newTraits });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>BEHAVIORAL_PROTOCOLS (RULES)</label>
                    {(forgeData.rules || []).map((rule, idx) => (
                      <div key={idx} className="dynamic-input">
                        <input
                          type="text"
                          value={rule}
                          onChange={e => {
                            const newRules = [...(forgeData.rules || [])];
                            newRules[idx] = e.target.value;
                            setForgeData({ ...forgeData, rules: newRules });
                          }}
                          placeholder={`Protocol ${idx + 1}`}
                        />
                        <button onClick={() => setForgeData({ ...forgeData, rules: (forgeData.rules || []).filter((_, i) => i !== idx) })}>×</button>
                      </div>
                    ))}
                    <button className="add-btn" onClick={() => setForgeData({ ...forgeData, rules: [...(forgeData.rules || []), ""] })}>
                      + ADD_PROTOCOL
                    </button>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>TEMPERATURE ({forgeData.temperature})</label>
                      <input
                        type="range" min="0" max="1.5" step="0.1"
                        value={forgeData.temperature}
                        onChange={e => setForgeData({ ...forgeData, temperature: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="form-group">
                      <label>TOP_P ({forgeData.top_p})</label>
                      <input
                        type="range" min="0" max="1" step="0.1"
                        value={forgeData.top_p}
                        onChange={e => setForgeData({ ...forgeData, top_p: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>LINKED_MODEL</label>
                      <div style={{ position: 'relative' }}>
                        <select
                          value={forgeData.model}
                          onChange={e => setForgeData({ ...forgeData, model: e.target.value })}
                          className="persona-selector"
                        >
                          <option value="">No model lock</option>
                          {models.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <button type="button" className="refresh-mini-btn" onClick={() => {
                          fetch(`${API}/models`).then(r => r.json()).then(setModels).catch(() => addLog("❌ MODEL_REFRESH_FAILED", "sys"));
                        }} title="Refresh available models">🔄</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>LINKED_VOICE</label>
                      <select
                        value={forgeData.voice}
                        onChange={e => setForgeData({ ...forgeData, voice: e.target.value })}
                        className="persona-selector"
                      >
                        <option value="">No voice lock</option>
                        <option value="female_us">👩 American Female (SLT)</option>
                        <option value="female_diana">👑 Diana (Authoritative)</option>
                        <option value="female_elena">👗 Elena (Clear)</option>
                        <option value="female_luna">💋 Luna (Seductive)</option>
                        <option value="female_seraphina">✨ Seraphina (Premium)</option>
                        <option value="male_us">👨 American Male (BDL)</option>
                        <option value="male_david">🧔 David (Heavy)</option>
                        <option value="male_james">💼 James (Neutral)</option>
                        <option value="male_scot">🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scottish Male (AWB)</option>
                        <option value="male_kunal">👳 Kunal (Indian)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ marginBottom: 8 }}>CAPABILITY_MATRIX</label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <label className="forge-toggle-label">
                        <input
                          type="checkbox"
                          checked={forgeData.imageGeneration !== false}
                          onChange={e => setForgeData({ ...forgeData, imageGeneration: e.target.checked })}
                        />
                        <span className="forge-toggle-chip">IMG_GEN</span>
                      </label>
                      <label className="forge-toggle-label">
                        <input
                          type="checkbox"
                          checked={forgeData.imageRetrieval !== false}
                          onChange={e => setForgeData({ ...forgeData, imageRetrieval: e.target.checked })}
                        />
                        <span className="forge-toggle-chip">IMG_RETRIEVAL</span>
                      </label>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ marginBottom: 8 }}>AVAILABLE_IN_MODES</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {["Normal", "Agent", "Parallel", "Debate", "Collaborate", "Pipeline", "Scenario"].map(mode => {
                        const modes = forgeData.availableModes || ["Normal", "Agent", "Parallel", "Debate", "Collaborate", "Pipeline", "Scenario"];
                        const isActive = modes.includes(mode);
                        return (
                          <button
                            key={mode}
                            type="button"
                            className={`mode-chip${isActive ? ' active' : ''}`}
                            onClick={() => {
                              const updated = isActive 
                                ? modes.filter(m => m !== mode)
                                : [...modes, mode];
                              setForgeData({ ...forgeData, availableModes: updated });
                            }}
                          >
                            {mode}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mood-history-view">
                   {/* Mood History Rendering */}
                   <div className="telemetry-grid">
                      {(moodHistory || []).slice(-20).reverse().map((h, i) => (
                        <div key={i} className="telemetry-card">
                           <div className="telemetry-ts">{h.ts ? new Date(h.ts).toLocaleString() : 'N/A'}</div>
                           <div className="telemetry-mood">
                              <span className="mood-tag">{h.label || 'SYSTEM_NEURAL_LOG'}</span>
                              <span className="mood-vals">V:{(h.v ?? 0).toFixed(2)} A:{(h.a ?? 0).toFixed(2)}</span>
                           </div>
                           <div className="telemetry-trigger">Prompt: "{h.trigger?.substring(0, 40) || '...'}"</div>
                        </div>
                      ))}
                      {(moodHistory || []).length === 0 && <div className="dim p-4">NO_TELEMETRY_DATA_FOUND</div>}
                   </div>
                </div>
              )}

              <div className="forge-footer">
                {editingPersona && (
                  <button className="wipe-btn" onClick={() => {
                    if (window.confirm("⚠️ CAUTION: This will permanently purge this entity's neural memory. Proceed?")) {
                      handleWipePersonaMemory(editingPersona.id);
                    }
                  }}>
                    🔥 WIPE_NEURAL_MEMORIES
                  </button>
                )}
                {forgeSaveStatus === "saved" && <span className="sync-success">✅ SYNC_COMPLETE // COMMITTED</span>}
                <button className="commit-glow-btn" onClick={() => handleSavePersona()}>
                  {editingPersona ? "💾 COMMIT_CHANGES" : "🔥 INITIALIZE_ENTITY"}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default PersonaForge;
