import React, { useState, useEffect } from 'react';

const ModelManager = ({ onClose, API_BASE }) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pullingModel, setPullingModel] = useState('');
  const [pullProgress, setPullProgress] = useState(null);
  const [error, setError] = useState(null);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/ollama/models`);
      const data = await res.json();
      setModels(data);
    } catch (e) {
      setError("Failed to fetch models from Ollama.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handlePull = async (e) => {
    e.preventDefault();
    if (!pullingModel) return;

    setError(null);
    setPullProgress({ status: 'Initiating download...' });

    try {
      const response = await fetch(`${API_BASE}/api/ollama/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pullingModel }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const status = JSON.parse(dataStr);
              setPullProgress(status);
            } catch (e) {}
          }
        }
      }
      setPullingModel('');
      setPullProgress(null);
      fetchModels();
    } catch (e) {
      setError("Failed to pull model: " + e.message);
      setPullProgress(null);
    }
  };

  const handleDelete = async (name) => {
    if (!window.confirm(`Are you sure you want to delete model ${name}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/ollama/models/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (res.ok) fetchModels();
      else throw new Error("Delete failed");
    } catch (e) {
      setError("Failed to delete model: " + e.message);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + ' GB';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content forge-modal" style={{ maxWidth: '800px' }}>
        <div className="hardware-header">
          <span>OLLAMA_MODEL_MANAGER</span>
          <span className="hardware-id">v1.0.4</span>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>

        <div className="forge-form" style={{ padding: '20px' }}>
          <form onSubmit={handlePull} className="form-group" style={{ marginBottom: '30px' }}>
            <label>PULL_NEW_MODEL (Ollama Library)</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="e.g. llama3, deepseek-coder, qwen2"
                value={pullingModel}
                onChange={(e) => setPullingModel(e.target.value)}
                disabled={!!pullProgress}
              />
              <button type="submit" className="commit-glow-btn" style={{ whiteSpace: 'nowrap' }} disabled={!!pullProgress}>
                DOWNLOAD
              </button>
            </div>
            {pullProgress && (
              <div className="pull-status-box" style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,255,255,0.1)', border: '1px solid var(--cyan)' }}>
                <div className="scanning-line">{pullProgress.status}</div>
                {pullProgress.completed && pullProgress.total && (
                  <div className="progress-bar-container" style={{ height: '4px', background: 'rgba(255,255,255,0.1)', marginTop: '8px' }}>
                    <div className="progress-bar-fill" style={{
                      height: '100%',
                      background: 'var(--cyan)',
                      width: `${(pullProgress.completed / pullProgress.total) * 100}%`,
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                )}
              </div>
            )}
          </form>

          <div className="form-group">
            <label>INSTALLED_MODELS</label>
            {loading ? (
              <div className="scanning-line">FETCHING_REGISTRY...</div>
            ) : (
              <div className="model-grid-manager" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="db-table">
                  <thead>
                    <tr>
                      <th>NAME</th>
                      <th>SIZE</th>
                      <th>MODIFIED</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.name}>
                        <td style={{ color: 'var(--cyan)' }}>{m.name}</td>
                        <td>{formatSize(m.size)}</td>
                        <td>{new Date(m.modified_at).toLocaleDateString()}</td>
                        <td>
                          <button className="tool-btn del-btn" onClick={() => handleDelete(m.name)}>DELETE</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {error && <div className="sticker-label sticker-warning" style={{ marginTop: '20px' }}>{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default ModelManager;
