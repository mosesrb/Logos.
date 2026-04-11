import React from 'react';

const ChatSidebar = ({
  sessions = {},
  currentSession = null,
  selectSession,
  createSession,
  renameSession,
  deleteSession,
  sessionFiles = [],
  deleteFile,
  setShowUserProfile,
  setShowPersonaForge,
  sidebarWidth
}) => {
  return (
    <aside className="neural-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth, flexShrink: 0 }}>
      <div className="hardware-header">
        <span>SIDEBAR_MODULE_01</span>
        <span className="hardware-id">PN: 88-XJ-S</span>
      </div>
      <div className="neural-nav">
        <div className="neural-nav-header">NEURAL SESSIONS</div>
        <button className="new-session-btn" onClick={createSession}>
          NEW_NEURAL_LINK
        </button>

        <div className="neural-session-list">
          {Object.values(sessions)
            .sort((a, b) => new Date(b.lastUpdate || b.createdAt) - new Date(a.lastUpdate || a.createdAt))
            .map((s) => (
              <div
                key={s.id}
                className={`neural-session-item ${currentSession?.id === s.id ? "active" : ""}`}
                onClick={() => selectSession(s.id)}
              >
                <div className="session-icon">◈</div>
                <div className="session-info">
                  <input
                    className="session-name"
                    value={s.title}
                    onChange={(e) => renameSession(s.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="session-meta">
                    {new Date(s.lastUpdate || s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button className="session-delete" onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}>×</button>
              </div>
            ))}
        </div>

        <div className="sidebar-tools">
          <div className="decal-label" style={{ padding: '0 8px 4px', fontSize: '6px' }}>[REF_TOOLS_v9]</div>
          <div className="neural-nav-header">TOOLS</div>
          <button className="sidebar-btn" onClick={() => setShowUserProfile(true)}>
            👤 User Profile
          </button>
          <button className="sidebar-btn" onClick={() => setShowPersonaForge(true)}>
            ⚒️ Persona Forge
          </button>
        </div>
      </div>

      {/* ─── RAG Documents Panel ─── */}
      {currentSession && (
        <div className="sidebar-controls">
          <div className="hardware-header" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            <span>CONTROL_UPGRADES</span>
            <span className="hardware-id">REV: 0.9</span>
          </div>
          <div className="sidebar-toggles">
            <div className="sidebar-brand-sub" style={{ marginBottom: 10 }}>AUGMENTED_DATA</div>
            <div className="rag-file-list">
              {sessionFiles.length === 0 ? (
                <div className="rag-empty">No docs uploaded</div>
              ) : (
                sessionFiles.map((f) => (
                  <div key={f.diskName || f.name} className="rag-file-item">
                    <div className="rag-file-info">
                      <div className="rag-file-name">{f.name}</div>
                      <div className="rag-file-meta">{(f.length / 1024).toFixed(1)} KB</div>
                    </div>
                    <button className="rag-file-delete" onClick={() => deleteFile(f.diskName)}>×</button>
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
