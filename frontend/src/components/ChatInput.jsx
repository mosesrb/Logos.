import React, { useRef, useState } from 'react';

const ChatInput = ({
  input,
  setInput,
  isStreaming = false,
  isListening = false,
  startListening,
  sendMessage,
  handleStopGeneration,
  visionBuffer = [],
  setVisionBuffer
}) => {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  // File Ingestion Logic
  const handleFileIngestion = (files) => {
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setVisionBuffer(prev => [...prev, e.target.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileIngestion(e.dataTransfer.files);
  };

  const handleRemoveVision = (idx) => {
    setVisionBuffer(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="chat-input-wrapper">
      {/* ── Vision Previews ── */}
      {visionBuffer.length > 0 && (
        <div className="vision-preview-container">
          {visionBuffer.map((img, idx) => (
            <div key={idx} className="vision-item">
              <img src={img} alt="preview" />
              <button 
                className="vision-item-remove" 
                onClick={() => handleRemoveVision(idx)}
                title="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-input-toolbar" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
        <button 
          className={`vocal-btn-alt ${isListening ? "active" : ""}`} 
          onClick={startListening} 
          title="Toggle Voice Mode"
          style={{ width: '40px', height: '40px', background: 'none', border: 'none' }}
        >
          {isListening ? "🛑" : "🎙️"}
        </button>
        
        <button 
          className="upload-trigger"
          onClick={() => fileInputRef.current?.click()}
          title="Attach Image (JPG/PNG)"
          style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}
        >
          📎
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          multiple 
          accept="image/jpeg,image/png"
          onChange={(e) => handleFileIngestion(e.target.files)}
        />
      </div>

      <div className="chat-input h-glow">
        <textarea
          className={`chat-input-textarea ${isDragging ? 'drag-active' : ''}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isStreaming ? "Waiting for response..." : "Type your message... (Shift+Enter for newline)"}
          disabled={isStreaming}
          rows={1}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (isStreaming || (!input.trim() && visionBuffer.length === 0)) return;
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        {isStreaming ? (
          <button 
            onClick={handleStopGeneration} 
            className="stop-btn" 
            style={{ background: 'var(--red)', color: '#fff', border: '1px solid #f00' }}
            title="Force stop generation"
          >
            STOP
          </button>
        ) : (
          <button 
            onClick={() => sendMessage()} 
            disabled={isStreaming || (!input.trim() && visionBuffer.length === 0)}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatInput;
