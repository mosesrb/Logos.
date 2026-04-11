import React from 'react';

const SystemHUD = ({ sysStats = { cpu: 0, ram: 0, vram: 0 }, onOpenDbManager }) => {
  return (
    <div className="terminal-section">
      <div className="terminal-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>SYSTEM_HUD_TELEMETRY</span>
        <div style={{ display: 'flex', gap: '5px' }}>
          <span className="sticker-label" onClick={onOpenDbManager} style={{ cursor: 'pointer', border: '1px solid var(--cyan)' }}>DB_ADMIN</span>
          <span className="sticker-label">LIVE_CONV</span>
          <span className="sticker-label sticker-warning">CAUTION: HIGH_LOAD</span>
        </div>
      </div>
      <div className="hud-container">
        <div className="hud-row">
          <span className="hud-label">⚡ CPU <small>[EXE]</small></span>
          <div className="hud-bar">
            <div className="hud-progress" style={{ width: `${sysStats.cpu || 0}%`, background: 'var(--orange)' }} />
          </div>
          <span className="hud-value">{sysStats.cpu || 0}%</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">💾 RAM <small>[MEM]</small></span>
          <div className="hud-bar">
            <div className="hud-progress" style={{ width: `${sysStats.ram || 0}%`, background: 'var(--cyan)' }} />
          </div>
          <span className="hud-value">{sysStats.ram || 0}%</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">🎞️ VRAM <small>[V-BUF]</small></span>
          <div className="hud-bar">
            <div className="hud-progress" style={{ width: `${sysStats.vram || 0}%`, background: 'var(--cyan)' }} />
          </div>
          <span className="hud-value">{sysStats.vram || 0}%</span>
        </div>
      </div>
    </div>
  );
};

export default SystemHUD;
