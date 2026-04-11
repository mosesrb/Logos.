# LÓGOS AI: Local AI Chat Platform

## Project Overview
LÓGOS AI is a high-performance, privacy-first local AI chat platform. It leverages **Ollama** for LLM inference and a suite of local models for RAG, OSINT search, and vocal integration. The system is designed with a futuristic Cyberpunk UI and supports advanced multi-model interaction patterns.

---

## Technical Stack
- **Frontend**: React (Vite) + Vanilla CSS (Cyberpunk Theme)
- **Backend**: Node.js (Express) + ES Modules
- **Inference Engine**: Ollama (supports `phi3`, `mistral`, `llama3`, etc.)
- **AI Pipelines**: `@xenova/transformers` (local execution of Whisper, SpeechT5, and MiniLM)
- **Data Persistence**: Local JSON-based session storage

---

## Core Features

### 1. Multi-Modal Interaction
- **Vision Support (RETINA)**: Automatic "Smart Shift" to vision-capable models (e.g., `llava`, `moondream`) when images are uploaded.
- **Vocal Integration (VOX)**: 
    - **STT**: Local transcription via Whisper.
    - **TTS**: Local synthesis via SpeechT5.
    - **Voice Commands**: Control the UI and chat via "Nexus" wake-word triggers.

### 2. Intelligent Context & Retrieval
- **Advanced RAG**: Semantic search across PDF (with OCR), DOCX, and raw text.
- **OSINT Web Search**: Multi-source autonomous search (DuckDuckGo, Wikipedia) with LLM-powered synthesis of search data.
- **CHRONOS Memory**: Global episodic memory that indexes past conversation turns for across-session recall.
- **Shadow Memory**: Manually "pin" logs or specific facts for persistent context injection.

### 3. Interaction Modes
- **Normal**: Direct 1:1 chat with a selected model.
- **Parallel**: Simultaneous independent responses from multiple models for comparison.
- **Debate**: Judged iterative argumentation where models critique each other, followed by a final verdict.
- **Collaborate**: A linear pipeline (Draft → Refine → Review) using different models for each stage.
- **Pipeline (SYNAPSE)**: Configurable multi-model workflows with presets for Code Review, Documentation, etc.

---

## System Capabilities (ICARUS Protocol)
The system includes backend agentic tools:
- **File System**: Read/Write files and list directories within the workspace.
- **Execution**: Run Python code snippets locally for data analysis or scripting.
- **System HUD**: Real-time VRAM/RAM/CPU monitoring integrated into the UI.

---

## Current State
- **Backend**: Fully functional with all major features (RAG, VOX, OSINT) implemented.
- **Frontend**: Responsive Cyberpunk UI with integrated Terminal and Neural Map visualization.
- **Models**: Optimized for local execution with fallback mechanisms for missing dependencies.

## Setup Requirements
- **Ollama**: Must be running for LLM inference.
- **Tesseract OCR**: Required for image/PDF text extraction.
- **Python**: Required for executing Icarus Python tools.
