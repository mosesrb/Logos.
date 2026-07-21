# LÓGOS AI Runbook

This document details the operational instructions for deploying, running, and maintaining LÓGOS AI.

## 1. Local Deployment (Docker)

LÓGOS AI is designed to run locally using Docker Compose, encapsulating both the frontend and backend services.

### Prerequisites
- Docker Engine & Docker Compose
- (Optional) Local Ollama instance running on port 11434 for local LLM inference.
- (Optional) Local ComfyUI instance running for local image generation.

### Start the Application
```bash
docker compose up -d
```
- The frontend will be available at `http://localhost:3000`.
- The backend API will be available internally or mapped as required.

### Stop the Application
```bash
docker compose down
```

## 2. Environment Configuration

Copy the sample environment file and adjust parameters:
```bash
cp backend/.env.example backend/.env
```

Key environment variables:
- `PORT`: Backend API port (default: 3008)
- `OLLAMA_BASE_URL`: Pointer to your local Ollama instance (default: `http://127.0.0.1:11434`)
- `DB_PATH`: Location of the SQLite memory palace database (default: `./data/database.sqlite`)

## 3. Database Maintenance (SQLite)

The core database uses SQLite in WAL (Write-Ahead Logging) mode.

### Backing Up the Database
To safely backup the database without stopping the container:
```bash
sqlite3 backend/data/database.sqlite ".backup 'backend/data/database_backup.sqlite'"
```

### Restoring the Database
1. Stop the application: `docker compose down`
2. Replace the `.sqlite` file:
```bash
mv backend/data/database_backup.sqlite backend/data/database.sqlite
```
3. Remove WAL files if present: `rm backend/data/database.sqlite-wal backend/data/database.sqlite-shm`
4. Start the application: `docker compose up -d`

## 4. Troubleshooting

**Frontend fails to connect to Backend:**
- Verify `VITE_API_BASE` in the frontend environment matches the backend port.
- Check CORS settings in `backend/server.js`.

**500 Internal Server Errors During Chat:**
- If the chat stream crashes with a 500 error immediately upon sending a message, it is likely that the assigned model is not downloaded in your local Ollama instance.
- Check the fallback model defined by `UTILITY_MODEL` in your `.env` (default is `gemma2:2b`). Make sure it is downloaded (`ollama pull gemma2:2b`).
- Check `backend/error_log.txt` for detailed traces from the local LLM inference engine.

**Agent Tools Failing:**
- Check the backend logs for filesystem boundaries. The application strictly jails file operations to the `workspace/` and `uploads/` directories to prevent directory traversal attacks.

**Database Locked Errors:**
- Ensure the SQLite database is not stored on a networked filesystem (NFS/SMB). It must be on a local disk for WAL mode to function correctly.

