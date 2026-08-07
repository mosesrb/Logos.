import React from 'react';
import SolarisIcon from './SolarisIcon';
import { useStore } from '../store/useStore';

const ChatSidebar = ({
  selectSession,
  createSession,
  renameSession,
  deleteSession,
  deleteFile,
}) => {
  const {
    sessions,
    currentSession,
    sessionFiles,
    sidebarWidth,
    setShowUserProfile,
    setShowPersonaForge
  } = useStore();
  return (
    <aside className="neural-sidebar left-panel glass-panel" aria-label="Session navigation">
      <div className="hardware-header" style={{ background: 'var(--solaris-gold-low)', color: 'var(--solaris-gold)', borderBottom: '1px solid var(--solaris-gold-low)' }}>
        <span style={{ fontFamily: 'Orbitron, sans-serif' }}>SIDEBAR_MODULE_01</span>
        <span className="hardware-id dimmed-telemetry" style={{ color: 'var(--solaris-gold)' }}>PN: 88-XJ-S</span>
      </div>
      
      <div className="neural-nav">
        <div className="neural-nav-header" style={{ color: 'var(--solaris-gold)', letterSpacing: '2px', fontSize: '10px' }}>NEURAL SESSIONS</div>
        <button className="new-session-btn commit-glow-btn" onClick={createSession} style={{ marginBottom: '15px' }}>
          <SolarisIcon icon="neural" size={12} style={{ marginRight: '8px' }} />
          NEW_NEURAL_LINK
        </button>

        <div className="neural-session-list" style={{ flex: 1, overflowY: 'auto' }}>
          {Object.values(sessions)
            .sort((a, b) => new Date(b.lastUpdate || b.createdAt) - new Date(a.lastUpdate || a.createdAt))
            .map((s, i) => (
              <div
                key={s.id || `session-${i}`}
                className={`neural-session-item ${currentSession?.id === s.id ? "active" : ""}`}
                onClick={() => selectSession(s.id)}
                style={{ 
                  borderLeft: currentSession?.id === s.id ? '2px solid var(--solaris-gold)' : '2px solid transparent',
                  background: currentSession?.id === s.id ? 'var(--solaris-gold-low)' : 'transparent'
                }}
              >
                <div className="session-icon">
                  <SolarisIcon icon="chat" size={14} style={{ color: currentSession?.id === s.id ? 'var(--solaris-gold)' : 'var(--solaris-gold-low)' }} />
                </div>
                <div className="session-info">
                  <input
                    className="session-name"
                    value={s.title}
                    onChange={(e) => renameSession(s.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: currentSession?.id === s.id ? 'var(--solaris-gold)' : 'inherit' }}
                  />
                  <div className="session-meta dimmed-telemetry" style={{ fontSize: '8px' }}>
                    LAST_SYNC: {new Date(s.lastUpdate || s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button 
                  className="session-delete dimmed-telemetry" 
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  style={{ color: 'var(--solaris-gold)' }}
                >
                  <SolarisIcon icon="close" size={10} />
                </button>
              </div>
            ))}
        </div>

        <div className="sidebar-tools" style={{ borderTop: '1px solid var(--solaris-gold-low)', paddingTop: '15px', marginTop: '10px' }}>
          <div className="decal-label" style={{ padding: '0 8px 4px', fontSize: '6px', color: '#c5a572', opacity: 1 }}>[REF_TOOLS_v9]</div>
          <div className="neural-nav-header" style={{ color: 'var(--solaris-gold)', letterSpacing: '2px', fontSize: '10px' }}>TOOLS_ARRAY</div>
          <button className="sidebar-btn" onClick={() => setShowUserProfile(true)} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--solaris-gold)' }}>
            <SolarisIcon icon="user" size={14} />
            USER_PROFILE
          </button>
          <button className="sidebar-btn" onClick={() => setShowPersonaForge(true)} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--solaris-gold)' }}>
            <SolarisIcon icon="settings" size={14} />
            PERSONA_FORGE
          </button>
        </div>
      </div>

      {/* ─── RAG Documents Panel ─── */}
      {currentSession && (
        <div className="sidebar-controls" style={{ marginTop: 'auto' }}>
          <div className="hardware-header" style={{ borderTop: '1px solid var(--solaris-gold-low)', borderBottom: '1px solid var(--solaris-gold-low)', background: 'var(--solaris-gold-low)', color: 'var(--solaris-gold)' }}>
            <span style={{ fontFamily: 'Orbitron, sans-serif' }}>AUGMENTED_STORAGE</span>
            <span className="hardware-id dimmed-telemetry" style={{ color: 'var(--solaris-gold)' }}>REV: 0.9</span>
          </div>
          <div className="sidebar-toggles" style={{ padding: '12px' }}>
            <div className="rag-file-list">
              {sessionFiles.length === 0 ? (
                <div className="rag-empty dimmed-telemetry" style={{ fontSize: '10px', fontStyle: 'italic' }}>NO_LOCAL_DATA_CACHED</div>
              ) : (
                sessionFiles.map((f, i) => (
                  <div key={f.diskName || f.name || `file-${i}`} className="rag-file-item" style={{ border: '1px solid var(--solaris-gold-low)', background: 'rgba(212, 175, 55, 0.05)', borderRadius: '2px' }}>
                    <div className="rag-file-info">
                      <div className="rag-file-name" style={{ color: 'var(--solaris-gold)', fontSize: '10px' }}>{f.name}</div>
                      <div className="rag-file-meta dimmed-telemetry" style={{ fontSize: '8px' }}>{(f.length / 1024).toFixed(1)} KB // BLOB</div>
                    </div>
                    <button 
                      className="rag-file-delete dimmed-telemetry" 
                      onClick={() => deleteFile(f.diskName)}
                      style={{ color: 'var(--solaris-gold)' }}
                    >
                      <SolarisIcon icon="trash" size={10} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default ChatSidebar;
