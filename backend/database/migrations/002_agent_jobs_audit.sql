-- backend/database/migrations/002_agent_jobs_audit.sql

-- 1. AgentAudit Table
-- Records every tool execution request with identity, tool name, parsed arguments, success/failure status, execution duration, and whether it was user-approved.
CREATE TABLE IF NOT EXISTS AgentAudit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    agent_id TEXT, -- Persona ID or Model Name
    tool_name TEXT NOT NULL,
    arguments_json TEXT, -- JSON representation of the arguments
    capability_approved INTEGER DEFAULT 0, -- 1 if explicitly approved by user/policy
    success INTEGER DEFAULT 0, -- 1 if tool execution was successful
    result_preview TEXT, -- Truncated result or error message
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES Sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_audit_session ON AgentAudit(session_id);

-- 2. Jobs Table
-- Provides the backing store for the durable job queue.
CREATE TABLE IF NOT EXISTS Jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- e.g., 'SANDBOX', 'COMFYUI', 'OCR'
    payload_json TEXT NOT NULL, -- JSON string of task parameters
    status TEXT DEFAULT 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED, CANCELLED
    result_json TEXT, -- JSON output from the job
    error_msg TEXT,
    retries INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON Jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON Jobs(type);
