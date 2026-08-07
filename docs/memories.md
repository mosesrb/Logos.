# LÓGOS AI - Memory Logs & Architectural Directives

## User Directives & Preferences
- **Architecture Philosophy**: Prefer lightweight, custom solutions where possible over massive frameworks unless explicitly required.
- **Styling**: Stick to Custom CSS Modules rather than jumping to TailwindCSS or Shadcn/ui unless the undertaking is verified necessary, saving complexity.
- **State Management**: Utilize `Zustand` for global React state (adopted over Redux for lightweight boilerplate).
- **Database Architecture**: SQLite serves as the core persistence layer, designed specifically for single-tenant (personal) use per current design preferences.

## Critical Refactoring Milestones (2026-08-07)
- **Frontend Modularization**: Successfully dismantled the React "God Object" (`App.jsx`), isolating logic into clean hooks (`useChatTransport`, `useStore`) and atomic components (`ChatHeader`, `ChatInput`).
- **Backend Provider Abstraction**: Shifted from hardcoded fetch endpoints in controllers to a versatile `BaseProvider` and `OllamaProvider` schema.
- **Memory Palace IPC Refactor**: Replaced unstable and sluggish `.txt` file polling to the Python Memory Palace with robust `stdin`/`stdout` streaming IPC logic via `mempalaceBridge.js`.
- **Security & Hardening**:
  - Implemented heuristic checks in `chatController.js` to block Prompt Injection and System Jailbreak attempts (`403 Forbidden`).
  - Switched to asynchronous logging (`fs.promises.appendFile`) to prevent blocking the Node.js event loop during high-throughput parallel AI interactions.
  - Implemented strict structured payload parsing utilizing `jsonrepair` via `parseCleanAnswer` to fix LLM hallucinations on JSON format modes.
- **Code Quality**: Enforced codebase-wide ESLint targeting modern JavaScript/React best practices. Extinguished duplicate global concurrency logic (`activeHeavyModels`) and transitioned seamlessly into localized asynchronous queue handlers.
