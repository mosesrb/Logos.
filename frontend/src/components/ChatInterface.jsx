import React from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Virtuoso } from 'react-virtuoso';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const autoFormatText = (text) => {
  if (!text) return text;
  return text
    // Fix mushed headings: "word. #### Heading" -> "word.\n\n#### Heading"
    .replace(/([^\n])\s*(#{1,4}\s+[A-Z*])/gi, "$1\n\n$2");
};

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const [copied, setCopied] = React.useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  if (!inline && match) {
    return (
      <div className="code-block-container" style={{ position: 'relative', marginTop: '10px', marginBottom: '10px', borderRadius: '4px', overflow: 'hidden' }}>
        <div className="code-block-header" style={{ display: 'flex', justifyContent: 'space-between', background: '#1e1e1e', padding: '4px 12px', borderBottom: '1px solid #333', fontSize: '0.8rem', color: '#888' }}>
          <span>{lang}</span>
          <button onClick={handleCopy} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={lang}
          PreTag="div"
          customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    );
  }
  return <code className={className} {...props}>{children}</code>;
};
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';

const ChatInterface = ({
  getMessageMeta,
  speakText,
  handleCopyMessage,
  handleRegenerate,
  messagesEndRef,
  API_BASE,
  setExpandedImage
}) => {
  const {

    currentSession,
    messages,
    selectedPersonaId,
    personaMood,
    copiedMsgId,
    isRegenerating,
    isStreaming,
    streamingBlocks,
    pinnedMemories,
    setPinnedMemories,
    visionBuffer,
    setVisionBuffer
  
  } = useStore(useShallow(state => ({
    currentSession: state.currentSession,
    messages: state.messages,
    selectedPersonaId: state.selectedPersonaId,
    personaMood: state.personaMood,
    copiedMsgId: state.copiedMsgId,
    isRegenerating: state.isRegenerating,
    isStreaming: state.isStreaming,
    streamingBlocks: state.streamingBlocks,
    pinnedMemories: state.pinnedMemories,
    setPinnedMemories: state.setPinnedMemories,
    visionBuffer: state.visionBuffer,
    setVisionBuffer: state.setVisionBuffer
  })));
  if (!currentSession) {
    return (
      <div className="welcome-screen">
        <div className="hardware-header">
          <div className="bolt" style={{ top: 4, left: 4 }} />
          <div className="bolt" style={{ top: 4, right: 4 }} />
          <div className="bolt" style={{ bottom: 4, left: 4 }} />
          <div className="bolt" style={{ bottom: 4, right: 4 }} />
          <span>TERMINAL_SIDEBAR_01</span>
          <span className="hardware-id">S/N: 88-XJ-SIDE</span>
        </div>
        <div className="decal-label" style={{ position: 'absolute', top: 10, left: 10 }}>PROPERTY_OF_MAINFRAME_CORP</div>
        <div className="decal-label" style={{ position: 'absolute', top: 10, right: 10 }}>[NOT_FOR_RESALE]</div>
        <div className="welcome-title">Mainframe Corp</div>
        <div className="welcome-line" />
        <div className="welcome-sub">
          HYBRID_NASA-PUNK_INDUSTRIAL_CONSOLE // V2.9.4<br />
          AWAITING_NEURAL_UPLINK...
          <div className="welcome-feature-info">
            <strong>ICARUS_PROTOCOL:</strong> Agentic tool-belt for autonomous file & environment operations.
          </div>
          <div className="welcome-feature-info" >
            [S/N: 442-99-B] REF_CHRONOS_V3
          </div>
        </div>
        <div className="welcome-hint">
          PRESS <span style={{ color: 'var(--orange)', fontWeight: 800 }}>NEW_CHAT</span> TO_INITIALIZE_SESSION
        </div>
      </div>
    );
  }

  return (
    <div className="chat-messages" style={{ padding: 0, overflow: 'hidden' }}>
      <Virtuoso
        style={{ flex: 1, width: '100%', height: '100%' }}
        data={messages}
        initialTopMostItemIndex={messages.length - 1}
        followOutput={(isAtBottom) => isAtBottom ? "auto" : false}
        components={{
          Header: () => (
            <>
              <div className="decal-label" style={{ position: 'absolute', top: 5, left: 10 }}>UNIT_01 // SECURE_COMM_LINK</div>
              <div className="decal-label" style={{ position: 'absolute', top: 5, right: 10 }}>REF: CHRONOS-EXT-02</div>
              <div style={{ height: '40px' }} />
            </>
          ),
          Footer: () => (
            <div style={{ padding: '0 40px 40px 40px' }}>
              {isStreaming && streamingBlocks.map((block, i) => {
                const auraStyle = (block.personaId === selectedPersonaId && personaMood) ? {
                  '--mood-h': Math.max(0, (personaMood.valence + 1) * 60),
                  '--mood-s': personaMood.arousal * 100 + '%',
                  '--mood-l': 40 + (personaMood.arousal * 20) + '%',
                  '--thinking-speed': (1.5 - personaMood.arousal) + 's'
                } : { '--thinking-speed': '1.5s' };

                return (
                  <div key={`stream-${i}`} className={`message ai assistant-msg ${block.personaId === selectedPersonaId && personaMood ? 'mood-aura' : ''}`} style={auraStyle}>
                    <div className="msg-header">
                      <span className="msg-role">{(block.label || "AI").toUpperCase()}//</span>
                      <span className="streaming-dot">●</span>
                    </div>
                    <div className="msg-body thinking" style={{ animationDuration: 'var(--thinking-speed)' }}>
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: CodeBlock,
                          img: ({ node, ...props }) => <img {...props} className="chat-image-modern" />
                        }}
                      >
                        {autoFormatText(block.content)}
                      </ReactMarkdown>
                      <span className="cursor"></span>
                    </div>
                  </div>
                );
              })}

              {messagesEndRef && <div ref={messagesEndRef} />}
            </div>
          )
        }}
        itemContent={(i, m) => {
          const meta = getMessageMeta(m);
          const isCurrentPersona = m.personaId === selectedPersonaId;
          const auraStyle = (isCurrentPersona && personaMood) ? {
            '--mood-h': Math.max(0, (personaMood.valence + 1) * 60),
            '--mood-s': personaMood.arousal * 100 + '%',
            '--mood-l': 40 + (personaMood.arousal * 20) + '%',
            '--mood-v': personaMood.valence,
            '--mood-a': personaMood.arousal
          } : {};

          return (
            <div style={{ padding: '0 40px' }}>
              <div
                className={`message ${meta.css} ${isCurrentPersona && personaMood ? 'mood-aura' : ''}`}
                style={auraStyle}
              >
                <div className="msg-header">
                  <span className="msg-role">{meta.label}</span>
                  <div className="msg-actions">
                    {m.role === "assistant" && (
                      <button className="msg-action-btn" onClick={() => speakText(m.content, m.personaId)}>🔊</button>
                    )}
                    <button
                      className={`msg-action-btn${copiedMsgId === i ? ' copied' : ''}`}
                      onClick={() => handleCopyMessage(m.content, i)}
                      title="Copy message"
                    >
                      {copiedMsgId === i ? '✓' : '📋'}
                    </button>
                    {(m.role === "assistant" || m.role?.startsWith('assistant-')) && (
                      <button
                        className="msg-action-btn regen-btn"
                        onClick={handleRegenerate}
                        disabled={isRegenerating}
                        title="Regenerate response"
                      >
                        {isRegenerating ? '⌛' : '↺'}
                      </button>
                    )}
                    <span className="msg-time">
                      {new Date(m.time || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <div className="msg-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: CodeBlock,
                      img: ({ node, ...props }) => {
                        const src = props.src.startsWith("/") ? `${API_BASE}${props.src}` : props.src;
                        return (
                          <div className="msg-image-container" onClick={() => setExpandedImage(src)}>
                            <img {...props} src={src} className="chat-image-modern" />
                            <div className="image-overlay-hint">CLICK_TO_EXPAND</div>
                          </div>
                        );
                      }
                    }}
                  >
                    {autoFormatText(m.content)}
                  </ReactMarkdown>
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div className="msg-sources">
                    <div className="sources-label">SOURCE_NODES:</div>
                    <div className="sources-list">
                      {m.sources.map((src, idx) => (
                        <div key={idx} className="source-badge" title={src}>
                          {src.split(/[/\\]/).pop()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }}
      />

      {/* Pinned Memories HUD */}
      {pinnedMemories.length > 0 && (
        <div className="pinned-memories-hud">
          <div className="pinned-header">🧠 PINNED_CONTEXT [{pinnedMemories.length}]</div>
          {pinnedMemories.map((m, idx) => (
            <div key={idx} className="pinned-memory-item">
              <span className="pinned-text">{m.substring(0, 40)}...</span>
              <span className="pinned-memory-remove" onClick={() => setPinnedMemories(prev => prev.filter((_, i) => i !== idx))}>×</span>
            </div>
          ))}
        </div>
      )}

      {/* Vision Preview */}
      {visionBuffer.length > 0 && (
        <div className="vision-preview-bar">
          {visionBuffer.map((img, idx) => (
            <div key={idx} className="vision-thumbnail-wrapper">
              <img src={img} alt="Preview" className="vision-thumbnail" />
              <div className="vision-thumbnail-remove" onClick={() => setVisionBuffer(prev => prev.filter((_, i) => i !== idx))}>×</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
