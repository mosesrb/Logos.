# LÓGOS AI Platform

<div align="center">
  <h3>A High-Performance, Privacy-First Local AI Ecosystem</h3>
</div>

---

**LÓGOS** is an advanced, cyberpunk-themed local AI platform designed for users who want complete control over their intelligence stack. By leveraging local execution, it ensures absolute privacy, persistent memory, and agentic autonomy—all wrapped in a highly responsive, cyber-aesthetic interface.

## 🚀 Key Features

*   **100% Local Privacy**: Runs entirely on your hardware. Your data, prompts, and episodic memory never touch external servers or telemetry.
*   **Agentic Operations Desk (AOD)**: Go beyond simple chat. Dispatch the `AXON` agent or other custom personas on recursive, multi-step sub-tasks, complete with an execution trace UI.
*   **Chronos Episodic Memory**: A sophisticated knowledge graph system that preserves conversational context and documents over time, allowing agents to seamlessly recall past interactions.
*   **Icarus Tool-Calling Protocol**: Built-in Python Sandbox, OSINT Search integrations, and local filesystem access (designed with opt-in permission layers).
*   **Retina Multi-Modal Processing**: Drag-and-drop support for documents, PDFs, and images directly into the chat interface for local processing.
*   **Dynamic UI/UX**: A highly stylized, terminal-inspired interface with real-time performance metrics and responsive modal overlays.

## 🛠️ The Tech Stack

LÓGOS is built for speed and hackability:

*   **Intelligence Engine**: [Ollama](https://ollama.com/) (Powers local inference for Llama, Qwen, Gemma, etc.)
*   **Backend Substrate**: Node.js, Express, SQLite (Zero-config embedded DB).
*   **Frontend Interface**: React (Vite), Vanilla CSS (Custom Cyberpunk Design System).

---

## ⚙️ Installation & Setup

### Prerequisites

1.  **Node.js** (v18 or higher)
2.  **Ollama** installed and running on your system.

### Quick Start Guide

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/mosesrb/Logos..git
    cd Logos.
    ```

2.  **Run the Setup Wizard**
    Launch the interactive setup script. This will install dependencies and walk you through selecting and downloading the AI models (Fast, Smart, and Heavy tiers) that will power your system.
    ```cmd
    setup.bat
    ```

3.  **Automatic Launch**
    Once the setup wizard finishes, LÓGOS will automatically launch the platform. 
    The interface will open in your browser, or you can navigate to `http://localhost:5173`.


---

## 🧠 The Factory Persona Library

On your first launch, LÓGOS will automatically seed your local database with 5 tailored architectural personas designed to demonstrate the platform's multi-layered capabilities:

*   **LÓGOS Architect**: Your system engineering and Node/React expert.
*   **Neon Scout**: Street-smart cyberpunk drifter optimized for OSINT and web searches.
*   **Aether Analyst**: Data scientist tuned exclusively for high-precision Python logic and data crunching.
*   **Chronos Curator**: Your episodic memory and documentation archivist.
*   **AXON / Neural Coordinator**: The high-fidelity Agentic Operator built for the Agent Desk.

*(All factory personas are defined in `backend/data/personas.json` and are fully editable).*

---

## 🔒 Security Posture & Hardening

*   **Database Isolation**: Your active `logos.db` is strictly `.gitignore`'d. Your history remains completely private on your local machine.
*   **Sandboxing**: Python tool execution runs in an isolated state, but users should still exercise caution when running unverified agentic code loops.
*   **Opt-In Tooling**: Agent tool capabilities (like File System access) are disabled by default and require manual activation.

## 🤝 Open Source / Modification

LÓGOS is designed to be relentlessly modified.
*   Want to change the design? Tweak `index.css`.
*   Want to add a new tool? Expand the `IcarusToolBelt`.
*   Want to connect a different inference engine? Abstract the Ollama endpoints in `backend/server.js`.

Enjoy the framework, Operative.
