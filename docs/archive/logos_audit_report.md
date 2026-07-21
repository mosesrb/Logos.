# LÓGOS AI — Production-Readiness Audit Report

**Audit date:** 2026-07-18  
**Scope:** Current working tree, with the architecture, status, README, and audit charter as context.  
**Verdict:** **Not ready for public beta.** The local-first product direction is coherent, but the implementation currently exposes unauthenticated code execution and destructive administration paths, has demonstrable routing/deployment defects, and lacks a trustworthy test/release baseline.

## Method and limitations

This was a static source and configuration audit. I reviewed backend routing, services, agent tools, schema, Docker files, frontend architecture, tests, and repository hygiene. `node --check` passed for the main backend modules. The Vitest suite and frontend build could not be run because the host `npm` command fails before execution: its global `npm-cli.js` is missing. No running application, Docker build, dependency vulnerability scan, browser/accessibility test, or penetration test was available; those results therefore remain unverified.

The audit documents state that the system is modular and Beta Ready. The source does not support that conclusion: `backend/server.js` remains a large composition and infrastructure module, `frontend/src/App.jsx` remains ~81 KB, and extracted controllers reference dependencies they neither import nor receive.

## Executive findings

| ID | Finding | Severity | Release effect |
| --- | --- | --- | --- |
| C-01 | Unauthenticated arbitrary OS command and Python execution | Critical | Blocker |
| C-02 | Unauthenticated database console permits SQL identifier injection and destructive data changes | Critical | Blocker |
| H-01 | Extracted controllers have missing dependencies and unsafe path handling | High | Core routes fail or can escape their intended scope |
| H-02 | Preview pipeline is both non-functional and unsandboxed | High | Generated artifacts cannot be safely previewed |
| H-03 | Docker/frontend/backend endpoint configuration is internally inconsistent | High | Container deployment is unlikely to work |
| H-04 | Dual/triple persistence has no source of truth or transaction boundary | High | Data loss, drift, and unreproducible memory state |
| H-05 | No authentication, authorization, rate limiting, CSRF/CORS policy, or security headers | High | Every exposed management endpoint is reachable by any caller |
| H-06 | Uploads and model inputs lack size/type/resource controls | High | Disk, CPU, memory, and parser abuse risk |

## Detailed issues

### C-01 — Public API exposes arbitrary command execution

**Description:** `POST /api/tools/execute` invokes `python_exec`, which writes caller-provided Python and executes it. The agent loop also exposes `executeCommand`, which passes model-selected text to `child_process.exec`. Agent dispatch accepts a caller-controlled `allowedTools` list, so there is no server-side policy preventing command execution.  
**Why it matters:** Any process that can reach the API can execute commands with the backend process identity. Prompt injection can make an agent invoke the same capability. “Local” does not remove this risk: browser malware, another local account, a malicious webpage under permissive CORS, or later LAN deployment are plausible callers.  
**Severity:** Critical. **Estimated effort:** 3–5 days for a safe replacement.  
**Recommended solution:** Remove arbitrary shell/Python tools from the public API. Replace them with narrowly scoped, allowlisted operations running in an isolated worker/container with per-session workspace roots, quotas, timeouts, audit records, and explicit user approval. Make tool policy server-owned; never accept executable permissions from the client or model.  
**Expected impact:** Removes the highest-risk host compromise path.

### C-02 — Database management routes allow SQL injection and unrestricted destructive administration

**Description:** `databaseController.js` interpolates `table`, `idField`, update keys, and insert keys directly into SQL. Parameter binding is only used for values. The routes also allow any caller to read, alter, insert into, delete from, or purge any listed table.  
**Why it matters:** SQL identifiers cannot be safely parameterized; they must be allowlisted. This is direct SQL injection risk plus an unauthenticated destructive database console. It also bypasses business invariants and JSON-side synchronization.  
**Severity:** Critical. **Estimated effort:** 2–4 days.  
**Recommended solution:** Remove generic DB CRUD from production. If retained for a development-only admin tool, protect it with strong local authentication, a compile-time development gate, a table/column allowlist, schema-aware validation, transactions, and audit logging. Expose domain-specific service operations to the UI instead.  
**Expected impact:** Prevents data compromise and restores persistence invariants.

