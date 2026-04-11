import React from 'react';

const NarrativeEvaluation = ({
  evaluation,
  setEvaluation
}) => {
  if (!evaluation) return null;

  return (
    <div className="modal-overlay" onClick={() => setEvaluation(null)}>
      <div className="modal-content glass-panel" style={{ maxWidth: '600px', border: '1px solid var(--cyan)' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ color: 'var(--cyan)' }}>📊 NARRATIVE_INTEGRITY_REPORT</h2>
          <button className="close-btn" onClick={() => setEvaluation(null)}>×</button>
        </div>
        <div className="evaluation-grid">
          <div className="eval-stat">
            <label>PERSONA_FIDELITY</label>
            <div className="stat-value" style={{ color: evaluation.fidelity > 7 ? 'var(--cyan)' : 'var(--accent-gold)' }}>
              {evaluation.fidelity || 0}/10
            </div>
          </div>
          <div className="eval-stat">
            <label>TEMPORAL_PROGRESSION</label>
            <div className="stat-value" style={{ color: evaluation.progression > 7 ? 'var(--cyan)' : 'var(--accent-gold)' }}>
              {evaluation.progression || 0}/10
            </div>
          </div>
        </div>
        <div className="eval-section">
          <label>WORLD_STATE_SYNOPSIS</label>
          <p>{evaluation.synopsis || "No synopsis available."}</p>
        </div>
        {evaluation.anomalies?.length > 0 && (
          <div className="eval-section">
            <label>DETECTED_ANOMALIES</label>
            <ul className="anomaly-list">
              {evaluation.anomalies.map((a, i) => <li key={i}>⚠️ {a}</li>)}
            </ul>
          </div>
        )}
        <div className="forge-actions">
          <button className="save-btn" style={{ background: 'var(--cyan)', border: 'none' }} onClick={() => setEvaluation(null)}>ACKNOWLEDGE</button>
        </div>
      </div>
    </div>
  );
};

export default NarrativeEvaluation;
