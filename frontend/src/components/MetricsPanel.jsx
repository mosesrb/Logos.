import React from 'react';

const MetricsPanel = ({ metrics = { latency: 0, tps: 0, tokens: 0 }, isStreaming = false }) => {
  return (
    <div className="terminal-section">
      <div className="terminal-section-title">METRICS</div>
      <div className="terminal-stats">
        <div className="stat-row">LATENCY: <span>{metrics.latency || 0}ms</span></div>
        <div className="stat-row">VELOCITY: <span>{metrics.tps || 0} tps</span></div>
        <div className="stat-row">CONTEXT: <span>{metrics.tokens || 0} chars</span></div>
        <div className="stat-row">STATUS: <span className={isStreaming ? "status-active" : "status-idle"}>{isStreaming ? "PROCESSING" : "IDLE"}</span></div>
      </div>
    </div>
  );
};

export default MetricsPanel;
