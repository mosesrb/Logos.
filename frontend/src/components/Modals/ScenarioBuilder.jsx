import React from 'react';

const ScenarioBuilder = ({
  showScenarioBuilder,
  setShowScenarioBuilder,
  editingScenario,
  forgeScenarioData,
  setForgeScenarioData,
  personas = [],
  handleSaveScenario,
  deleteScenario
}) => {
  if (!showScenarioBuilder) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content forge-modal">
        <div className="modal-header">
          <h2>{editingScenario ? "🔧 Modify Simulation" : "🚀 Architect Scenario"}</h2>
          <button className="close-btn" onClick={() => setShowScenarioBuilder(false)}>×</button>
        </div>
        <div className="forge-form">
          <div className="form-group">
            <label>Scenario Name</label>
            <input
              type="text"
              value={forgeScenarioData.name}
              onChange={e => setForgeScenarioData({ ...forgeScenarioData, name: e.target.value })}
              placeholder="e.g., Orbital Heist"
            />
          </div>
          <div className="form-group">
            <label>World Narrative / Overview</label>
            <textarea
              rows={3}
              value={forgeScenarioData.description}
              onChange={e => setForgeScenarioData({ ...forgeScenarioData, description: e.target.value })}
              placeholder="Set the scene..."
            />
          </div>
          <div className="form-group">
            <label>Initial Narrative Prompt</label>
            <textarea
              rows={2}
              value={forgeScenarioData.initial_prompt}
              onChange={e => setForgeScenarioData({ ...forgeScenarioData, initial_prompt: e.target.value })}
              placeholder="The first message of the simulation..."
            />
          </div>

          <div className="form-group">
            <label>Simulation Roles & Personas</label>
            {forgeScenarioData.participant_roles.map((role, idx) => (
              <div key={idx} className="dynamic-input-row">
                <input
                  type="text"
                  value={role}
                  onChange={e => {
                    const newRoles = [...forgeScenarioData.participant_roles];
                    newRoles[idx] = e.target.value;
                    setForgeScenarioData({ ...forgeScenarioData, participant_roles: newRoles });
                  }}
                  placeholder={`Role Name (e.g., Pilot)`}
                />
                <select
                  value={forgeScenarioData.personaMap[role] || ""}
                  onChange={e => {
                    const newMap = { ...forgeScenarioData.personaMap };
                    newMap[role] = e.target.value;
                    setForgeScenarioData({ ...forgeScenarioData, personaMap: newMap });
                  }}
                  className="persona-mini-select"
                >
                  <option value="">— Select Persona —</option>
                  {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input
                  type="text"
                  className="intent-mini-input"
                  value={forgeScenarioData.hiddenIntents[role] || ""}
                  onChange={e => {
                    const newIntents = { ...forgeScenarioData.hiddenIntents };
                    newIntents[role] = e.target.value;
                    setForgeScenarioData({ ...forgeScenarioData, hiddenIntents: newIntents });
                  }}
                  placeholder="Hidden Intent/Agenda"
                />
                <button onClick={() => {
                  const newMap = { ...forgeScenarioData.personaMap };
                  delete newMap[role];
                  setForgeScenarioData({
                    ...forgeScenarioData,
                    participant_roles: forgeScenarioData.participant_roles.filter((_, i) => i !== idx),
                    personaMap: newMap
                  });
                }}>×</button>
              </div>
            ))}
            <button className="add-btn" onClick={() => setForgeScenarioData({ ...forgeScenarioData, participant_roles: [...forgeScenarioData.participant_roles, ""] })}>
              + Add Role
            </button>
          </div>

          <div className="form-group">
            <label>Simulation Engine Settings</label>
            <div className="forge-toggles">
              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={forgeScenarioData.rag_mode}
                  onChange={e => setForgeScenarioData({ ...forgeScenarioData, rag_mode: e.target.checked })}
                />
                <span>RAG (Episodic Memory)</span>
              </label>
              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={forgeScenarioData.unrestricted_mode}
                  onChange={e => setForgeScenarioData({ ...forgeScenarioData, unrestricted_mode: e.target.checked })}
                />
                <span>Unfiltered (Limbic Bypass)</span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>World Rules</label>
            {forgeScenarioData.world_rules.map((rule, idx) => (
              <div key={idx} className="dynamic-input">
                <input
                  type="text"
                  value={rule}
                  onChange={e => {
                    const newRules = [...forgeScenarioData.world_rules];
                    newRules[idx] = e.target.value;
                    setForgeScenarioData({ ...forgeScenarioData, world_rules: newRules });
                  }}
                  placeholder={`Rule (e.g., Gravity is 0.3g)`}
                />
                <button onClick={() => setForgeScenarioData({ ...forgeScenarioData, world_rules: forgeScenarioData.world_rules.filter((_, i) => i !== idx) })}>×</button>
              </div>
            ))}
            <button className="add-btn" onClick={() => setForgeScenarioData({ ...forgeScenarioData, world_rules: [...forgeScenarioData.world_rules, ""] })}>
              + Add World Rule
            </button>
          </div>

          <div className="forge-actions">
            {editingScenario && (
              <button className="delete-btn-main" onClick={() => { deleteScenario(editingScenario.id); setShowScenarioBuilder(false); }}>
                🗑️ Delete Narrative
              </button>
            )}
            <button className="save-btn" onClick={handleSaveScenario}>
              {editingScenario ? "💾 Commit Changes" : "🛰️ Launch Scenario"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScenarioBuilder;
