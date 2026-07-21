import React, { useState, useEffect } from 'react';
import SolarisIcon from './SolarisIcon';

const NeuralDatabaseManager = ({ onClose, API }) => {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [data, setData] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showTruncateConfirm, setShowTruncateConfirm] = useState(false);
  const [confirmTableName, setConfirmTableName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit] = useState(100);
  const [editingCell, setEditingCell] = useState(null);
  const [pkField, setPkField] = useState(null);
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowData, setNewRowData] = useState({});
  const [tableSchema, setTableSchema] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});

  const filteredData = data.filter(row => 
    Object.values(row).some(val => 
      String(val || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const totalPages = Math.ceil(count / limit);
  const currentPage = Math.floor(offset / limit) + 1;


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

  const handleSelectTable = async (tableName, newOffset = 0) => {
    setSelectedTable(tableName);
    setLoading(true);
    if (newOffset === 0) setSearchQuery(""); // Clear search on table swap, but not on page change
    setOffset(newOffset);
    
    try {
      const res = await fetch(`${API}/db/data/${tableName}?limit=${limit}&offset=${newOffset}`);
      const d = await res.json();
      setData(d.data || []);
      setCount(d.total || 0);
      setPkField(d.pk || (d.data?.length > 0 ? Object.keys(d.data[0])[0] : null));
      setTableSchema(d.schema || []);
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
    if (confirmTableName !== selectedTable) return;
    
    try {
      const res = await fetch(`${API}/db/delete/${selectedTable}?all=true`, {
        method: 'DELETE'
      });
      if (res.ok) {
        handleSelectTable(selectedTable);
        setShowTruncateConfirm(false);
        setConfirmTableName("");
      }
    } catch (e) {
      setError("Protocol CLEAR_ALL aborted.");
    }
  };

  const validateRow = (rowData) => {
    const errors = {};
    tableSchema.forEach(col => {
      // Check for required fields (notnull=1 and no default value)
      if (col.notnull === 1 && col.pk === 0 && col.dflt_value === null) {
        if (!rowData[col.name] || rowData[col.name].toString().trim() === "") {
          errors[col.name] = "REQUIRED";
        }
      }
    });
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInsert = async () => {
    if (!validateRow(newRowData)) {
      setError("Constraint violation: Required fields missing.");
      return;
    }

    try {
      const res = await fetch(`${API}/db/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selectedTable,
          data: newRowData
        })
      });
      if (res.ok) {
        setIsAddingRow(false);
        setNewRowData({});
        setValidationErrors({});
        handleSelectTable(selectedTable);
      } else {
        const d = await res.json();
        setError(d.error || "Insertion failure.");
      }
    } catch (e) {
      setError("Add procedure failed.");
    }
  };

  const getInputType = (sqliteType) => {
    const t = sqliteType.toUpperCase();
    if (t.includes('INT')) return 'number';
    if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE')) return 'number';
    if (t.includes('BOOL')) return 'checkbox';
    return 'text';
  };

  return (
    <div className="db-manager-overlay">
      <div className="db-manager-panel glass-panel">
        <div className="terminal-section-title" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <SolarisIcon icon="database" size={16} />
            <span style={{ fontFamily: 'var(--font-display)', letterSpacing: '2px', fontSize: '13px' }}>NEURAL_DATA_ARCHITECT [v1.0]</span>
          </div>
          <button onClick={onClose} className="tool-btn" style={{ color: 'var(--solaris-gold)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <SolarisIcon icon="close" size={18} />
          </button>
        </div>

        <div className="db-layout">
          <aside className="db-sidebar">
            <h4 className="sticker-label" style={{ marginBottom: '15px' }}>LOGICAL_TABLES</h4>
            <ul>
              {tables.map(t => (
                <li 
                  key={t} 
                  className={selectedTable === t ? 'active' : ''} 
                  onClick={() => handleSelectTable(t)}
                >
                  <SolarisIcon icon="scenario" size={12} style={{ marginRight: '8px', opacity: 0.6 }} />
                  {t.toUpperCase()}
                </li>
              ))}
            </ul>
          </aside>

          <main className="db-content">
            <div className="db-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                <span className="sticker-label" style={{ background: 'var(--solaris-accent)', color: 'var(--solaris-void)', fontWeight: 'bold' }}>{selectedTable}</span>
                <button 
                  className="tool-btn" 
                  onClick={() => handleSelectTable(selectedTable, offset)}
                  title="RELOAD_DATA"
                >
                  <SolarisIcon icon="refresh" size={14} />
                </button>
                <div className="search-container" style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                  <SolarisIcon icon="search" size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input 
                    type="text" 
                    placeholder="FILTER_RECORDS..." 
                    className="db-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <SolarisIcon icon="close" size={10} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <small className="hud-value" style={{ letterSpacing: '1px', color: 'var(--text-secondary)' }}>
                      {filteredData.length} / {count} RECORDS
                    </small>
                    <small className="hud-value" style={{ color: 'var(--solaris-accent)', fontSize: '9px' }}>
                      PAGE {currentPage} / {totalPages || 1}
                    </small>
                  </div>
                  {count > limit && (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button 
                        disabled={offset === 0} 
                        className="tool-btn" 
                        onClick={() => handleSelectTable(selectedTable, Math.max(0, offset - limit))}
                        style={{ padding: '0 5px', fontSize: '10px' }}
                      >PREV</button>
                      <button 
                        disabled={offset + limit >= count} 
                        className="tool-btn" 
                        onClick={() => handleSelectTable(selectedTable, offset + limit)}
                        style={{ padding: '0 5px', fontSize: '10px' }}
                      >NEXT</button>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="commit-glow-btn" 
                  style={{ height: '32px', fontSize: '9px', padding: '0 15px' }}
                  onClick={() => setIsAddingRow(true)}
                >
                  <SolarisIcon icon="plus" size={12} style={{ stroke: 'currentColor' }} />
                  ADD_RECORD
                </button>
                <button 
                  className="commit-glow-btn truncate-btn" 
                  onClick={() => setShowTruncateConfirm(true)}
                >
                  <SolarisIcon icon="trash" size={12} style={{ stroke: 'currentColor' }} />
                  TRUNCATE_TABLE
                </button>
              </div>
            </div>

            {loading ? (
              <div className="scanning-line" style={{ fontFamily: 'var(--font-mono)', color: 'var(--solaris-accent)' }}>SCANNING_DATA_CLUSTER...</div>
            ) : (
              <div className="db-table-wrapper">
                <table className="db-table">
                  <thead>
                    <tr>
                      {data.length > 0 && Object.keys(data[0]).map(k => (
                        <th key={k} className={k === pkField ? 'pk-column' : ''}>
                          {k} {k === pkField && <span style={{ fontSize: '8px', opacity: 0.6 }}>(PK)</span>}
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isAddingRow && (
                      <tr className="db-row-adding">
                        {tableSchema.map(col => {
                          const isPk = col.pk === 1;
                          const colType = (col.type || "").toUpperCase();
                          const isAutoPk = isPk && (colType.includes('INT') || col.type === "" || !col.type); 
                          const isRequired = col.notnull === 1 && !isPk;
                          const hasError = validationErrors[col.name];

                          return (
                            <td key={col.name} className={hasError ? 'validation-error' : ''}>
                              {isAutoPk ? (
                                <div className="db-pk-placeholder" title="Primary Key - Auto-Generated">
                                  {newRowData[col.name] || "AUTO"}
                                </div>
                              ) : (
                                <input 
                                  className={`db-input ${hasError ? 'error' : ''}`}
                                  type={getInputType(col.type || "TEXT")}
                                  placeholder={isPk ? `PK: ${col.name}` : (isRequired ? `* ${col.name}` : col.name)}
                                  value={newRowData[col.name] || ""}
                                  onChange={(e) => {
                                    const val = (col.type || "").toUpperCase().includes('INT') ? parseInt(e.target.value) : e.target.value;
                                    setNewRowData({ ...newRowData, [col.name]: val });
                                    if (hasError) setValidationErrors({ ...validationErrors, [col.name]: null });
                                  }}
                                />
                              )}
                            </td>
                          );
                        })}
                        <td className="db-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="commit-glow-btn" onClick={handleInsert} style={{ height: '24px', fontSize: '8px', padding: '0 10px' }}>SAVE</button>
                          <button className="tool-btn" onClick={() => { setIsAddingRow(false); setValidationErrors({}); }} style={{ height: '24px', fontSize: '8px', padding: '0 10px' }}>CANCEL</button>
                        </td>
                      </tr>
                    )}
                    {filteredData.map((row, i) => {
                      const idValue = row[pkField];
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
                                    if (e.key === 'Enter') handleUpdate(i, key, editingCell.value, pkField, idValue);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                />
                              ) : (
                                <span>{String(val)}</span>
                              )}
                            </td>
                          ))}
                          <td className="db-actions" style={{ justifyContent: 'flex-end' }}>
                            {isEdited ? (
                              <button 
                                className="commit-glow-btn" 
                                style={{ height: '24px', fontSize: '8px', padding: '0 10px' }}
                                onClick={() => handleUpdate(i, editingCell.field, editingCell.value, pkField, idValue)}
                              >
                                COMMIT
                              </button>
                            ) : (
                              <button className="tool-btn del-btn" onClick={() => handleDelete(pkField, idValue)}>
                                <SolarisIcon icon="trash" size={10} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {error && <div className="sticker-label" style={{ marginTop: '10px', background: 'var(--error)', color: 'var(--solaris-gold)' }}>{error}</div>}
          </main>
        </div>
      </div>

      {showTruncateConfirm && (
        <div className="db-modal-overlay">
          <div className="db-modal glass-panel danger-border">
            <h3 className="terminal-section-title" style={{ color: 'var(--error)' }}>⚠️ CRITICAL_ACTION_REQUIRED</h3>
            <p style={{ fontSize: '12px', marginBottom: '15px', color: 'var(--text-primary)' }}>
              You are about to permanently delete ALL records from <strong>{selectedTable}</strong>.
              This action is irreversible and may cause system instability.
            </p>
            <p style={{ fontSize: '10px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
              Type <strong>{selectedTable}</strong> below to confirm truncation:
            </p>
            <input 
              type="text" 
              className="db-input" 
              style={{ marginBottom: '20px', borderColor: confirmTableName === selectedTable ? 'var(--success)' : 'var(--error)' }}
              value={confirmTableName}
              onChange={(e) => setConfirmTableName(e.target.value)}
              placeholder="VERIFY_TABLE_NAME..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="tool-btn" onClick={() => { setShowTruncateConfirm(false); setConfirmTableName(""); }}>CANCEL</button>
              <button 
                className="commit-glow-btn" 
                style={{ background: 'var(--error)', color: 'white !important', opacity: confirmTableName === selectedTable ? 1 : 0.5 }}
                disabled={confirmTableName !== selectedTable}
                onClick={handleDeleteAll}
              >
                EXECUTE_TRUNCATE
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .db-manager-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--solaris-glass);
          backdrop-filter: blur(20px);
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
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: var(--radius-lg);
        }
        .db-layout {
          display: grid;
          grid-template-columns: 240px 1fr;
          flex: 1;
          overflow: hidden;
        }
        .db-sidebar {
          border-right: 1px solid var(--border);
          padding: 20px;
          background: var(--solaris-gold-low);
        }
        .db-sidebar ul {
          list-style: none;
          padding: 0;
        }
        .db-sidebar li {
          padding: 10px 16px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary); 
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          margin-bottom: 4px;
        }
        .db-sidebar li:hover {
          color: var(--solaris-accent);
          background: var(--solaris-gold-low);
        }
        .db-sidebar li.active {
          color: var(--solaris-void);
          background: var(--solaris-accent);
          font-weight: 700;
        }
        .db-sidebar li.active :global(.solaris-glyph) {
          stroke: var(--solaris-void);
        }
        .db-content {
          padding: 30px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-main);
        }
        .db-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 25px;
        }
        .db-table-wrapper {
          overflow: auto;
          flex: 1;
          border: 1px solid var(--border);
          background: var(--bg-panel);
        }
        .db-table {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--font-mono);
          font-size: 0.7rem;
        }
        .db-table th {
          background: var(--bg-surface);
          text-align: left;
          padding: 12px 15px;
          color: var(--solaris-accent);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          text-transform: uppercase;
          letter-spacing: 1px;
          z-index: 10;
        }
        .db-table td {
          padding: 12px 15px;
          border-bottom: 1px solid var(--border-dim);
          color: var(--text-primary);
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .db-table tr:hover td {
          background: var(--solaris-gold-low);
        }
        .db-input {
          background: var(--bg-surface);
          border: 1px solid var(--solaris-accent);
          color: var(--text-primary);
          padding: 6px;
          width: 100%;
          font-family: inherit;
        }
        .db-search-input {
          width: 100%;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          color: var(--text-primary);
          padding: 6px 12px 6px 30px;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          border-radius: var(--radius-sm);
          outline: none;
          transition: all 0.3s;
        }
        .db-search-input:focus {
          border-color: var(--solaris-accent);
          box-shadow: 0 0 10px var(--solaris-glow);
        }
        .db-search-input::placeholder {
          color: var(--text-muted);
          opacity: 0.5;
        }
        .pk-column {
          color: var(--solaris-accent) !important;
          border-bottom: 2px solid var(--solaris-accent) !important;
          font-weight: bold;
        }
        .del-btn {
          padding: 6px;
          background: rgba(230, 57, 70, 0.1);
          border: 1px solid rgba(230, 57, 70, 0.2);
          color: var(--error);
          transition: all 0.2s;
        }
        .del-btn:hover {
          background: var(--error);
          color: var(--solaris-void);
        }
        .truncate-btn {
          height: 32px; 
          font-size: 9px; 
          padding: 0 15px; 
          color: var(--error) !important; 
          border-color: var(--error);
          background: transparent;
        }
        .truncate-btn:hover {
          background: var(--error);
          color: var(--solaris-void) !important;
        }
        .db-row-editing td {
          background: var(--solaris-glow);
          color: var(--text-primary);
        }
        .db-row-adding td {
          background: rgba(var(--solaris-accent-rgb), 0.05) !important;
          border-bottom: 2px solid var(--solaris-accent);
        }
        .db-pk-placeholder {
          font-size: 9px;
          color: var(--text-muted);
          text-align: center;
          padding: 6px;
          background: rgba(0,0,0,0.2);
          border-radius: 4px;
          font-style: italic;
        }
        .validation-error {
          position: relative;
        }
        .db-input.error {
          border-color: var(--error);
          box-shadow: 0 0 5px rgba(230, 57, 70, 0.3);
        }
        .validation-error::after {
          content: 'REQUIRED';
          position: absolute;
          top: 0;
          right: 15px;
          font-size: 7px;
          color: var(--error);
          font-weight: bold;
          letter-spacing: 1px;
        }
        @keyframes modalSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        /* --- LIGHT MODE HARDENING --- */
        :global(body.light-mode) .db-content {
          background: #F7F1E8 !important; /* Force bone background */
        }
        :global(body.light-mode) .db-table th {
          background: #EAE4DB !important;
          color: #0D0C0D !important; /* Force dark text in headers */
        }
        :global(body.light-mode) .db-table td {
          color: #1A1A1A !important; /* Force dark text in cells */
        }
        :global(body.light-mode) .db-sidebar {
          background: #EAE4DB !important;
        }
        :global(body.light-mode) .terminal-section-title {
          color: #0D0C0D !important;
        }
        :global(body.light-mode) .hud-value {
          color: #333333 !important;
        }
        :global(body.light-mode) .db-input,
        :global(body.light-mode) .db-search-input {
          background: #FFFFFF !important;
          color: #0D0C0D !important;
          border-color: #CCCCCC !important;
        }
        :global(body.light-mode) .db-sidebar li {
          color: #333333 !important;
        }
        :global(body.light-mode) .db-sidebar li:hover {
          background: rgba(0,0,0,0.05) !important;
          color: #0D0C0D !important;
        }
        :global(body.light-mode) .db-sidebar li.active {
          background: #C5A572 !important;
          color: #FFFFFF !important;
        }
        :global(body.light-mode) .db-table tr:hover td {
          background: rgba(0,0,0,0.03) !important;
        }
        :global(body.light-mode) .db-modal {
          background: #FFFFFF !important;
          color: #0D0C0D !important;
        }
      ` }} />
    </div>
  );
};

export default NeuralDatabaseManager;
