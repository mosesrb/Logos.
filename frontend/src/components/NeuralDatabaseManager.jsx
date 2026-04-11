import React, { useState, useEffect } from 'react';

const NeuralDatabaseManager = ({ onClose, API }) => {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [data, setData] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, field, value }

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      const res = await fetch(`${API}/db/tables`);
      const d = await res.json();
      setTables(d);
      if (d.length > 0) handleSelectTable(d[0]);
    } catch (e) {
      setError("Failed to fetch relational schema.");
    }
  };

  const handleSelectTable = async (tableName) => {
    setSelectedTable(tableName);
    setLoading(true);
    try {
      const res = await fetch(`${API}/db/data/${tableName}`);
      const d = await res.json();
      setData(d.data || []);
      setCount(d.total || 0);
    } catch (e) {
      setError(`Failed to access [${tableName}].`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (rowIndex, field, value, idField, idValue) => {
    try {
      const res = await fetch(`${API}/db/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selectedTable,
          idField,
          idValue,
          updates: { [field]: value }
        })
      });
      if (res.ok) {
        const newData = [...data];
        newData[rowIndex][field] = value;
        setData(newData);
        setEditingCell(null);
      }
    } catch (e) {
      setError("Update protocol failed.");
    }
  };

  const handleDelete = async (idField, idValue) => {
    if (!window.confirm(`Permanently delete record ${idValue}?`)) return;
    try {
      const res = await fetch(`${API}/db/delete/${selectedTable}?idField=${idField}&idValue=${idValue}`, {
        method: 'DELETE'
      });
      if (res.ok) handleSelectTable(selectedTable);
    } catch (e) {
      setError("Delete procedure aborted.");
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(`⚠️ CAUTION: Permanently clear all data from [${selectedTable}]? This action cannot be undone.`)) return;
    if (!window.confirm(`FINAL_VERIFICATION: Confirm total truncation of ${selectedTable}?`)) return;
    
    try {
      const res = await fetch(`${API}/db/delete/${selectedTable}?all=true`, {
        method: 'DELETE'
      });
      if (res.ok) handleSelectTable(selectedTable);
    } catch (e) {
      setError("Protocol CLEAR_ALL aborted.");
    }
  };

  return (
    <div className="db-manager-overlay">
      <div className="db-manager-panel glass">
        <div className="terminal-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>NEURAL_DATA_ARCHITECT [v1.0]</span>
          <button onClick={onClose} className="tool-btn" style={{ color: 'var(--red)' }}>TERMINATE</button>
        </div>

        <div className="db-layout">
          <aside className="db-sidebar">
            <h4 className="sticker-label">LOGICAL_TABLES</h4>
            <ul>
              {tables.map(t => (
                <li 
                  key={t} 
                  className={selectedTable === t ? 'active' : ''} 
                  onClick={() => handleSelectTable(t)}
                >
                  {t.toUpperCase()}
                </li>
              ))}
            </ul>
          </aside>

          <main className="db-content">
            <div className="db-header">
              <div>
                <span className="sticker-label sticker-warning">{selectedTable}</span>
                <small className="hud-value" style={{ marginLeft: '10px' }}>{count} RECORDS DETECTED</small>
              </div>
              <button 
                className="tool-btn" 
                onClick={handleDeleteAll}
                style={{ color: 'var(--red)', border: '1px solid var(--red)', padding: '4px 12px' }}
              >
                TRUNCATE_TABLE
              </button>
            </div>

            {loading ? (
              <div className="scanning-line">SCANNING_DATA_CLUSTER...</div>
            ) : (
              <div className="db-table-wrapper">
                <table className="db-table">
                  <thead>
                    <tr>
                      {data.length > 0 && Object.keys(data[0]).map(k => <th key={k}>{k}</th>)}
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => {
                      const idField = Object.keys(row)[0]; // Assume first col is PK
                      const idValue = row[idField];
                      const isEdited = editingCell?.rowIndex === i;

                      return (
                        <tr key={i} className={isEdited ? 'db-row-editing' : ''}>
                          {Object.entries(row).map(([key, val]) => (
                            <td key={key} onDoubleClick={() => setEditingCell({ rowIndex: i, field: key, value: val, original: val })}>
                              {editingCell?.rowIndex === i && editingCell?.field === key ? (
                                <input 
                                  autoFocus
                                  className="db-input"
                                  value={editingCell.value} 
                                  onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdate(i, key, editingCell.value, idField, idValue);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                />
                              ) : (
                                <span>{String(val)}</span>
                              )}
                            </td>
                          ))}
                          <td className="db-actions">
                            {isEdited ? (
                              <button 
                                className="tool-btn commit-btn-mini" 
                                onClick={() => handleUpdate(i, editingCell.field, editingCell.value, idField, idValue)}
                              >
                                COMMIT
                              </button>
                            ) : (
                              <button className="tool-btn del-btn" onClick={() => handleDelete(idField, idValue)}>DEL</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {error && <div className="sticker-label sticker-warning" style={{ marginTop: '10px' }}>{error}</div>}
          </main>
        </div>
      </div>

      <style jsx>{`
        .db-manager-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(10px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }
        .db-manager-panel {
          width: 100%;
          max-width: 1200px;
          height: 80vh;
          border: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .db-layout {
          display: grid;
          grid-template-columns: 200px 1fr;
          flex: 1;
          overflow: hidden;
        }
        .db-sidebar {
          border-right: 1px solid var(--border-color);
          padding: 15px;
          background: rgba(0,255,255,0.03);
        }
        .db-sidebar ul {
          list-style: none;
          padding: 0;
          margin-top: 15px;
        }
        .db-sidebar li {
          padding: 8px 12px;
          cursor: pointer;
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.6);
          transition: all 0.2s;
        }
        .db-sidebar li:hover {
          color: var(--cyan);
          background: rgba(0,255,255,0.1);
        }
        .db-sidebar li.active {
          color: var(--background);
          background: var(--cyan);
          box-shadow: 0 0 10px var(--cyan);
        }
        .db-content {
          padding: 20px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .db-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .db-table-wrapper {
          overflow: auto;
          flex: 1;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .db-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
        }
        .db-table th {
          background: rgba(255,255,255,0.05);
          text-align: left;
          padding: 10px;
          color: var(--cyan);
          border-bottom: 1px solid var(--border-color);
          position: sticky;
          top: 0;
        }
        .db-table td {
          padding: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.8);
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .db-table tr:hover td {
          background: rgba(255,255,255,0.02);
        }
        .db-input {
          background: var(--background);
          border: 1px solid var(--cyan);
          color: var(--cyan);
          padding: 4px;
          width: 100%;
          font-family: inherit;
        }
        .del-btn {
          padding: 2px 6px;
          font-size: 0.6rem;
          background: rgba(255,0,0,0.1);
          color: var(--red);
        }
        .del-btn:hover {
          background: var(--red);
          color: white;
        }
        .commit-btn-mini {
          background: var(--cyan);
          color: var(--background);
          padding: 4px 8px;
          font-size: 0.65rem;
          border-radius: 2px;
          font-weight: bold;
          box-shadow: 0 0 10px rgba(0,255,255,0.3);
        }
        .db-row-editing td {
          background: rgba(0,255,255,0.05);
          color: var(--cyan);
        }
        .db-actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .scanning-line {
          color: var(--cyan);
          font-family: 'Geist Mono';
          animation: blink 1s infinite;
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
};

export default NeuralDatabaseManager;
