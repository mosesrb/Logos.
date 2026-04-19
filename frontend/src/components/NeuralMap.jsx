import React, { useState, useEffect } from 'react';

const NeuralMap = ({ 
  vectorNodes = [], 
  pinnedMemories = [], 
  personaMood = null, 
  heatmapEnabled = false, 
  selectedNode = null, 
  onNodeSelect,
  editNodeText = "",
  setEditNodeText,
  isSyncingMemory = false,
  handleSyncMemory,
  handlePruneMemory,
  setPinnedMemories
}) => {
  const [mapTransform, setMapTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [mapHasMoved, setMapHasMoved] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMapWheel = (e) => {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const newScale = Math.max(0.1, Math.min(5, mapTransform.k + delta * zoomSpeed));
    setMapTransform(prev => ({ ...prev, k: newScale }));
  };

  const handleMapMouseDown = (e) => {
    if (e.button === 0) { // Left Click
      setIsDraggingMap(true);
      setMapHasMoved(false);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMapMouseMove = (e) => {
    if (isDraggingMap) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setMapHasMoved(true);
      }
      setMapTransform(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMapMouseUp = () => {
    setIsDraggingMap(false);
  };

  return (
    <div className="neural-map-container" onContextMenu={(e) => e.preventDefault()}>
      <div className="neural-map-hud-legend">
        <div className="legend-item"><div className="legend-dot" style={{ backgroundColor: 'hsl(30, 80%, 45%)' }} /> POSITIVE</div>
        <div className="legend-item"><div className="legend-dot" style={{ backgroundColor: 'hsl(180, 70%, 40%)' }} /> NEUTRAL</div>
        <div className="legend-item"><div className="legend-dot" style={{ backgroundColor: 'hsl(195, 80%, 35%)' }} /> NEGATIVE</div>
        <div className="legend-item"><div className="legend-dot" style={{ backgroundColor: 'var(--text-dim)', border: '1px dashed #fff' }} /> PINNED</div>
      </div>
      <svg
        viewBox="0 0 500 500"
        className="neural-map-svg"
        onWheel={handleMapWheel}
        onMouseDown={handleMapMouseDown}
        onMouseMove={handleMapMouseMove}
        onMouseUp={handleMapMouseUp}
        onMouseLeave={handleMapMouseUp}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="heatmap-blur">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>
        <g transform={`translate(${mapTransform.x}, ${mapTransform.y}) scale(${mapTransform.k})`}>
          {heatmapEnabled && (
            <g className="heatmap-layer">
              {vectorNodes.map((n, i) => {
                const nodeV = n.mood?.v ?? 0;
                if (nodeV === 0 && !n.active) return null;
                let hue = 180;
                if (nodeV < 0) hue = 180 + (Math.abs(nodeV) * 20);
                if (nodeV > 0) hue = 180 - (nodeV * 150);
                return (
                  <circle
                    key={`heat-${i}`}
                    cx={n.x} cy={n.y} r="45"
                    fill={`hsl(${hue}, 80%, 60%)`}
                    opacity="0.1"
                    filter="url(#heatmap-blur)"
                  />
                );
              })}
            </g>
          )}
          {/* Neural Links (Edges) */}
          {vectorNodes.filter(n => n.active).map((n, i) => {
            const center = { x: 250, y: 250 };
            return (
              <line
                key={`link-${i}`}
                x1={center.x} y1={center.y}
                x2={n.x} y2={n.y}
                className="neural-link"
              />
            );
          })}

          {vectorNodes.map((n, i) => {
            const nodeV = n.mood?.v ?? 0;
            const nodeA = n.mood?.a ?? 0;
            const currentV = personaMood?.valence ?? 0;
            const currentA = personaMood?.arousal ?? 0;

            const distV = Math.abs(nodeV - currentV);
            const distA = Math.abs(nodeA - currentA);
            const resonance = 1 - (distV + distA) / 4;
            const isResonating = resonance > 0.85 && personaMood;

            let hue = 180;
            if (nodeV < 0) hue = 180 + (Math.abs(nodeV) * 20);
            if (nodeV > 0) hue = 180 - (nodeV * 150);
            if (hue < 30) hue = 30;

            const saturation = 70 + (nodeA * 30);
            const lightness = 40 - (nodeA * 10);
            const nodeFill = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

            return (
              <g
                key={i}
                className={`neural-node ${n.type} ${n.active ? "active-recall" : ""} ${pinnedMemories.includes(n.text) ? "pinned" : ""} ${isResonating ? "resonance-ping" : ""} ${selectedNode?.id === n.id ? "selected" : ""}`}
                onClick={() => {
                  if (!mapHasMoved && onNodeSelect) {
                    onNodeSelect(n);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={n.x} cy={n.y}
                  r={n.active ? "8" : (isResonating ? "7" : (pinnedMemories.includes(n.text) ? "6" : "4"))}
                  fill={nodeFill}
                  filter="url(#glow)"
                  style={{ transition: 'all 0.5s ease', opacity: (n.type === 'local' ? 0.4 : 1) }}
                />
                {n.active && <circle cx={n.x} cy={n.y} r="15" className="recall-ping" />}
                {isResonating && <circle cx={n.x} cy={n.y} r="12" className="resonance-aura" stroke={nodeFill} fill="none" />}

                <text x={n.x + 10} y={n.y + 4} fill={nodeFill} fontSize="6" className="node-label">
                  {n.source}
                  {n.active && ` [RECALL_MATCH]`}
                </text>
                <title>
                  {`[V:${nodeV.toFixed(2)} A:${nodeA.toFixed(2)}] Resonance: ${(resonance * 100).toFixed(0)}%\n\n`}
                  {n.text.substring(0, 200)}...
                </title>
              </g>
            );
          })}

          {/* Cluster Quadrant Labels */}
          <g className="map-labels" opacity="0.3" pointerEvents="none" fontSize="8" fill="var(--text-dim)">
            <text x="400" y="100" textAnchor="middle">EXCITEMENT</text>
            <text x="100" y="100" textAnchor="middle">DISTRESS</text>
            <text x="100" y="400" textAnchor="middle">DEPRESSION</text>
            <text x="400" y="400" textAnchor="middle">RELAXATION</text>
          </g>
        </g>
      </svg>
      
      {/* Monolith Restore: Map Decorations */}
      <div className="neural-map-hint">Visualizing episodic Memory Cluster nodes [DET_PCA_V1]</div>
      <div className="sticker-label sticker-warning" style={{ position: 'absolute', bottom: 10, right: 10 }}>WARN: UNSTABLE_VECTORS</div>

      {/* Monolith Restore: Memory Sync Portal (Phase 25) */}
      {selectedNode && (
        <div className="memory-sync-portal glass-panel">
          <div className="hardware-header" style={{ marginBottom: '8px' }}>
            <span>MEMORY_SYNC_V1 // {selectedNode.id.substring(0, 8).toUpperCase()}</span>
            <button className="close-mini-btn" onClick={() => onNodeSelect(null)}>×</button>
          </div>
          <div className="decal-label" style={{ marginBottom: '10px' }}>SOURCE: {selectedNode.source}</div>

          <textarea
            className="memory-editor"
            value={editNodeText}
            onChange={(e) => setEditNodeText(e.target.value)}
            rows={4}
          />

          <div className="sync-actions">
            <button className="sync-btn" onClick={handleSyncMemory} disabled={isSyncingMemory}>
              {isSyncingMemory ? "SYNCING..." : "💾 SYNC_VECTORS"}
            </button>
            {selectedNode.type === 'global' && (
              <button className="prune-btn" onClick={handlePruneMemory}>🔥 PRUNE_NODE</button>
            )}
            <button
              className={`pin-btn ${pinnedMemories.includes(selectedNode.text) ? 'active' : ''}`}
              onClick={() => setPinnedMemories(prev => prev.includes(selectedNode.text) ? prev.filter(t => t !== selectedNode.text) : [...prev, selectedNode.text])}
            >
              📌 {pinnedMemories.includes(selectedNode.text) ? 'UNPIN' : 'PIN_TO_SHADOW'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NeuralMap;
