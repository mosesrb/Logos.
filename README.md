# 🧠 LÓGOS AI

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)

🚀 Run a private local AI system with persistent episodic memory and autonomous tool execution.



## 🎬 Demo
![LÓGOS AI Chat Interface](docs/assets/demo.png)

## ⚡ Quick Start

```bash
git clone https://github.com/mosesrb/Logos..git
cd Logos.
npm install
npm run start
```

## ❓ Why LÓGOS?

Most AI tools are cloud-based and have no long-term memory. 

**LÓGOS provides:**
- 100% Local execution
- Persistent episodic memory via SQLite
- Agentic tool execution (browsing, files, DB)

## ✨ Key Features

- **Autonomous Actions**: Agents can write and manage code files independently.
- **Neural Database Management**: Robust memory handling and persona orchestration.
- **Thinking Layer**: Advanced planning logic before action execution.

## 🏗 Architecture

```mermaid
graph TD;
    UI[Agent Desk Frontend] --> Core[LÓGOS Logic Engine];
    Core --> Tools[Action / Tools Layer];
    Core --> Memory[(SQLite Persistent DB)];
```

## 📜 License
This project licensed under GPL-v3.