### H-01 — Controller extraction is incomplete; path protections are inconsistent

**Description:** `appController.js` uses `UPLOADS_DIR`, `OUTPUT_DIR`, `initializePersonaMemory`, `loadPersonaMetadata`, `getPersonaMemoryDir`, and `indexImageMemory` without importing or receiving them in `context`. File routes therefore throw when exercised. Its path check uses `startsWith(process.cwd())`, which accepts sibling-prefix paths such as `C:\\work\\app-evil`; it is not a boundary check.  
**Why it matters:** Core session-file and persona-memory features are unreliable, and intended filesystem containment can be bypassed. This contradicts the documented “strict jail boundaries.”  
**Severity:** High. **Estimated effort:** 2–3 days.  
**Recommended solution:** Create a typed dependency contract for each controller, pass every dependency explicitly, and add route-level integration tests. Centralize path resolution using `path.relative(root, candidate)` and reject absolute paths, `..` traversal, and symlink escapes.  
**Expected impact:** Restores affected functions and makes file isolation testable.

### H-02 — Generated-artifact preview is neither correctly served nor sandboxed

**Description:** AgentDesk loads `/uploads/<session>/agent_files/<file>` in an iframe, but the backend only mounts `/output` as static content; no `/uploads` static mount is present. The iframe has no `sandbox` attribute. If a serving route is added without sandboxing, generated HTML/JS can execute with the application origin and call its API.  
**Why it matters:** The advertised live preview will fail today; a naïve repair creates an XSS/privilege escalation path, especially alongside C-01 and C-02.  
**Severity:** High. **Estimated effort:** 2–4 days.  
**Recommended solution:** Serve generated artifacts from a separate origin or opaque sandbox. Use iframe sandboxing with the smallest necessary permissions, restrictive CSP, `nosniff`, content-disposition for non-previewable files, safe extension allowlists, and per-session authorization.  
**Expected impact:** Delivers preview safely rather than turning artifacts into trusted application code.

### H-03 — Container deployment configuration does not match the application

**Description:** The frontend hard-codes `http://127.0.0.1:3008`; Vite proxies to `3001`; the production Nginx `/api` proxy is commented out; and the backend listens only on `127.0.0.1` inside its container. Docker publishes `3008` but the frontend container cannot reach the backend through the backend service name under this setup.  
**Why it matters:** The documented Docker deployment is not a reliable deployment path. It also makes host/container configuration changes error-prone.  
**Severity:** High. **Estimated effort:** 1–2 days.  
**Recommended solution:** Define one environment-driven public API base. In Docker, bind the backend to `0.0.0.0` and proxy `/api` and any safe asset paths through Nginx to `http://backend:3008`; in development, use the same port via Vite proxy. Add a Compose smoke test.  
**Expected impact:** Makes local, container, and packaged deployments predictable.

### H-04 — Persistence is duplicated without consistency guarantees

**Description:** Sessions, personas, relationships, memory, and visual metadata are variously held in memory, JSON, SQLite, Chroma/MemPalace, and two SQLite files (`logos.db`, `logos_core.db`). Writes are often synchronous JSON writes followed by fire-and-forget SQLite synchronization; generic DB CRUD can modify only SQLite. The schema has no migration ledger, most foreign-key enforcement is not explicitly enabled, and no backup/restore workflow exists.  
**Why it matters:** A crash or concurrent write can leave each store with a different truth. Recovery and user trust in “episodic memory” become impossible to establish.  
**Severity:** High. **Estimated effort:** 2–3 sprints.  
**Recommended solution:** Select SQLite as the authoritative transactional store, version schema migrations, enable and test foreign keys, use transactions/outbox processing, and treat JSON only as import/export. Put vector records behind a repository with stable IDs and deletion propagation. Add encrypted, documented backups and restore tests.  
**Expected impact:** Correct, recoverable, and scalable memory behavior.

