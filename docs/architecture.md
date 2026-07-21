# LÓGOS AI - Architecture

## Overview
LÓGOS AI is a sovereign, local-first command center for artificial intelligence, bridging disconnected local models (LLMs, Image Gen, TTS) into a unified, agentic system with persistent episodic memory.

## Core Stack
- **Backend:** Node.js (Express), structured with modular controllers (`databaseController`, `ragController`, `appController`, `chatController`, `modelsController`) for clean separation of concerns, eliminating legacy God Classes.
- **Frontend:** React, utilizing modern UI patterns (Dark/Light Solaris themes, CSS variables) and modular state hooks (`useChatState`, `useChatEngine`, `useSessionState`) for real-time AI streaming state.
- **Database:** SQLite (`logos_core.db`) via the "Memory Palace" concept, ensuring zero telemetry and complete privacy. Isolated in `backend/database/`. Runs in **WAL (Write-Ahead Logging) mode** to safely support highly concurrent reads/writes from streaming LLMs and user interface interactions.
- **AI Integration:** Local models run via Ollama (Llama 3, Mistral, etc.) and ComfyUI for image synthesis. Handled by workers in `backend/services/`.

## Architecture Details

### The Memory Palace (Database)
The persistence layer manages relational tables (`SESSIONS`, `MESSAGES`, `PERSONAS`, `SETTINGS`, `GLOBALMEMORY`). It provides episodic memory, enabling agents to remember user preferences and past interactions without relying on external APIs.

### Agentic Tool Execution
The backend features a robust action layer where agents can execute tools like reading/writing the filesystem and synthesizing images.
- **Path Sanitization:** Strict jail boundaries implemented via `path.resolve` and bounds checking to completely mitigate directory traversal vulnerabilities when agents read/write to the filesystem.

### Resilience & Error Handling (Indestructible Fallback Engine)
Local models can sometimes hallucinate JSON structures or ignore tool schemas. The backend is built to be forgiving:
- **JSON Repair Pipeline:** Recursively fixes structural syntax errors and trailing markdown noise.
- **Intent Harvesting:** Extracts functional intent using regex when parsing fails completely.
- **Markdown Block Hijacking:** Intercepts raw code blocks and automatically wraps them into verifiable `agentWriteFile` executions.
- **Syntax Validation:** Gated persistence that runs `python -m py_compile` or `node --check` on generated code before finalizing the file.

### Live UI Preview Sandbox
Artifact generation allows for real-time rendering of HTML/SVG/Image artifacts. To ensure isolation, the backend serves artifacts via a static Express mount (`/uploads`) mapped directly to the session's generation directory. This safely handles asset loading within sandboxed `iframe`s.

### Heartbeat Connection Guard
A 5-second Server-Sent Events (SSE) pulse system prevents browser timeouts during long inference windows, keeping the terminal alive.

## Coding Principles
- Security & Privacy first: no data leaks to external APIs.
- Strict database isolation (`.gitignore` applied to `.db` and `-journal` files).
- Standardized paths relative to the project root using `process.cwd()` effectively.

## Deployment & Testing
- **Testing Suite:** Comprehensive Vitest suite covering the Indestructible Fallback Engine, SQLite database logic, and agent security bounds.
- **Containerization:** Fully Dockerized architecture (frontend and backend Dockerfiles) for seamless cross-platform deployment.
