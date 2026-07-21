import React from 'react';
import SolarisIcon from './SolarisIcon';

const SystemHUD = ({ sysStats = { cpu: 0, ram: 0, vram: 0 }, onOpenDbManager, databaseAdminEnabled = false }) => {
  return (
    <div className="terminal-section glass-panel" style={{ padding: '12px', border: '1px solid var(--solaris-gold-low)' }}>
      <div className="terminal-section-title" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '10px',
        borderBottom: '1px solid var(--solaris-gold-low)',
        paddingBottom: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SolarisIcon icon="metrics" size={12} style={{ color: 'var(--solaris-gold)' }} />
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '11px', letterSpacing: '1px', color: 'var(--solaris-gold)' }}>SYSTEM_TELEMETRY</span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {databaseAdminEnabled ? (
            <button 
              type="button"
              className="sticker-label commit-glow-btn" 
              onClick={onOpenDbManager} 
              style={{ 
                cursor: 'pointer', 
                fontSize: '9px',
                padding: '2px 6px',
                height: 'auto',
                minWidth: 'auto'
              }}
            >
              DB_ADMIN
            </button>
          ) : (
            <span className="sticker-label" title="Database administration is disabled in this build" style={{ fontSize: '9px', background: 'var(--solaris-gold)', color: '#111' }}>
              DB_ADMIN_LOCKED
            </span>
          )}
          <span className="sticker-label" style={{ fontSize: '9px', background: 'var(--solaris-gold)', color: 'var(--bg-deep)' }}>LIVE_CONV</span>
        </div>
      </div>

      <div className="hud-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="hud-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px' }}>
            <SolarisIcon icon="neural" size={10} style={{ color: 'var(--solaris-gold)' }} />
            <span className="hud-label" style={{ fontSize: '10px', color: 'var(--solaris-gold)', opacity: 0.8 }}>CPU <small>[EXE]</small></span>
          </div>
          <div className="hud-bar" style={{ flex: 1, height: '4px', background: 'var(--solaris-gold-low)', borderRadius: '2px', overflow: 'hidden' }}>
            <div className="hud-progress" style={{ width: `${sysStats.cpu || 0}%`, height: '100%', background: 'var(--solaris-gold)', boxShadow: '0 0 5px var(--solaris-gold)' }} />
          </div>
          <span className="hud-value" style={{ minWidth: '35px', textAlign: 'right', fontSize: '10px', color: 'var(--solaris-gold)', fontFamily: 'JetBrains Mono' }}>{sysStats.cpu || 0}%</span>
        </div>

        <div className="hud-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px' }}>
            <SolarisIcon icon="settings" size={10} style={{ color: 'var(--solaris-gold)' }} />
            <span className="hud-label" style={{ fontSize: '10px', color: 'var(--solaris-gold)', opacity: 0.8 }}>RAM <small>[MEM]</small></span>
          </div>
          <div className="hud-bar" style={{ flex: 1, height: '4px', background: 'var(--solaris-gold-low)', borderRadius: '2px', overflow: 'hidden' }}>
            <div className="hud-progress" style={{ width: `${sysStats.ram || 0}%`, height: '100%', background: 'var(--solaris-gold)', boxShadow: '0 0 5px var(--solaris-gold)' }} />
          </div>
          <span className="hud-value" style={{ minWidth: '35px', textAlign: 'right', fontSize: '10px', color: 'var(--solaris-gold)', fontFamily: 'JetBrains Mono' }}>{sysStats.ram || 0}%</span>
        </div>

        <div className="hud-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px' }}>
            <SolarisIcon icon="terminal" size={10} style={{ color: 'var(--solaris-gold)' }} />
            <span className="hud-label" style={{ fontSize: '10px', color: 'var(--solaris-gold)', opacity: 0.8 }}>VRAM <small>[BUF]</small></span>
          </div>
          <div className="hud-bar" style={{ flex: 1, height: '4px', background: 'var(--solaris-gold-low)', borderRadius: '2px', overflow: 'hidden' }}>
            <div className="hud-progress" style={{ width: `${sysStats.vram || 0}%`, height: '100%', background: 'var(--solaris-gold)', boxShadow: '0 0 5px var(--solaris-gold)' }} />
          </div>
          <span className="hud-value" style={{ minWidth: '35px', textAlign: 'right', fontSize: '10px', color: 'var(--solaris-gold)', fontFamily: 'JetBrains Mono' }}>{sysStats.vram || 0}%</span>
        </div>
      </div>
    </div>
  );
};

export default SystemHUD;
