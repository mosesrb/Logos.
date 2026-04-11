import React from 'react';

const IcarusToolBelt = ({ handleManualTool }) => {
  return (
    <div className="terminal-section">
      <div className="terminal-section-title">ICARUS_TOOL_BELT</div>
      <form onSubmit={handleManualTool} className="tool-input-form">
        <input 
          name="toolText" 
          placeholder="list_dir {'dirPath': '.'}" 
          className="tool-input" 
          autoComplete="off"
        />
        <button type="submit" className="tool-btn">EXEC</button>
      </form>
    </div>
  );
};

export default IcarusToolBelt;