### H-05 — Security baseline is absent

**Description:** The server applies unrestricted `cors()` and exposes admin, model, filesystem, audio, memory, and agent routes without authentication or authorization. No CSRF strategy, rate limiting, request IDs, security headers, secret redaction, or production logging policy is present. Global exception handlers intentionally keep the process alive after uncaught exceptions.  
**Why it matters:** Local-only exposure is an assumption, not a control. The application is one configuration change away from exposing its full control plane. Continuing after unknown process corruption can create silent incorrect behavior.  
**Severity:** High. **Estimated effort:** 1–2 sprints.  
**Recommended solution:** Establish a threat model and deployment modes. Default-bind to loopback for desktop mode; require an explicit allowlist and authenticated, role-based access for any network mode. Add Helmet/CSP, strict CORS, CSRF protection where cookie auth exists, rate/size limits, structured redacted logs, and fail-fast/restart supervision.  
**Expected impact:** A defensible security posture for beta distribution.

### H-06 — Upload, inference, and web-fetch paths have no enforceable resource governance

**Description:** Multer is configured without file-size/count limits or MIME/content validation. It accepts uploads before extension rejection, leaving unsupported files on disk. PDF/DOCX/OCR parsing, image indexing, web retrieval, model dispatch, and ComfyUI polling lack queue-based admission control, per-job cancellation, and aggregate quotas. `multer@1.x` is also flagged as vulnerable/deprecated by its lockfile.  
**Why it matters:** A local or exposed caller can exhaust disk, CPU, memory, or GPU. Document parsers enlarge the attack surface.  
**Severity:** High. **Estimated effort:** 1 sprint.  
**Recommended solution:** Upgrade Multer, enforce content-type/magic-byte/file-size limits before expensive work, delete rejected uploads, scan/quarantine inputs where applicable, and run parsing in bounded workers. Use a job queue with GPU/CPU concurrency limits, cancellation, and retention cleanup.  
**Expected impact:** Prevents denial of service and makes long-running tasks observable.

### M-01 — Memory retrieval is incomplete and context provenance is weak

**Description:** `ai/memoryRetriever.js` returns an empty array and a fixed score. Chat memory composition mixes raw user/model content, pinned content, persona text, web text, and RAG text into prompts without a trust/provenance model, prompt-injection isolation, durable relevance scoring, retention/pruning policy, or token accounting.  
**Why it matters:** The Memory Palace cannot yet meet the reliability and hallucination-resistance claims. Retrieved hostile content can steer tools or system behavior.  
**Severity:** Medium. **Estimated effort:** 1–2 sprints.  
**Recommended solution:** Store source, ownership, timestamp, consent, and confidence for every memory. Retrieve through deterministic filters plus tested hybrid ranking; cap and label untrusted context; isolate it in prompts as data, never instruction. Define retention, deduplication, review, and deletion semantics.  
**Expected impact:** More relevant memory and lower prompt-injection/context-pollution risk.

### M-02 — Frontend remains a monolith with inaccessible custom interaction patterns

**Description:** `App.jsx` is ~81 KB and duplicates much of the chat/memory orchestration extracted into `useChatEngine`; `App.backup.jsx` duplicates the monolith. Numerous clickable controls use text/icon-only buttons or spans without accessible names, keyboard equivalents, focus management, or modal focus trapping. There are no frontend tests, route-level error boundaries, code splitting, or formal responsive/accessibility verification.  
**Why it matters:** UI changes will remain high-risk, mobile hardening cannot be trusted, and keyboard/screen-reader users face barriers.  
**Severity:** Medium. **Estimated effort:** 1–2 sprints.  
**Recommended solution:** Complete the state/transport extraction, delete or archive generated backup/refactor scripts outside production source, add semantic labels and keyboard/focus behavior, introduce error boundaries and lazy loading, and test with React Testing Library plus Playwright and axe.  
**Expected impact:** Maintainable UI with an auditable accessibility baseline.

