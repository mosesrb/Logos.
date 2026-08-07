CREATE INDEX IF NOT EXISTS idx_messages_session_id_timestamp ON Messages(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON Sessions(updated_at);
