-- backend/database/schema.sql

-- 1. Sessions Table (replaces sessions.json keys)
CREATE TABLE IF NOT EXISTS Sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    summary TEXT,
    metadata TEXT -- JSON string for extra fields like usage metrics
);

-- 2. Messages Table (replaces the 'messages' array inside sessions files)
-- We store the raw JSON content of the message for structure (tool calls, images, text)
CREATE TABLE IF NOT EXISTS Messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'user', 'assistant', 'system', 'tool'
    content TEXT, -- The actual text or JSON payload
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES Sessions(id) ON DELETE CASCADE
);

-- 3. Personas Table (replaces personas.json)
CREATE TABLE IF NOT EXISTS Personas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT -- JSON string for advanced configs mapped from old system
);

-- 4. Global Episodic Memory (CHRONOS) (replaces global_episodic_memory.json)
CREATE TABLE IF NOT EXISTS GlobalMemory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role TEXT,
    text TEXT NOT NULL,
    vector_json TEXT, -- JSON array of floats (embeddings)
    mood_valence REAL DEFAULT 0,
    mood_arousal REAL DEFAULT 0,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Relationships (replaces relationships.json)
CREATE TABLE IF NOT EXISTS Relationships (
    persona_id TEXT PRIMARY KEY,
    trust_level INTEGER DEFAULT 50,
    notes TEXT,
    last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (persona_id) REFERENCES Personas(id) ON DELETE CASCADE
);

-- Indexing for fast search
CREATE INDEX IF NOT EXISTS idx_messages_session ON Messages(session_id);

-- 6. Visual Memory (replaces global_index.json and persona folders)
CREATE TABLE IF NOT EXISTS VisualMemory (
    image_id TEXT PRIMARY KEY,
    persona_id TEXT NOT NULL,
    file_name TEXT,
    url TEXT,
    embedding_json TEXT, -- JSON array of floats
    metadata_json TEXT, -- JSON object for captions, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (persona_id) REFERENCES Personas(id) ON DELETE CASCADE
);