### M-03 — Test and release engineering is insufficient

**Description:** The available backend tests primarily cover `agentWriteFile`, selected fallback parsing, and SQLite existence/WAL state. They do not exercise mounted routes, authorization, SQL injection, controller dependencies, uploads, streaming cancellation, migrations, persistence recovery, Docker networking, frontend behavior, or accessibility. There is no CI workflow, lint/test/build gate, dependency scanning, SBOM, or release artifact process.  
**Why it matters:** The codebase can report “stable” while key routes are broken and critical security regressions remain undetected.  
**Severity:** Medium. **Estimated effort:** 1 sprint to establish a baseline.  
**Recommended solution:** Repair the npm toolchain, then require CI on clean installs: lint, unit, API integration, browser E2E, accessibility, container smoke, and dependency/security scanning. Add coverage thresholds only after meaningful integration tests exist.  
**Expected impact:** Evidence-based release decisions.

### M-04 — Operational quality and repository hygiene are below beta standard

**Description:** The worktree contains runtime chats, uploads, databases/WAL files, generated artifacts, logs, `.env`, scratch scripts, and model data. The current `.gitignore` only ignores `node_modules`. Source paths and ComfyUI paths are hard-coded to a Windows drive. No documented environment schema, health/readiness contract, backup plan, update process, or privacy data lifecycle exists.  
**Why it matters:** Sensitive content can be committed accidentally; reproducibility and cross-platform claims are undermined.  
**Severity:** Medium. **Estimated effort:** 3–5 days.  
**Recommended solution:** Supply `.env.example`; ignore secrets, databases, WAL/SHM, uploads, chats, output, caches, logs, and scratch/generated files; move paths into validated configuration; document supported platforms and data lifecycle. Add readiness checks and structured logs.  
**Expected impact:** Safer collaboration and repeatable installation.

## Section-by-section assessment

### 1. Architecture review — **3/10**

The conceptual layers are reasonable, but controller extraction has not established dependency direction or a stable composition boundary. Runtime/server code still coordinates persistence, ComfyUI, session state, legacy JSON, and controller setup. Large frontend and controller modules, duplicated state, and generated refactor utilities indicate continuing hidden complexity. Adopt feature modules with explicit interfaces and one composition root.

### 2. Backend audit — **2/10**

Express routing is extensive but lacks input schemas, authorization, error taxonomy, cancellation propagation, and resource cleanup policies. Blocking filesystem calls occur in request paths. SSE uses ad hoc loops/heartbeats; disconnect does not consistently abort upstream model fetches. The global exception strategy logs and continues rather than restoring a known-good process. C-01, H-01, H-05, and H-06 are release blockers.

### 3. Frontend audit — **4/10**

React components display a rich operations UI, but state and transport remain concentrated in `App.jsx`; polling and streaming are dispersed; API bases are hard-coded; and component duplication remains. Theme variables exist, but dark/Solaris accessibility contrast and responsive touch behavior were not measured. The review found no systematic keyboard navigation, focus management, loading/error boundaries, or frontend tests.

### 4. Database audit — **3/10**

WAL is configured, and `Messages.session_id` has an index. However, migrations, foreign-key enforcement, indexes for typical time/session/memory queries, transaction boundaries, backup/restore, retention, and a defined scaling path are absent. Generic DB editing bypasses consistency logic. The schema also does not model relationships by session despite the application keying relationships by session/persona.

### 5. Memory Palace review — **3/10**

Multiple memory implementations coexist. Retrieval is partly placeholder, embeddings are stored as JSON, and no source-of-truth/deletion/retention design connects JSON, SQLite, Chroma, and file stores. Semantic search compatibility exists in intent but is not production-ready. Treat all retrieved content as untrusted data and establish source, permissions, pruning, and evaluation contracts.

