import React, { useState, useEffect } from 'react';

const PrivacyDashboard = ({ onClose, API, addLog }) => {
  const [shredStatus, setShredStatus] = useState({});
  const [encryptionKey, setEncryptionKey] = useState('');
  const [isEncrypted, setIsEncrypted] = useState(false);

  useEffect(() => {
    fetch(`${API}/privacy/status`)
      .then(r => r.json())
      .then(data => setIsEncrypted(data.encrypted))
      .catch(() => {});
  }, [API]);

  const handleSetKey = async () => {
    if (!encryptionKey) return alert("Please enter a key.");
    try {
      const res = await fetch(`${API}/privacy/encrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: encryptionKey })
      });
      if (res.ok) {
        setIsEncrypted(true);
        addLog("PRIVACY: Local storage encryption enabled.", "sys");
      }
    } catch (e) {
      addLog("PRIVACY_ERROR: Failed to enable encryption.", "err");
    }
  };

  const shredTable = async (table, label) => {
    if (!window.confirm(`⚠️ WARNING: This will permanently delete ALL data in ${label}. This cannot be undone. Proceed?`)) return;

    setShredStatus({ ...shredStatus, [table]: 'shredding' });
    try {
      const res = await fetch(`${API}/db/delete/${table}?all=true`, { method: 'DELETE' });
      if (res.ok) {
        setShredStatus({ ...shredStatus, [table]: 'success' });
        addLog(`PRIVACY: Purged ${label} substrate.`, 'sys');
      } else {
        throw new Error("Purge failed");
      }
    } catch (e) {
      setShredStatus({ ...shredStatus, [table]: 'error' });
      addLog(`PRIVACY_ERROR: Failed to purge ${label}.`, 'err');
    }
  };

  const shredAllData = async () => {
    if (!window.confirm("☢️ NUCLEAR OPTION: This will wipe ALL sessions, personas, and memories. Are you absolutely sure?")) return;

    const tables = [
      { id: 'Sessions', label: 'All Sessions' },
      { id: 'GlobalMemory', label: 'Episodic Memory' },
      { id: 'VisualMemory', label: 'Visual Memory' },
      { id: 'Relationships', label: 'Emotional Data' }
    ];

    for (const table of tables) {
      await shredTable(table.id, table.label);
    }
    window.location.reload(); // Refresh to clear app state
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content forge-modal privacy-dashboard" style={{ maxWidth: '600px' }}>
        <div className="hardware-header">
          <span>PRIVACY_CENTRAL_v1.0</span>
          <span className="hardware-id">ENCRYPT: OFF</span>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>

        <div className="forge-form" style={{ padding: '20px' }}>
          <div className="form-group">
            <label>LOCAL_ENCRYPTION (EXPERIMENTAL)</label>
            <p className="dim" style={{ fontSize: '0.75rem', marginBottom: '10px' }}>
              Protect your local database and session files with AES-256 encryption.
              {isEncrypted ? ' ✅ Encryption is active.' : ' ⚠️ Not currently encrypted.'}
            </p>
            {!isEncrypted && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="password"
                  placeholder="Set Encryption Key"
                  value={encryptionKey}
                  onChange={e => setEncryptionKey(e.target.value)}
                />
                <button className="commit-glow-btn" onClick={handleSetKey} style={{ whiteSpace: 'nowrap' }}>
                  ACTIVATE
                </button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>DATA_RESIDENCY</label>
            <p className="dim" style={{ fontSize: '0.8rem', marginBottom: '15px' }}>
              All LÓGOS data is stored strictly on your local hardware. No telemetry or external syncing is active.
            </p>
          </div>

          <div className="form-group">
            <label>SECURE_PURGE_CONTROLS</label>
            <div className="shred-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button className="sidebar-btn shred-btn" onClick={() => shredTable('Sessions', 'Sessions')}>
                🗑️ Shred All Sessions
              </button>
              <button className="sidebar-btn shred-btn" onClick={() => shredTable('GlobalMemory', 'Episodic Memory')}>
                🧠 Wipe Global Memory
              </button>
              <button className="sidebar-btn shred-btn" onClick={() => shredTable('VisualMemory', 'Visual Memory')}>
                👁️ Purge Visual Data
              </button>
              <button className="sidebar-btn shred-btn" onClick={() => shredTable('Relationships', 'Emotional Bonds')}>
                💔 Reset Relationships
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '30px', borderTop: '1px solid var(--red)', paddingTop: '20px' }}>
            <label style={{ color: 'var(--red)' }}>DANGER_ZONE</label>
            <button className="commit-glow-btn" style={{ background: 'var(--red)', color: 'white' }} onClick={shredAllData}>
              ☢️ FACTORY_RESET (WIPE EVERYTHING)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyDashboard;
