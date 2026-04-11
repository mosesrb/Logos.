# LÓGOS AI: Project State Overview

## 🏙️ Vision
LÓGOS AI is a high-performance, privacy-first local AI ecosystem designed to provide an advanced, cyberpunk-themed interface for local LLM interaction. It emphasizes local execution (Ollama), multi-modal capabilities (Retina), and persistent episodic memory (Chronos).

## 🛠️ Technical Stack
- **Frontend**: React (Vite) + Vanilla CSS (Custom Cyberpunk/Neon Theme).
- **Backend**: Node.js (Express) with ES Modules.
- **LLM Engine**: Ollama (supporting a wide range of local models like Qwen, Phi3, Llama3, Mistral).
- **AI Pipelines**: `@xenova/transformers` for local STT (Whisper) and TTS (SpeechT5).
- **Generation**: ComfyUI API integration for advanced image generation.
- **Persistence**: Local JSON-structured memory and session storage.

## 🏗️ System Architecture
The system is built on a modular "Phase" architecture, currently transitioning into **Phase 10.5 (Visual Intelligence)**.

1.  **Thinking + Action Layer**: Instead of direct responses, the system uses a "Thinking" phase to plan tools and intent before final output.
2.  **Multimodal Routing**: Automatic detection and switching (Smart Shift) between text-only and vision-enabled models.
3.  **Memory Fabric**: Combined episodic (CHRONOS) and semantic (Vector-based RAG) memories.
4.  **Icarus Toolset**: Backend agentic tools allowing the AI to interact with the local file system and execute Python code.

## 📈 Current Development State
- **Core Chat**: Production-ready with support for Normal, Parallel, Debate, and Collaborate modes.
- **Visual Memory (RETINA)**: Implementation of confidence-based switching (Retrieve vs Generate vs Hybrid).
- **Vocal Integration (VOX)**: Fully functional local transcription and synthesis.
- **Simulation Engine**: Highly advanced "Scenario Mode" for complex multi-persona roleplay.
- **UI/UX**: Mature Cyberpunk aesthetic with integrated Terminal Hub, Neural Map, and System HUD monitoring.

---
*Last Updated: 2026-03-20*