### 6. Agent framework — **2/10**

The loop, heartbeat, parsing fallbacks, and syntax checks show an attempt at resilience. That resilience is unsafe because it broadens interpretation of malformed model output into executable actions, and model/client-selected tools receive no server-side capability boundary. Use structured tool schemas, strict validation, durable job state, idempotency, explicit approval for side effects, and a deny-by-default capability model.

### 7. Security audit — **1/10**

Critical RCE, SQL injection, unrestricted administration, permissive CORS, no identity/access control, weak path checks, unsafe artifact isolation, unbounded uploads, and hard-coded operational paths prevent a security sign-off. No dependency scan was run, so package vulnerability status is unknown beyond lockfile deprecation indicators.

### 8. AI pipeline — **3/10**

Ollama/ComfyUI integration supports local model use, but model endpoints, option validation, context composition, tool policy, and failure/cancellation handling are inconsistent. JSON repair and Markdown hijacking should never turn ambiguous output into privileged work. Introduce a provider interface, model capability registry, per-model limits, prompt/context provenance, and evaluation fixtures.

### 9. Performance audit — **3/10**

WAL and a nominal heavy-model counter are not a performance architecture. In-memory sessions/vector chunks grow without bound; JSON rewriting and sync filesystem access scale poorly; no pagination for chat history is visible; and polling plus model/image workloads lack backpressure. Profile with representative long sessions and GPU contention after implementing bounded queues and storage limits.

### 10. UX review — **4/10**

The project has an intentional visual identity and multiple user-facing states, but its professional UX cannot be signed off without functional preview, reliable error/retry/cancel states, mobile verification, accessibility testing, and a clear explanation of destructive/agentic permissions. Show users every proposed tool action and whether it changes files, memory, or model state.

### 11. Code quality — **3/10**

Naming is broadly understandable, but source contains hard-coded machine paths, repeated logic, large files, legacy/backup scripts in source trees, inconsistent module boundaries, and comments describing phases rather than enforceable behavior. The source has encoding corruption in user-facing documentation/comments (`LÃ“GOS`, emoji sequences), which should be normalized to UTF-8.

### 12. DevOps — **2/10**

Dockerfiles and Compose exist, but the service networking/API configuration is inconsistent. Builds use `npm install` rather than lockfile-enforcing `npm ci`; containers run with no documented non-root policy, resource limits, health checks, secrets strategy, or image scanning. CI/CD and release operations are absent.

### 13. Testing — **2/10**

The narrow unit tests are useful seeds, but there is no end-to-end coverage of the promised systems. The presently broken npm installation makes even the existing suite non-verifiable in this audit environment. Add reproducible setup and test critical API/security paths before feature expansion.

### 14. Future scalability — **2/10**

For a single trusted local user, bounded workloads may be viable after the release blockers are fixed. The current in-memory session model, synchronous file operations, duplicated stores, exposed generic administration, and lack of queues/auth make 100 concurrent users unsupported. 1,000 users, 10,000 sessions, plugin ecosystems, sync, optional online use, and multi-agent swarms require architectural redesign rather than horizontal scaling.

### 15. Technical debt

**Critical:** C-01/C-02 security design, persistence ambiguity, and unsafe artifact execution.  
**Moderate:** incomplete extraction, monolithic frontend, hard-coded configuration, unbounded workloads, and undocumented data lifecycle.  
**Minor:** source encoding, backup/generated files, phase-comment clutter, and inconsistent naming.  
**Highest-ROI quick wins:** disable public execution/admin routes, correct Docker API routing, create a usable `.gitignore`/`.env.example`, and add route integration tests.

### 16. Missing features

