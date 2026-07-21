import React, { useState, useEffect, useRef } from 'react';
import SolarisIcon from './SolarisIcon';

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
            <div className="terminal-hub-integrated glass-panel" style={{
                display: 'flex',
                flexDirection: 'column',
                height: '500px',
                backgroundColor: 'var(--solaris-void)',
                borderBottom: '1px solid var(--solaris-gold-low)',
                overflow: 'hidden'
            }}>
                {/* Header (Simplified) */}
                <div className="terminal-header-integrated" style={{
                    padding: '8px 12px',
                    fontSize: '9px',
                    fontWeight: '900',
                    borderBottom: '1px solid var(--solaris-gold-low)',
                    color: 'var(--solaris-gold)',
                    opacity: 0.6,
                    fontFamily: 'Orbitron, sans-serif'
                }}>
                    AGENT_LOG_STREAM // LIVE
                </div>

                {/* Log View */}
                <div className="terminal-body" style={{ flex: 1, padding: '10px', overflowY: 'auto', fontSize: '10px' }}>
                    {logs.map(log => (
                        <div key={log.id} className="terminal-log-item" style={{ marginBottom: '8px', fontFamily: 'JetBrains Mono, monospace' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <span style={{ color: 'var(--solaris-gold)', opacity: 0.4, fontSize: '9px' }}>{log.time}</span>
                                <div style={{ flex: 1 }}>
                                    {(log.type === 'agent-status' || log.type === 'model') && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--solaris-gold)' }}>
                                            <SolarisIcon icon="neural" size={10} />
                                            <span>{log.text}</span>
                                        </div>
                                    )}
                                    {log.type === 'agent-tool-start' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--solaris-gold)' }}>
                                            <SolarisIcon icon="tool" size={10} />
                                            <span style={{ fontWeight: 'bold' }}>{log.tool}</span>
                                        </div>
                                    )}
                                    {(log.type === 'agent-error' || log.type === 'err') && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff4444' }}>
                                            <SolarisIcon icon="alert" size={10} />
                                            <span>[ERR] {log.text}</span>
                                        </div>
                                    )}
                                    {(log.type === 'system' || log.type === 'sys') && <span style={{ color: 'var(--solaris-gold)', opacity: 0.8 }}>{log.text}</span>}
                                    {log.type === 'thought' && (
                                        <div style={{ color: 'var(--solaris-gold)', fontStyle: 'italic', opacity: 0.6, borderLeft: '1px solid var(--solaris-gold-low)', paddingLeft: '8px' }}>
                                            [THOUGHT] {log.text}
                                        </div>
                                    )}
                                    {log.type === 'model-chunk' && (
                                        <div style={{ color: 'var(--solaris-gold)', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <SolarisIcon icon="play" size={8} />
                                            <span>Processing: {log.tokenCount || 0} chars...</span>
                                        </div>
                                    )}
                                    {!['agent-status', 'model', 'agent-tool-start', 'agent-error', 'err', 'system', 'sys', 'thought', 'model-chunk'].includes(log.type) && 
                                        <span style={{ color: 'var(--solaris-gold)', opacity: 0.7 }}>[{log.type?.toUpperCase()}] {log.text}</span>
                                    }
                                </div>
                            </div>
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
        <div className={`terminal-hub-floating glass-panel ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''}`} style={{
            position: 'fixed',
            bottom: isDragging || pos.y !== 0 ? 'auto' : `${defaultBottom}px`,
            right: isDragging || pos.x !== 0 ? 'auto' : `${defaultRight}px`,
            left: isDragging || pos.x !== 0 ? `${pos.x}px` : 'auto',
            top: isDragging || pos.y !== 0 ? `${pos.y}px` : 'auto',
            width: isMinimized ? '200px' : '450px',
            height: isMinimized ? '40px' : '350px',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: isDragging ? 0.8 : 1.0,
            border: isDragging ? '1px solid var(--solaris-gold)' : undefined,
            boxShadow: isDragging ? '0 0 20px var(--solaris-gold-low)' : undefined
        }}>
            {/* Header */}
            <div className="terminal-header" 
                onMouseDown={onMouseDown}
                style={{
                    background: isDragging ? 'var(--solaris-gold)' : 'var(--solaris-gold-low)',
                    color: isDragging ? 'var(--solaris-void)' : 'var(--solaris-gold)',
                    padding: '6px 12px',
                    fontSize: '10px',
                    fontWeight: '900',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    letterSpacing: '1px',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    borderBottom: '1px solid var(--solaris-gold-low)'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
                    <div className="pulsing-dot" style={{ width: '6px', height: '6px', backgroundColor: 'var(--solaris-gold)', borderRadius: '50%', boxShadow: '0 0 5px var(--solaris-gold)' }}></div>
                    <span style={{ fontFamily: 'Orbitron, sans-serif' }}>AGENT_LOG_STREAM // {isMinimized ? 'MIN' : 'LIVE'}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                    >
                        <SolarisIcon icon={isMinimized ? "maximize" : "minimize"} size={12} />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); toggleVisibility(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                    >
                        <SolarisIcon icon="close" size={12} />
                    </button>
                </div>
            </div>

            {/* Log View Container */}
            {!isMinimized && (
                <div className="terminal-body" style={{ flex: 1, padding: '10px', overflowY: 'auto', background: 'var(--solaris-void)' }}>
                    {logs.map(log => (
                        <div key={log.id} className="terminal-log-item" style={{ marginBottom: '10px', fontFamily: 'JetBrains Mono, monospace' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <span className="log-ts" style={{ color: 'var(--solaris-gold)', opacity: 0.4, fontSize: '9px', paddingTop: '2px' }}>{log.time}</span>
                                
                                <div style={{ flex: 1 }}>
                                    {log.type === 'agent-status' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--solaris-gold)' }}>
                                            <SolarisIcon icon="neural" size={10} />
                                            <span style={{ fontSize: '10px', fontWeight: '600' }}>{log.text}</span>
                                        </div>
                                    )}

                                    {log.type === 'agent-tool-start' && (
                                        <div style={{ borderLeft: '2px solid var(--solaris-gold)', paddingLeft: '8px', marginBottom: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--solaris-gold)' }}>
                                                <SolarisIcon icon="tool" size={10} />
                                                <span style={{ fontSize: '10px', fontWeight: 'bold' }}>RUNNING_TOOL: {log.tool}</span>
                                            </div>
                                            <div style={{ color: 'var(--solaris-gold)', opacity: 0.6, fontSize: '10px', marginTop: '2px' }}>{log.text}</div>
                                        </div>
                                    )}

                                    {log.type === 'agent-tool-result' && (
                                        <div style={{ 
                                            color: 'var(--solaris-gold)', 
                                            padding: '6px 10px', 
                                            whiteSpace: 'pre-wrap', 
                                            wordBreak: 'break-word', 
                                            borderLeft: '2px solid var(--solaris-gold-low)', 
                                            margin: '4px 0 4px 12px',
                                            backgroundColor: 'var(--solaris-gold-low)',
                                            fontSize: '10px',
                                            borderRadius: '2px'
                                        }}>
                                            {log.text}
                                        </div>
                                    )}

                                    {log.type === 'agent-error' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff4444' }}>
                                            <SolarisIcon icon="alert" size={10} />
                                            <span style={{ fontSize: '10px', fontWeight: 'bold' }}>[SYSTEM_ERR] {log.text}</span>
                                        </div>
                                    )}

                                    {log.type === 'system' && (
                                        <span style={{ color: 'var(--solaris-gold)', opacity: 0.8, fontSize: '10px' }}>{log.text}</span>
                                    )}
                                    
                                    {log.type === 'thought' && (
                                        <div style={{ display: 'flex', gap: '8px', borderLeft: '1px solid var(--solaris-gold-low)', paddingLeft: '8px' }}>
                                            <span style={{ color: 'var(--solaris-gold)', fontStyle: 'italic', opacity: 0.5, fontSize: '9px' }}>
                                                [THOUGHT_STREAM] {log.text}
                                            </span>
                                        </div>
                                    )}
                                    {log.type === 'model-chunk' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--solaris-gold)', opacity: 0.9 }}>
                                             <SolarisIcon icon="play" size={8} />
                                             <span style={{ fontSize: '10px' }}>MODEL_STREAM // Processing: {log.tokenCount || 0} characters...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
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
