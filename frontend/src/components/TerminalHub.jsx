import React, { useState, useEffect, useRef } from 'react';

const TerminalHub = ({ isVisible, toggleVisibility, diagnosticsWidth = 300, isIntegrated = false }) => {
    const [logs, setLogs] = useState([
        { id: 1, type: "system", text: "LÓGOS SYNAPSE BRIDGE // AGENT LINK ESTABLISHED." }
    ]);
    const [isMinimized, setIsMinimized] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [rel, setRel] = useState(null); // Relative mouse position within header
    const bottomRef = useRef(null);

    useEffect(() => {
        const handleLogEvent = (event) => {
            const detail = event.detail;
            
            let textRep = detail.content || detail.msg;
            if (detail.type === 'agent-tool-result' && detail.result) {
                textRep = detail.result.stdout || detail.result.content || detail.result.error || JSON.stringify(detail.result);
                if (textRep && textRep.length > 500) textRep = textRep.substring(0, 500) + '... [TRUNCATED]';
            }
            if (detail.type === 'agent-tool-start' && detail.args) {
                textRep = JSON.stringify(detail.args);
            }

            const newLog = {
                id: Date.now() + Math.random(),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                type: detail.type,
                tool: detail.tool,
                text: textRep
            };

            if (detail.type === 'model-chunk') {
                setLogs(prev => {
                    const lastLog = prev[prev.length - 1];
                    if (lastLog && lastLog.type === 'model-chunk') {
                        // Increment token count (using character length as proxy or 1 per chunk)
                        const delta = detail.content ? detail.content.length : 1;
                        const updated = { ...lastLog, tokenCount: (lastLog.tokenCount || 0) + delta };
                        return [...prev.slice(0, -1), updated];
                    }
                    const initialLog = { 
                        ...newLog, 
                        type: 'model-chunk',
                        tokenCount: detail.content ? detail.content.length : 1,
                        text: "" // Clear text to fulfill user request of not printing entire answer
                    };
                    return [...prev.slice(-49), initialLog];
                });
                return;
            }

            if (detail.type === 'thought') {
                setLogs(prev => {
                    const lastLog = prev[prev.length - 1];
                    if (lastLog && lastLog.type === 'thought') {
                        const updated = { ...lastLog, text: lastLog.text + (detail.content || '') };
                        return [...prev.slice(0, -1), updated];
                    }
                    return [...prev.slice(-49), newLog];
                });
                return;
            }

            setLogs(prev => [...prev.slice(-49), newLog]);
        };

        window.addEventListener("nexus-agent-stream", handleLogEvent);
        return () => window.removeEventListener("nexus-agent-stream", handleLogEvent);
    }, []);

    useEffect(() => {
        if (isVisible && !isMinimized) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, isVisible, isMinimized]);

    // Phase 25: Draggable Logic
    useEffect(() => {
        const onMouseMove = (e) => {
            if (!isDragging) return;
            setPos({
                x: e.pageX - rel.x,
                y: e.pageY - rel.y
            });
            e.stopPropagation();
            e.preventDefault();
        };
        const onMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging, rel]);

    const onMouseDown = (e) => {
        // Only drag from header, middle mouse/left mouse
        if (e.button !== 0) return;
        setIsDragging(true);
        const handle = e.currentTarget.getBoundingClientRect();
        setRel({
            x: e.pageX - handle.left,
            y: e.pageY - handle.top
        });
        e.stopPropagation();
        e.preventDefault();
    };

    if (!isVisible) return null;

    // Integrated mode: standard block, no fixed positioning (Phase 25 Restoration)
    if (isIntegrated) {
        return (
            <div className="terminal-hub-integrated" style={{
                display: 'flex',
                flexDirection: 'column',
                height: '500px', // Fixed height when inside sidebar
                backgroundColor: 'rgba(0,0,0,0.2)',
                borderBottom: '1px solid var(--border)',
                overflow: 'hidden'
            }}>
                {/* Header (Simplified) */}
                <div className="terminal-header-integrated" style={{
                    padding: '8px 12px',
                    fontSize: '9px',
                    fontWeight: '900',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-main)',
                    opacity: 0.6
                }}>
                    AGENT_LOG_STREAM // LIVE
                </div>

                {/* Log View */}
                <div className="terminal-body" style={{ flex: 1, padding: '10px', overflowY: 'auto', fontSize: '10px' }}>
                    {logs.map(log => (
                        <div key={log.id} className="terminal-log-item" style={{ marginBottom: '6px' }}>
                            <span style={{ color: 'var(--text-dim)', marginRight: '6px' }}>{log.time}</span>
                            {/* Priority Categories */}
                            {(log.type === 'agent-status' || log.type === 'model') && <span style={{ color: 'var(--cyan)' }}>⚡ {log.text}</span>}
                            {log.type === 'agent-tool-start' && <span style={{ color: 'var(--orange)' }}>🛠️ {log.tool}</span>}
                            {(log.type === 'agent-error' || log.type === 'err') && <span style={{ color: 'var(--red)' }}>[ERR] {log.text}</span>}
                            {(log.type === 'system' || log.type === 'sys') && <span style={{ color: 'var(--cyan)', opacity: 0.8 }}>{log.text}</span>}
                            {log.type === 'thought' && (
                                <span style={{ color: 'var(--cyan)', fontStyle: 'italic', opacity: 0.8, borderLeft: '1px solid rgba(0, 255, 255, 0.2)', paddingLeft: '8px' }}>[THOUGHT_STREAM] {log.text}</span>
                            )}
                            {log.type === 'model-chunk' && (
                                <span style={{ color: 'var(--cyan)', opacity: 1.0, fontWeight: '500' }}>▶ MODEL_STREAM // Processing: {log.tokenCount || 0} characters...</span>
                            )}
                            {/* Fallback for other log types */}
                            {!['agent-status', 'model', 'agent-tool-start', 'agent-error', 'err', 'system', 'sys', 'thought', 'model-chunk'].includes(log.type) && 
                                <span style={{ color: 'var(--text-main)', opacity: 0.7 }}>[{log.type?.toUpperCase()}] {log.text}</span>
                            }
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            </div>
        );
    }

    // Default right-aligned position (Floating mode)
    const defaultRight = 20; 
    const defaultBottom = 20;

    return (
        <div className={`terminal-hub-floating ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''}`} style={{
            position: 'fixed',
            bottom: isDragging || pos.y !== 0 ? 'auto' : `${defaultBottom}px`,
            right: isDragging || pos.x !== 0 ? 'auto' : `${defaultRight}px`,
            left: isDragging || pos.x !== 0 ? `${pos.x}px` : 'auto',
            top: isDragging || pos.y !== 0 ? `${pos.y}px` : 'auto',
            width: isMinimized ? '200px' : '450px',
            height: isMinimized ? '40px' : '350px',
            backgroundColor: 'var(--bg-deep)',
            border: `1px solid ${isDragging ? 'var(--cyan)' : 'var(--border)'}`,
            borderRadius: '4px',
            boxShadow: isDragging ? '0 20px 60px rgba(0,0,0,0.9), 0 0 20px var(--cyan)' : '0 10px 40px rgba(0,0,0,0.8), 0 0 10px var(--border)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backdropFilter: 'blur(10px)',
            transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: isDragging ? 0.8 : 0.95
        }}>
            {/* Header */}
            <div className="terminal-header" 
                onMouseDown={onMouseDown}
                style={{
                    background: isDragging ? 'var(--cyan)' : 'var(--border)',
                    color: 'var(--bg-deep)',
                    padding: '6px 12px',
                    fontSize: '10px',
                    fontWeight: '900',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    letterSpacing: '1px',
                    cursor: isDragging ? 'grabbing' : 'grab'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
                    <span className="pulsing-dot" style={{ width: '6px', height: '6px', backgroundColor: '#f55', borderRadius: '50%' }}></span>
                    <span>AGENT_LOG_STREAM // {isMinimized ? 'MIN' : 'LIVE'}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'var(--bg-deep)' }}
                    >{isMinimized ? '□' : '—'}</button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); toggleVisibility(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--bg-deep)' }}
                    >✕</button>
                </div>
            </div>

            {/* Log View Container */}
            {!isMinimized && (
                <div className="terminal-body" style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
                    {logs.map(log => (
                        <div key={log.id} className="terminal-log-item" style={{ marginBottom: '8px' }}>
                            <span className="log-ts" style={{ color: 'var(--text-dim)', fontSize: '9px', marginRight: '8px' }}>{log.time}</span>
                            
                            {log.type === 'agent-status' && (
                                <span style={{ color: 'var(--cyan)' }}>⚡ {log.text}</span>
                            )}

                            {log.type === 'agent-tool-start' && (
                                <div style={{ borderLeft: '2px solid var(--orange)', paddingLeft: '8px' }}>
                                    <span style={{ color: 'var(--orange)', fontWeight: 'bold' }}>RUNNING_TOOL: {log.tool}</span>
                                    <div style={{ color: 'var(--text-main)', opacity: 0.7, fontSize: '10px' }}>{log.text}</div>
                                </div>
                            )}

                            {log.type === 'agent-tool-result' && (
                                <div style={{ 
                                    color: 'var(--text-main)', 
                                    padding: '4px 8px', 
                                    whiteSpace: 'pre-wrap', 
                                    wordBreak: 'break-word', 
                                    borderLeft: '2px solid var(--purple)', 
                                    margin: '4px 0 4px 12px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    fontSize: '10px'
                                }}>
                                    {log.text}
                                </div>
                            )}

                            {log.type === 'agent-error' && (
                                <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>[ERR] {log.text}</span>
                            )}

                            {log.type === 'system' && (
                                <span style={{ color: 'var(--cyan)', opacity: 0.8 }}>{log.text}</span>
                            )}
                            
                            {log.type === 'thought' && (
                                <span style={{ color: 'var(--cyan)', fontStyle: 'italic', opacity: 0.8, fontSize: '9px', display: 'block', borderLeft: '1px solid rgba(0, 255, 255, 0.3)', paddingLeft: '8px' }}>
                                    [THOUGHT_STREAM] {log.text}
                                </span>
                            )}
                            {log.type === 'model-chunk' && (
                                <span style={{ color: 'var(--cyan)', fontSize: '10px', display: 'block', paddingLeft: '8px', borderLeft: '1px solid var(--cyan)' }}>
                                     ▶ MODEL_STREAM // Processing: {log.tokenCount || 0} characters...
                                </span>
                            )}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            )}
            
            <style>{`
                .pulsing-dot { animation: pulse 1.5s infinite; }
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
                .terminal-body::-webkit-scrollbar { width: 4px; }
                .terminal-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
            `}</style>
        </div>
    );
};

export default TerminalHub;