**Critical:** authentication/authorization for network mode; safe capability/approval system; migrations; backup/restore; API validation; rate/size limits; audit logs; security headers; CI security gate.  
**Important:** agent job queue/cancellation; trusted context provenance; data retention/export/delete controls; robust error/retry UX; accessible keyboard/modal behavior; deployment configuration.  
**Nice to have:** semantic ranking evaluation dashboard, plugin SDK after isolation exists, cross-device sync only after encryption/conflict design.  
**Experimental:** multi-agent swarms, online research, and unrestricted simulations should remain disabled until the capability model is proven.

### 17. Risk assessment

| Risk | Current exposure | Mitigation priority |
| --- | --- | --- |
| Host compromise | Arbitrary command/Python tools and prompt-controlled tool selection | Immediate |
| Data loss/corruption | Multiple stores, non-transactional sync, public DB CRUD | Immediate |
| Unsafe artifact execution | Unsandboxed generated content; missing serving design | Immediate |
| Broken release | Controller missing dependencies and Docker mismatch | Immediate |
| Privacy breach | Runtime personal data/secrets are easy to retain or commit; no data lifecycle | Next sprint |
| Resource exhaustion | Unbounded uploads, parsing, inference, and image jobs | Next sprint |
| Maintenance stagnation | Monoliths and absent integration/CI tests | Next sprint |

### 18. Production-readiness score

| Area | Score |
| --- | ---: |
| Architecture | 3/10 |
| Backend | 2/10 |
| Frontend | 4/10 |
| Database | 3/10 |
| Security | 1/10 |
| Performance | 3/10 |
| UX | 4/10 |
| Maintainability | 3/10 |
| Documentation | 3/10 |
| Testing | 2/10 |
| **Overall** | **2.8/10** |

The overall score reflects release readiness, not product ambition. It must not be used as a beta-launch score until the critical findings have been independently retested.

### 19. Action plan

**Immediate — release block (days 1–5)**

1. Disable `/api/tools/execute`, agent command execution, generic database CRUD, ComfyUI launch, and destructive memory/session operations in distributable builds.
2. Fix controller dependency injection and add integration tests that invoke every mounted route.
3. Establish loopback-only desktop mode; add authentication and strict CORS before allowing any remote/network mode.
4. Repair API configuration and Docker networking; verify with a clean Compose smoke test.
5. Fix repository hygiene and secrets/data exclusions; move machine-specific paths to validated configuration.

**Next sprint — secure core (weeks 2–3)**

1. Implement a server-owned capability system with explicit side-effect approval, isolated workers, quotas, cancellation, and audit records.
2. Replace generic DB access with domain APIs; introduce migrations, transactions, foreign-key enforcement, backups, and restore tests.
3. Secure uploads and artifact preview with limits, separate-origin sandboxing, CSP, retention cleanup, and integration tests.
4. Repair the npm toolchain and introduce CI gates for clean install, lint, tests, build, dependency scan, and container smoke test.

**Beta candidate (weeks 4–6)**

1. Consolidate persistence and memory provenance; implement tested retrieval/ranking/pruning/deletion behavior.
2. Bound chat history, vectors, model jobs, and GPU work with queues and telemetry.
3. Complete frontend state extraction; add error boundaries, accessible controls, keyboard/focus flows, responsive verification, and Playwright/axe tests.
4. Conduct an authenticated API penetration test and run a privacy/data-retention review.

**Version 1.0 and long term**

Treat plugins, cloud synchronization, browser use, online providers, and multi-agent execution as separate threat-modelled products. Add them only after isolation, permissions, encryption, observability, user consent, and recovery guarantees are in place.

## Required exit criteria for a public beta

- Independent verification that C-01 and C-02 are removed, not merely hidden in the UI.
- Authenticated/authorized network mode or a verified loopback-only packaging model.
- All production routes have schema validation, safe error handling, and integration coverage.
- One authoritative persistence model with migrations, backup, restore, and deletion tests.
- Sandboxed artifact preview and bounded upload/inference paths.
- Clean `npm ci`, test, build, Docker smoke, and dependency scan runs in CI.
- Keyboard/accessibility and mobile acceptance tests completed on supported platforms.

