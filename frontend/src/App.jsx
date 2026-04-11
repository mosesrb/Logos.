import React, { useEffect, useRef, useState } from "react";
import "./index.css";

// Modular Components
import NeuralMap from './components/NeuralMap.jsx';
import ChatSidebar from './components/ChatSidebar.jsx';
import ChatHeader from './components/ChatHeader.jsx';
import ChatInterface from './components/ChatInterface.jsx';
import ChatInput from './components/ChatInput.jsx';
import PersonaForge from './components/Modals/PersonaForge.jsx';
import ScenarioBuilder from './components/Modals/ScenarioBuilder.jsx';
import UserProfile from './components/Modals/UserProfile.jsx';
import NarrativeEvaluation from './components/Modals/NarrativeEvaluation.jsx';
import TerminalHub from './components/TerminalHub.jsx';
import SystemHUD from './components/SystemHUD.jsx';
import MetricsPanel from './components/MetricsPanel.jsx';
import IcarusToolBelt from './components/IcarusToolBelt.jsx';
import NeuralDatabaseManager from './components/NeuralDatabaseManager.jsx';
import AgentDesk from './components/AgentDesk.jsx';


const INTERACTION_MODES = ["Normal", "Agent", "Parallel", "Debate", "Collaborate", "Pipeline", "Scenario"];
const DEBATE_TURN_OPTIONS = [1, 2, 3, 4, 5];
const VISION_MODELS = ["llava", "bakllava", "moondream"]; // Removed phi3:vision
const MODE_DESCRIPTIONS = {
  Normal: "Direct 1:1 interaction with a single local model. Best for general tasks.",
  Parallel: "Simultaneous independent responses from multiple models. Compare logic across architectures.",
  Debate: "Iterative argumentation cycle. Opponents critique previous responses, followed by a final Judge evaluation.",
  Collaborate: "Linear pipeline (Draft → Refine → Review). Exploits specialized model strengths at each stage.",
  Pipeline: "SYNAPSE: Configurable multi-model workflow. Select a preset (Code Review, Doc Writer, Bug Hunter, Brainstorm) or build custom stages.",
  Scenario: "PARTHENOPE Simulation Engine: High-fidelity roleplay simulations with defined world rules and multi-persona participants.",
};

export default function App() {
  const API_BASE = "http://127.0.0.1:3008";
  const API = `${API_BASE}/api`;

  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [models, setModels] = useState([]);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState([]);
  const [selectedModelSingle, setSelectedModelSingle] = useState("gemma4:e4b");
  const [interactionMode, setInteractionMode] = useState("Normal");
  const [isAgentTerminalActive, setAgentTerminalActive] = useState(false);
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'agent-desk'
  const [webMode, setWebMode] = useState(false);
  const [ragMode, setRagMode] = useState(false);
  const [unrestrictedMode, setUnrestrictedMode] = useState(false);
  // Phase 25: Memory Editing
  const [selectedNode, setSelectedNode] = useState(null);
  const [editNodeText, setEditNodeText] = useState("");
  const [isSyncingMemory, setIsSyncingMemory] = useState(false);
  // Phase 26: Parthenope features
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('parthenope_dark') === 'true');
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('parthenope_sidebar_w') || '240'));
  const [diagnosticsWidth, setDiagnosticsWidth] = useState(() => parseInt(localStorage.getItem('parthenope_diag_w') || '360'));
  const [lastUserMessage, setLastUserMessage] = useState(null);
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showJudgeDropdown, setShowJudgeDropdown] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [debateTurns, setDebateTurns] = useState(2);
  const [judgePersonaId, setJudgePersonaId] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingBlocks, setStreamingBlocks] = useState([]);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [sessionFiles, setSessionFiles] = useState([]);
  const [pipelineStatus, setPipelineStatus] = useState(null); // { stage: string, total: number, current: number }
  const [metrics, setMetrics] = useState({ latency: 0, tokens: 0, vram: "0GB", tps: 0 });
  const [sysStats, setSysStats] = useState({ cpu: 0, ram: 0, vram: 0, details: {} });
  const [scrollLock, setScrollLock] = useState(true);
  const [visionBuffer, setVisionBuffer] = useState([]); // Array of base64 strings
  const [isListening, setIsListening] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState("LOGS");
  const [synapsePreset, setSynapsePreset] = useState("code-review");
  const [synapsePresets, setSynapsePresets] = useState([]);
  const [autoRead, setAutoRead] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("male_us");
  const [personas, setPersonas] = useState([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [personaMap, setPersonaMap] = useState({}); // { [modelName]: personaId }
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [showPersonaForge, setShowPersonaForge] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);
  const [forgeTab, setForgeTab] = useState("settings"); // "settings" | "history"
  const [moodHistory, setMoodHistory] = useState([]);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false); // Phase 14
  const [userPersona, setUserPersona] = useState({
    profile: { communication_style: "balanced", prefers_depth: true, tone_preference: "neutral" },
    goals: []
  }); // Phase 14
  const [forgeData, setForgeData] = useState({
    name: "",
    system_prompt: "",
    goal: "",
    core_expertise: "",
    personality_style: "",
    quirks: "",
    rules: [""],
    traits: { curiosity: 0.6, empathy: 0.5, logic: 0.7, assertiveness: 0.5, playfulness: 0.4, patience: 0.6 },
    temperature: 0.7,
    top_p: 0.9,
    model: "",
    voice: "",
    imageGeneration: true,
    imageRetrieval: true,
    availableModes: ["Normal", "Parallel", "Debate", "Collaborate", "Pipeline", "Scenario"]
  });
  const [personaMood, setPersonaMood] = useState(null); // Phase 18
  const [pendingTrigger, setPendingTrigger] = useState(null); // Phase 19
  const [showScenarioBuilder, setShowScenarioBuilder] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const [forgeScenarioData, setForgeScenarioData] = useState({
    name: "",
    description: "",
    initial_prompt: "",
    participant_roles: [""],
    world_rules: [""],
    personaMap: {},
    hiddenIntents: {},
    rag_mode: false,
    unrestricted_mode: false
  });
  const [hiddenIntents, setHiddenIntents] = useState({}); // { [role]: "agenda" }
  const [roleModelMap, setRoleModelMap] = useState({}); // { [role]: "model" }
  const [evaluation, setEvaluation] = useState(null); // { fidelity, progression, anomalies, synopsis }
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [forgeSaveStatus, setForgeSaveStatus] = useState("idle");
  const [simulationChaos, setSimulationChaos] = useState(1.0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  // LOGS or NEURAL_MAP
  const [vectorNodes, setVectorNodes] = useState([]);
  const [pinnedMemories, setPinnedMemories] = useState([]);
  const [expandedImage, setExpandedImage] = useState(null);
  const [mapTransform, setMapTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mapHasMoved, setMapHasMoved] = useState(false);
  const [showDbManager, setShowDbManager] = useState(false);
  const [logs, setLogs] = useState([]);
  const messagesEndRef = useRef(null);
  const terminalEndRef = useRef(null);
  const lastLoadedSessionId = useRef(null);
  const titlingSessionsRef = useRef(new Set()); // Track which sessions are currently being auto-titled

  // Auto-scroll terminal
  useEffect(() => {
    if (scrollLock) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLogs, scrollLock]);

  // Phase 26: Dark Mode persistence
  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode);
    localStorage.setItem('parthenope_dark', darkMode);
  }, [darkMode]);

  // Phase 26: Panel size persistence
  useEffect(() => {
    localStorage.setItem('parthenope_sidebar_w', sidebarWidth);
  }, [sidebarWidth]);
  useEffect(() => {
    localStorage.setItem('parthenope_diag_w', diagnosticsWidth);
  }, [diagnosticsWidth]);


  // System HUD polling
  useEffect(() => {
    const poll = setInterval(() => {
      fetch(`${API}/system/stats`)
        .then(r => r.json())
        .then(setSysStats)
        .catch(() => { });
    }, 3000);
    return () => clearInterval(poll);
  }, []);

  const isVisionModel = (name) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return VISION_MODELS.some(m => lower.includes(m));
  };

  // RETINA Smart Shift: Auto-switch to PRIMARY vision model when image is uploaded
  useEffect(() => {
    if (visionBuffer.length > 0 && !isVisionModel(selectedModelSingle)) {
      // Explicitly prioritize moondream as the primary Retina target
      const primaryVision = models.find(m => m.toLowerCase().includes("moondream")) || models.find(m => isVisionModel(m));
      if (primaryVision) {
        addLog(`RETINA: Smart Shift to ${primaryVision} for multimodal recognition`, "sys");
        setSelectedModelSingle(primaryVision);
      }
    }
  }, [visionBuffer, models]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingBlocks]);

  // Fetch all initial data
  useEffect(() => {
    // Models
    fetch(`${API}/models`)
      .then(r => r.json())
      .then(list => {
        setModels(list);
        if (list.length > 0) {
          setSelectedModelSingle(prev => prev || list[0]);
          setJudgePersonaId(prev => prev || list[0]);
        }
      })
      .catch(() => {
        setModels(["gemma4:e4b", "llama3.1:8b", "qwen2.5-coder:7b", "gemma2:2b"]);
        addLog("⚠️ SYSTEM_ADVISORY: Using model fail-safes.", "sys");
      });

    // Sessions
    fetch(`${API}/sessions`)
      .then(r => r.json())
      .then(data => {
        setSessions(data);
        if (data.length > 0 && !currentSession) {
          const lastSess = [...data].sort((a,b) => new Date(b.lastUpdate || b.createdAt) - new Date(a.lastUpdate || a.createdAt))[0];
          setCurrentSession(lastSess);
        }
      })
      .catch(e => console.error("Sessions fetch failed", e));

    // Personas
    fetch(`${API}/persona`).then(r => r.json()).then(setPersonas).catch(e => console.error("Personas fetch failed", e));

    // Scenarios
    fetch(`${API}/scenarios`).then(r => r.json()).then(setScenarios).catch(e => console.error("Scenarios fetch failed", e));

    // User Persona (Mirror)
    fetch(`${API}/user/persona`).then(r => r.json()).then(setUserPersona).catch(e => console.error("User persona fetch failed", e));

    // Synapse Presets
    fetch(`${API}/synapse/presets`).then(r => r.json()).then(setSynapsePresets).catch(() => setSynapsePresets([]));
  }, []);


  // Scenario Auto-Initialization
  useEffect(() => {
    if (interactionMode === "Scenario" && selectedScenarioId && !isStreaming) {
      const scenario = scenarios.find(s => s.id === selectedScenarioId);
      if (scenario && messages.length === 0) {
        setInput(scenario.initial_prompt);
      }
    }
  }, [selectedScenarioId, interactionMode, messages.length]);

  // Persona Auto-Sync Settings
  useEffect(() => {
    if (selectedPersonaId) {
      const p = personas.find(x => x.id === selectedPersonaId);
      if (p) {
        if (p.model) setSelectedModelSingle(p.model);
        if (p.voice) setSelectedVoice(p.voice);
      }
    }
  }, [selectedPersonaId, personas]);

  useEffect(() => {
    if (!currentSession?.id) return;
    fetch(`${API}/session/${currentSession.id}`)
      .then((r) => r.json())
      .then((s) => {
        setMessages(s.messages || []);
        setWebMode(!!s.webMode);
        setRagMode(!!s.ragMode);
        setInteractionMode(s.parallelMode ? "Parallel" : (s.interactionMode || "Normal"));
        setSelectedPersonaId(s.selectedPersonaId || "");
        setSelectedPersonaIds(s.selectedPersonaIds || []);
        setSelectedModelSingle(s.model || "gemma4:e4b");
        setSelectedVoice(s.selectedVoice || "male_us");
        setJudgePersonaId(s.judgePersonaId || s.model || "gemma4:e4b");
        fetchFiles(s.id);
        lastLoadedSessionId.current = s.id;
      })
      .catch(console.error);
  }, [currentSession?.id]);

  // Phase 30: Dropdown Auto-Close Control
  useEffect(() => {
    const handleOutside = (e) => {
      if (!e.target.closest('.header-module .control-group')) {
        setShowModelDropdown(false);
        setShowJudgeDropdown(false);
      }
    };
    if (showModelDropdown || showJudgeDropdown) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showModelDropdown, showJudgeDropdown]);

  // Phase 18: Poll for mood when persona is active
  useEffect(() => {
    if (!currentSession?.id || !selectedPersonaId) {
      setPersonaMood(null);
      return;
    }
    const fetchMood = () => {
      fetch(`${API}/session/${currentSession.id}/persona/${selectedPersonaId}/mood`)
        .then(r => r.json())
        .then(data => {
          setPersonaMood(data);
          setMoodHistory(prev => {
            const next = [...prev, { v: data.valence, a: data.arousal, ts: Date.now() }];
            return next.slice(-15); // Keep last 15 points
          });
        })
        .catch(() => { });
    };
    fetchMood();
    const interval = setInterval(fetchMood, 10000); // 10s poll
    return () => clearInterval(interval);
  }, [currentSession?.id, selectedPersonaId, messages.length]);

  const selectSession = (id) => {
    setMessages([]); // Clear immediately for isolation
    setCurrentSession({ id });
  };

  const fetchFiles = (sessionId) => {
    fetch(`${API}/session/${sessionId}/files`)
      .then((r) => r.json())
      .then(setSessionFiles)
      .catch(console.error);
  };

  const fetchSessionLogs = (sessionId) => {
    if (!sessionId) return;
    fetch(`${API}/session/${sessionId}/logs`)
      .then(r => r.json())
      .then(setLogs)
      .catch(console.error);
  };

  useEffect(() => {
    if (!currentSession?.id || activeTerminalTab !== "LOGS") return;
    const interval = setInterval(() => fetchSessionLogs(currentSession.id), 2000);
    return () => clearInterval(interval);
  }, [currentSession?.id, activeTerminalTab]);

  const autoRenameSession = async (sessionId, msgs) => {
    if (!msgs || msgs.length < 2) return;
    const firstUserMsg = msgs.find(m => m.role === "user");
    if (!firstUserMsg) return;

    if (titlingSessionsRef.current.has(sessionId)) return;
    titlingSessionsRef.current.add(sessionId);

    const prompt = `Generate a very short, concise 3-word title for a chat that starts with: "${firstUserMsg.content.substring(0, 100)}". Output ONLY the title, no quotes.`;

    try {
      const res = await fetch(`${API}/chat/action/generate-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: selectedModelSingle })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) renameSession(sessionId, data.title.trim());
      }
    } catch (e) {
      console.error("Auto-rename failed", e);
    } finally {
      // We don't remove from set here because we only want to TITLEX once per session lifetime
    }
  };

  useEffect(() => {
    const isDefaultTitle = currentSession?.title === "New Chat" || currentSession?.title === "Neural Link" || !currentSession?.title;
    if (currentSession && messages.length >= 2 && isDefaultTitle) {
      if (!titlingSessionsRef.current.has(currentSession.id)) {
        autoRenameSession(currentSession.id, messages);
      }
    }
  }, [messages.length, currentSession?.id, currentSession?.title]);





  const createSession = async () => {
    const res = await fetch(`${API}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webMode: false, parallelMode: false, selectedPersonaIds: [], ragMode: false }),
    });
    const data = await res.json();
    setSessions((s) => [...s, data]);
    setCurrentSession(data);
    setMessages([]);
  };

  const deleteSession = async (id) => {
    await fetch(`${API}/session/${id}`, { method: "DELETE" });
    setSessions((s) => s.filter((x) => x.id !== id));
    if (currentSession?.id === id) {
      setCurrentSession(null);
      setMessages([]);
    }
  };

  const deletePersona = async (id) => {
    await fetch(`${API}/persona/${id}`, { method: "DELETE" });
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    if (selectedPersonaId === id) setSelectedPersonaId("");
    if (editingPersona?.id === id) setEditingPersona(null);
  };

  const handleSavePersona = async () => {
    if (!forgeData.name || !forgeData.system_prompt) return;
    const method = editingPersona ? "PUT" : "POST";
    const url = editingPersona ? `${API}/persona/${editingPersona.id}` : `${API}/persona`;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forgeData),
    });

    if (res.ok) {
      const saved = await res.json();
      setPersonas(prev => editingPersona ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved]);
      setForgeSaveStatus("saved");
      setTimeout(() => setForgeSaveStatus("idle"), 3000);
      // Removed immediate closure to allow user to see success message
    }
  };

  const openForge = (persona = null) => {
    setEditingPersona(persona);
    if (persona) {
      setForgeData({
        name: persona.name,
        system_prompt: persona.system_prompt,
        goal: persona.goal,
        core_expertise: persona.core_expertise || "",
        personality_style: persona.personality_style || "",
        quirks: persona.quirks || "",
        rules: persona.rules || [""],
        traits: persona.traits || { curiosity: 0.6, empathy: 0.5, logic: 0.7, assertiveness: 0.5, playfulness: 0.4, patience: 0.6 },
        temperature: persona.temperature,
        top_p: persona.top_p,
        model: persona.model || "",
        voice: persona.voice || "",
        imageGeneration: persona.imageGeneration !== false,
        imageRetrieval: persona.imageRetrieval !== false,
        availableModes: persona.availableModes || ["Normal", "Parallel", "Debate", "Collaborate", "Pipeline", "Scenario"]
      });
    } else {
      setForgeData({
        name: "",
        system_prompt: "",
        goal: "",
        core_expertise: "",
        personality_style: "",
        quirks: "",
        rules: [""],
        traits: { curiosity: 0.6, empathy: 0.5, logic: 0.7, assertiveness: 0.5, playfulness: 0.4, patience: 0.6 },
        temperature: 0.7,
        top_p: 0.9,
        model: selectedModelSingle || "",
        voice: ""
      });
    }
    setShowPersonaForge(true);
  };


  const deleteScenario = async (id) => {
    await fetch(`${API}/scenarios/${id}`, { method: "DELETE" });
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    if (selectedScenarioId === id) setSelectedScenarioId("");
  };

  const handleSaveScenario = async () => {
    if (!forgeScenarioData.name || !forgeScenarioData.description) return;
    const res = await fetch(`${API}/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...forgeScenarioData, id: editingScenario?.id }),
    });

    if (res.ok) {
      const saved = await res.json();
      setScenarios(prev => editingScenario ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved]);
      setShowScenarioBuilder(false);
      setEditingScenario(null);
      setForgeScenarioData({
        name: "", description: "", initial_prompt: "", participant_roles: [""], world_rules: [""],
        personaMap: {}, hiddenIntents: {}, rag_mode: false, unrestricted_mode: false
      });
    }
  };

  const openScenarioBuilder = (scenario = null) => {
    if (scenario) {
      setEditingScenario(scenario);
      setForgeScenarioData({
        ...scenario,
        participant_roles: scenario.participant_roles?.length ? scenario.participant_roles : [""],
        world_rules: scenario.world_rules?.length ? scenario.world_rules : [""],
        personaMap: scenario.personaMap || {},
        hiddenIntents: scenario.hiddenIntents || {},
        rag_mode: !!scenario.rag_mode,
        unrestricted_mode: !!scenario.unrestricted_mode
      });
    } else {
      setEditingScenario(null);
      setForgeScenarioData({
        name: "", description: "", initial_prompt: "", participant_roles: [""], world_rules: [""],
        personaMap: {}, hiddenIntents: {}, rag_mode: false, unrestricted_mode: false
      });
    }
    setShowScenarioBuilder(true);
  };


  const renameSession = async (id, title) => {
    await fetch(`${API}/session/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSessions((s) => s.map((x) => (x.id === id ? { ...x, title } : x)));
    if (currentSession?.id === id) setCurrentSession(prev => ({ ...prev, title }));
  };


  const executeTool = async (toolName, args) => {
    addLog(`🛠️ ICARUS: Launching ${toolName}...`, "sys");
    try {
      const res = await fetch(`${API}/tools/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName, args }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        const errMsg = errorData.error || `HTTP_FAIL_${res.status}`;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE", time: new Date().toISOString() },
        ]);
        setIsStreaming(false);
        return;
      }

      const data = await res.json();
      if (res.ok) {
        addLog(`✅ TOOL_SUCCESS: ${toolName}`, "sys");
        return data.result;
      } else {
        addLog(`❌ TOOL_ERROR: ${data.error}`, "err");
        return `Error: ${data.error}`;
      }
    } catch (e) {
      addLog(`❌ EXCEPTION: ${e.message}`, "err");
      return `Exception: ${e.message}`;
    }
  };

  const handleManualTool = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const input = formData.get("toolText");
    if (!input) return;

    // Simple parser: tool args (e.g. list_dir {"dirPath": "."})
    const match = input.match(/^(\w+)\s*(.*)$/);
    if (!match) return addLog("INVALID_FORMAT: Use 'toolName argsJson'", "err");

    const [_, name, argsStr] = match;
    try {
      const args = argsStr ? JSON.parse(argsStr) : {};
      const result = await executeTool(name, args);
      addLog(`RESULT: ${result.toString().substring(0, 50)}${result.length > 50 ? "..." : ""}`, "sys");
    } catch (e) {
      addLog(`PARSE_ERROR: ${e.message}`, "err");
    }
    e.target.reset();
  };

  // persist settings per session
  useEffect(() => {
    if (!currentSession || lastLoadedSessionId.current !== currentSession.id) return;

    const payload = {
      webMode,
      parallelMode: interactionMode === "Parallel",
      ragMode,
      selectedPersonaIds: interactionMode === "Normal" ? [selectedPersonaId] : selectedPersonaIds,
      judgePersonaId,
      interactionMode, // Store this too
      selectedVoice,
      selectedPersonaId
    };
    fetch(`${API}/session/${currentSession.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(console.error);
  }, [webMode, interactionMode, ragMode, selectedPersonaIds, selectedPersonaId, selectedModelSingle, selectedVoice]);

  // ─── Voice Sync (STT & TTS via Local VOX) ───
  const startListening = async () => {
    if (isListening) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          // Decode WebM to raw 16kHz mono Float32Array natively in the browser
          const arrayBuffer = await audioBlob.arrayBuffer();
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const float32Array = audioBuffer.getChannelData(0);

          // Send raw bytes to server
          const floatBlob = new Blob([float32Array.buffer], { type: 'application/octet-stream' });
          const formData = new FormData();
          formData.append("audioFloat32", floatBlob, "audio.raw");

          addLog("TRANSCRIBING_AUDIO...", "sys");
          const res = await fetch(`${API}/audio/transcribe`, { method: "POST", body: formData });
          if (!res.ok) throw new Error("STT Failed on server");
          const { text } = await res.json();

          if (text.toLowerCase().startsWith("nexus") || text.toLowerCase().startsWith(" nexus")) {
            addLog(`VOICE_COMMAND: ${text}`, "sys");
            if (text.toLowerCase().includes("debate")) setInteractionMode("Debate");
            else if (text.toLowerCase().includes("collaborate")) setInteractionMode("Collaborate");
            else if (text.toLowerCase().includes("pipeline")) setInteractionMode("Pipeline");
            else if (text.toLowerCase().includes("parallel")) setInteractionMode("Parallel");
            else setInteractionMode("Normal");
          } else {
            setInput(prev => (prev + " " + text).trim());
          }
        } catch (e) {
          addLog(`STT_ERROR: ${e.message}`, "err");
        } finally {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      addLog("NEURAL_LINK: Listening...", "sys");
    } catch (err) {
      addLog(`MIC_ERROR: ${err.message}`, "err");
    }
  };

  const speakText = async (text, personaId = null, voiceOverride = null) => {
    addLog("SYNTHESIZING_VOICE...", "sys");
    try {
      let voiceToUse = voiceOverride || selectedVoice;
      if (personaId) {
        const p = personas.find(prev => prev.id === personaId);
        if (p?.voice) voiceToUse = p.voice;
      }

      const res = await fetch(`${API}/audio/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voiceToUse })
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const { audio: base64Audio } = await res.json();
      if (!base64Audio) throw new Error("Received empty audio data from server");

      // Convert base64 to Blob (efficiently)
      const binaryString = window.atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onplay = () => addLog("VOX_OUTPUT: Playing...", "sys");
      audio.onended = () => URL.revokeObjectURL(url);

      await audio.play().catch(e => {
        addLog(`PLAYBACK_ERROR: ${e.message}`, "err");
        console.warn("Audio playback was blocked or failed:", e);
        // Fallback: suggest user interaction if blocked
        if (e.name === "NotAllowedError") {
          addLog("ACTION_REQUIRED: Click anywhere to enable audio playback.", "sys");
        }
      });
    } catch (e) {
      addLog(`TTS_ERROR: ${e.message}`, "err");
    }
  };

  const fetchVectors = async () => {
    if (!currentSession) return;
    try {
      const res = await fetch(`${API}/session/${currentSession.id}/vectors`);
      const nodes = await res.json();
      setVectorNodes(nodes);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeTerminalTab === "NEURAL_MAP") fetchVectors();
  }, [activeTerminalTab, currentSession?.id]);

  const pushLocalMessage = (msg) => setMessages((prev) => [...prev, msg]);

  const addLog = (message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTerminalLogs(prev => [...prev.slice(-100), { id: Date.now() + Math.random(), time: timestamp, message, type }]);
    
    // Bridge to modular Log Stream (Phase 25)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nexus-agent-stream", { 
        detail: { type, content: message } 
      }));
    }
  };

  const dispatchStreamLog = (content, type = 'model-chunk') => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nexus-agent-stream", { 
        detail: { type, content } 
      }));
    }
  };

  const clearLogs = () => setTerminalLogs([]);

  const pinLogToMemory = async (log) => {
    if (!currentSession) return;
    const text = `${log.time} [${log.type.toUpperCase()}] ${log.message}`;
    try {
      const res = await fetch(`${API}/session/${currentSession.id}/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "Log Pin" }),
      });
      if (res.ok) addLog("LOG_PINNED: Injected into Shadow Memory", "sys");
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = async (e) => {
    if (!currentSession) return alert("Create a session first!");
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setUploadStatus("Uploading...");

    try {
      const res = await fetch(`${API}/upload/${currentSession.id}`, { method: "POST", body: formData });
      if (res.ok) {
        setUploadStatus(`Uploaded (${(file.size / 1024).toFixed(1)}KB)`);
        addLog(`FILE_UPLOAD: ${file.name} success`, "sys");
        fetchFiles(currentSession.id);
      } else {
        setUploadStatus("Upload failed");
      }
    } catch (err) {
      console.error(err);
      setUploadStatus("Error during upload");
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setVisionBuffer(prev => [...prev, reader.result]);
      addLog(`RETINA: Image override buffered.`, "sys");
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const deleteFile = async (diskName) => {
    if (!currentSession) return;
    try {
      const res = await fetch(`${API}/session/${currentSession.id}/file/${diskName}`, { method: "DELETE" });
      if (res.ok) {
        addLog(`FILE_DELETE: ${diskName}`, "sys");
        fetchFiles(currentSession.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ─── Shared SSE stream reader ───
  async function readEventStream(res, handler) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    const startTime = Date.now();
    let totalChars = 0;

    let lineBuffer = "";
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) {
        lineBuffer += decoder.decode(value, { stream: true });
        const parts = lineBuffer.split(/\r?\n/);
        // Keep the last partial line
        lineBuffer = parts.pop();

        for (const part of parts) {
          if (!part.trim()) continue;
          if (part.includes("[DONE]")) return;
          const cleaned = part.replace(/^data:\s*/, "");
          try {
            const obj = JSON.parse(cleaned);

            // 1. Intercept sources metadata
            if (obj.sources && Array.isArray(obj.sources)) {
              handler({ type: "sources", data: obj.sources });
              continue;
            }

            // 2. Process text content
            const content = obj.content || obj.response || (obj.message && obj.message.content);
            if (content) totalChars += content.length;

            // Calc TPS
            const elapsed = (Date.now() - startTime) / 1000;
            const tps = elapsed > 0 ? Math.round((totalChars / 4) / elapsed) : 0;
            setMetrics(prev => ({ ...prev, tps }));

            // Map obj so handlers don't break
            if (content && !obj.content) obj.content = content;
            handler(obj);
          } catch (e) {
            console.warn("SSE JSON parse error:", e, cleaned);
          }
        }
      }
    }
  }

  const handleMapWheel = (e) => {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const newScale = Math.max(0.1, Math.min(5, mapTransform.k + delta * zoomSpeed));
    setMapTransform(prev => ({ ...prev, k: newScale }));
  };

  const handleMapMouseDown = (e) => {
    if (e.button === 0) { // Left Click
      setIsDraggingMap(true);
      setMapHasMoved(false);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMapMouseMove = (e) => {
    if (isDraggingMap) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setMapHasMoved(true);
      }
      setMapTransform(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMapMouseUp = () => {
    setIsDraggingMap(false);
  };

  // ─── Send Message Controller ───
  const sendMessage = async (overridePrompt = null, isSpontaneous = false) => {
    const text = (overridePrompt || input).trim();
    const hasVision = visionBuffer.length > 0;

    if ((!text && !hasVision) || !currentSession || isStreaming) return;

    if (!isSpontaneous) {
      pushLocalMessage({ role: "user", content: text, time: new Date().toISOString() });
      setLastUserMessage({ content: text, time: new Date().toISOString() }); // Phase 26
      setInput("");
    } else {
      addLog(`SPONTANEOUS_TRIGGER: ${text.slice(0, 30)}...`, "sys");
    }

    setIsStreaming(true);
    setStreamingBlocks([]);

    addLog(`INIT_SESSION: ${currentSession.id.slice(0, 8)}`, "sys");
    addLog(`MODE_SET: ${interactionMode}${webMode ? " + WEB" : ""}${ragMode ? " + RAG" : ""}`, "sys");

    setPipelineStatus(null);
    setMetrics(prev => ({ ...prev, latency: 0, tokens: text.length }));

    try {
      switch (interactionMode) {
        case "Agent":
          await handleAgent(text);
          break;
        case "Parallel":
          await handleParallel(text);
          break;
        case "Debate":
          await handleDebate(text);
          break;
        case "Collaborate":
          await handleCollaborate(text);
          break;
        case "Pipeline":
          await handlePipeline(text);
          break;
        case "Scenario":
          await handleScenario(text);
          break;
        default:
          await handleNormal(text);
      }
    } catch (err) {
      console.error(err);
    }
    setIsStreaming(false);
    setStreamingBlocks([]);
  };

  const abortControllerRef = useRef(null);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      setStreamingBlocks([]);
      addLog("Generation stopped by user.", "sys");
    }
  };

  // ─── Normal single chat ───
  
  async function handleAgent(prompt) {
    const currentPersona = personas.find(p => p.id === selectedPersonaId);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nexus-agent-stream", { detail: { type: "system", msg: `Initializing Agent [Persona: ${currentPersona?.name || "System"}]...` } }));
    
    // Initialize AbortController for manual stop
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    let hangCheckInterval = null;

    try {
        hangCheckInterval = setInterval(() => {
            if (Date.now() - lastDataTime > 60000) { // 60s timeout
                console.warn("⏱️ Agent Stream Timeout: No data received for 60s. Aborting.");
                handleStopGeneration();
            }
        }, 5000);

        const response = await fetch(`${API}/agent/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({ 
                message: prompt, 
                model: selectedModelSingle, 
                sessionId: currentSession?.id,
                systemPrompt: currentPersona?.system_prompt || "You are an autonomous AI engineering agent. Use tools to solve the user request. Keep responses technical and concise.",
                persona: currentPersona,
                images: cleanImages
            })
        });
        setVisionBuffer([]);
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            lastDataTime = Date.now(); // Update heartbeat
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            
            for (let line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.replace("data: ", "").trim();
                    if (dataStr === "[DONE]") {
                        reader.cancel(); // Force close the reader
                        break;
                    }
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nexus-agent-stream", { detail: parsed }));
                        
                        if (parsed.type === "agent-status") {
                             setStreamingBlocks([{ label: "AGENT", content: `⚙️ ${parsed.msg}` }]);
                        }

                        if (parsed.type === "agent-final" || parsed.type === "agent-error") {
                             setStreamingBlocks([]);
                             setMessages(prev => [...prev, {
                                id: Date.now(),
                                role: "assistant",
                                content: parsed.content || parsed.text,
                                time: new Date().toLocaleTimeString()
                             }]);
                        }
                    } catch (e) {}
                }
            }
        }
    } catch(e) {
        if (e.name === 'AbortError') {
            console.log("Agent request aborted.");
        } else {
            console.error("Agent handle error:", e);
        }
    } finally {
        if (hangCheckInterval) clearInterval(hangCheckInterval);
        setIsStreaming(false);
        setStreamingBlocks([]);
    }
}


  async function handleNormal(prompt) {
    addLog(`START_STREAM: ${selectedModelSingle}`, "model");
    const startTime = Date.now();
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    let lastDataTime = Date.now();
    const hangCheckInterval = setInterval(() => {
        if (Date.now() - lastDataTime > 45000) { // 45s for normal chat
            console.warn("⏱️ Normal Stream Timeout: No data received for 45s. Aborting.");
            handleStopGeneration();
            clearInterval(hangCheckInterval);
        }
    }, 5000);

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    try {
        const res = await fetch(`${API}/chat/${currentSession.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            prompt,
            model: selectedModelSingle,
            webMode,
            ragMode,
            images: cleanImages,
            pinnedMemories,
            personaId: selectedPersonaId || null,
            unrestricted: unrestrictedMode,
          }),
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "STREAM_INITIALIZATION_CRASH" }));
          const errMsg = errorData.error || `OLLAMA_HTTP_${res.status}`;
          addLog(`❌ STREAM_ERROR: ${errMsg}`, "sys");
          pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE" });
          setVisionBuffer([]);
          return;
        }

        setVisionBuffer([]);
        setPinnedMemories([]); // Clear after send
        
        let buf = "";
        let thoughtBuf = "";
        let capturedSources = [];
        let firstChunk = true;
        let pendingTrigger = null;

        // Initial status pulse (Thinking heartbeat)
        const personaName = personas.find(p => p.id === selectedPersonaId)?.name || selectedModelSingle;
        setStreamingBlocks([{ label: personaName, content: "", thought: "Neural processing...", personaId: selectedPersonaId }]);

        await readEventStream(res, (obj) => {
          lastDataTime = Date.now(); // Heartbeat
          if (firstChunk) {
            setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
            firstChunk = false;
            setStreamingBlocks([]); // Clear the heartbeat once data arrives
          }
          if (obj.type === "status") {
            setStreamingBlocks([{ label: personaName, content: "", thought: obj.content, personaId: selectedPersonaId }]);
            return;
          }
          if (obj.type === "thought") {
            const content = obj.content ?? "";
            thoughtBuf += content;
            addLog(content, "thought");
            setStreamingBlocks([{ label: personaName, content: buf, thought: "Thinking...", personaId: selectedPersonaId }]);
            return;
          }
          if (obj.type === "sources") {
            capturedSources = obj.data;
            return;
          }
          if (obj.type === "trigger") {
            pendingTrigger = obj;
            return;
          }
          if (obj.type === "image") {
            const imgMark = `\n\n![Generated Image](${obj.content})\n\n`;
            buf += imgMark;
            dispatchStreamLog(`[IMAGE_GEN]`, 'model-chunk');
            setStreamingBlocks([{ label: personaName, content: buf, thought: thoughtBuf, personaId: selectedPersonaId }]);
            return;
          }
          const content = obj.content ?? "";
          buf += content;
          dispatchStreamLog(content, 'model-chunk');
          setMetrics(prev => ({ ...prev, tokens: prompt.length + buf.length }));
          setStreamingBlocks([{
            label: personaName,
            content: buf,
            thought: thoughtBuf,
            personaId: selectedPersonaId
          }]);
        });

        addLog(`END_STREAM: ${selectedModelSingle} (${buf.length} chars)`, "model");
        const finalContent = buf.trim() || `❌ RETINA_ERROR: Model [${selectedModelSingle}] returned an empty response.`;
        pushLocalMessage({ role: "assistant", content: finalContent, thought: thoughtBuf.trim(), model: selectedModelSingle, sources: capturedSources, personaId: selectedPersonaId });
        if (autoRead) speakText(finalContent, selectedPersonaId);

        if (pendingTrigger) {
          const trigger = pendingTrigger;
          addLog(`📡 REACTING: ${trigger.action} for ${trigger.personaId}`, "sys");
          setTimeout(() => {
            handleNormal(trigger.content); 
          }, 1500);
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log("Normal request aborted.");
        } else {
            console.error("Normal Chat Stream Failed:", e);
            addLog(`❌ NETWORK_OR_BACKEND_FAILURE: ${e.message}`, "err");
            pushLocalMessage({ role: "error", content: `❌ CONNECTION_FAILURE: ${e.message}. Ensure backend is running on :3008.`, model: "LOGOS_CORE" });
        }
    } finally {
        clearInterval(hangCheckInterval);
        abortControllerRef.current = null;
    }
  }

  // ─── Parallel ───
  async function handleParallel(prompt) {
    const ms = selectedPersonaIds.length ? selectedPersonaIds : [];
    if (!ms.length) {
      addLog("❌ PARALLEL_ERROR: No personas selected.", "err");
      setIsStreaming(false);
      return;
    }
    const buffers = {};
    ms.forEach((m) => (buffers[m] = ""));

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    const res = await fetch(`${API}/chat/parallel/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, personaIds: selectedPersonaIds, webMode, ragMode, images: cleanImages, pinnedMemories, unrestricted: unrestrictedMode }),
    });
    setPinnedMemories([]); // Clear after send

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "PARALLEL_STREAM_CRASH" }));
      const errMsg = errorData.error || `OLLAMA_HTTP_${res.status}`;
      addLog(`❌ PARALLEL_ERROR: ${errMsg}`, "sys");
      pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE" });
      setVisionBuffer([]);
      return;
    }

    setVisionBuffer([]);
    addLog(`START_PARALLEL: ${ms.join(", ")}`, "sys");
    const startTime = Date.now();
    let capturedSources = [];
    let firstChunk = true;
    await readEventStream(res, (obj) => {
      if (firstChunk) {
        setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
        firstChunk = false;
      }
      if (obj.type === "sources") {
        capturedSources = obj.data;
        return;
      }
      const m = obj.personaName || obj.model || "AI";
      const pId = obj.personaId || null;
      buffers[m] = { content: (buffers[m]?.content || "") + (obj.content ?? ""), personaId: pId };
      const totalChars = prompt.length + Object.values(buffers).reduce((a, b) => a + b.content.length, 0);
      setMetrics(prev => ({ ...prev, tokens: totalChars }));
      setStreamingBlocks(Object.entries(buffers).map(([label, data]) => ({ label, content: data.content, type: "parallel" })));
    });
    addLog(`END_PARALLEL: All streams complete`, "sys");
    Object.entries(buffers).forEach(([m, data]) =>
      pushLocalMessage({ role: `assistant-${m}`, content: data.content.trim(), model: m, sources: capturedSources, personaId: data.personaId })
    );
  }

  // ─── Debate mode (Judged) ───
  async function handleDebate(prompt) {
    const ms = selectedPersonaIds;
    if (ms.length < 2) {
      addLog("❌ DEBATE_ERROR: Select at least 2 personas for a debate.", "err");
      setIsStreaming(false);
      return;
    }
    if (ms.length < 2) {
      pushLocalMessage({ role: "system", content: "Debate mode requires at least 2 models." });
      return;
    }
    const blocks = [];
    let current = null;
    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    const res = await fetch(`${API}/chat/debate/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        personaIds: selectedPersonaIds,
        turns: debateTurns,
        judgePersonaId,
        images: cleanImages,
        pinnedMemories,
        unrestricted: unrestrictedMode
      }),
    });
    setPinnedMemories([]); // Clear after send

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "DEBATE_STREAM_CRASH" }));
      const errMsg = errorData.error || `OLLAMA_HTTP_${res.status}`;
      addLog(`❌ DEBATE_ERROR: ${errMsg}`, "sys");
      pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE" });
      setVisionBuffer([]);
      return;
    }

    setVisionBuffer([]);
    addLog(`START_DEBATE: ${ms.join(" vs ")}`, "sys");
    const startTime = Date.now();
    let capturedSources = [];
    let firstChunk = true;
    await readEventStream(res, (obj) => {
      if (firstChunk) {
        setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
        firstChunk = false;
      }
      if (obj.type === "sources") {
        capturedSources = obj.data;
        return;
      }
      if (obj.type === "turn-start") {
        addLog(`DEBATE_TURN_START: ${obj.personaName || obj.model}`, "model");
        setPipelineStatus({ stage: `Debate: ${obj.personaName || obj.model}`, current: obj.turn, total: debateTurns * ms.length + 1 });
        current = { label: obj.personaName || obj.model, model: obj.model, personaId: obj.personaId, turn: obj.turn, content: "", type: "debate" };
        blocks.push(current);
      } else if (obj.type === "turn-chunk" && current) {
        current.content += obj.content;
        dispatchStreamLog(obj.content, 'model-chunk');
        const totalChars = prompt.length + blocks.reduce((a, b) => a + (b.content?.length || 0), 0);
        setMetrics(prev => ({ ...prev, tokens: totalChars }));
        setStreamingBlocks([...blocks]);
      } else if (obj.type === "turn-end") {
        addLog(`DEBATE_TURN_END: ${obj.personaName || obj.model}`, "model");
        setStreamingBlocks([...blocks]);
      } else if (obj.type === "vote-judge-start") {
        addLog(`JUDGE_START: ${obj.personaName || obj.model}`, "model");
        setPipelineStatus({ stage: `Judging: ${obj.personaName || obj.model}`, current: debateTurns * 2 + 1, total: debateTurns * 2 + 1 });
        current = { label: `🏛 Judge Verdict`, model: obj.model, personaId: obj.personaId, content: "", type: "vote-judge" };
        blocks.push(current);
      } else if (obj.type === "vote-judge-chunk" && current) {
        current.content += obj.content;
        const totalChars = prompt.length + blocks.reduce((a, b) => a + (b.content?.length || 0), 0);
        setMetrics(prev => ({ ...prev, tokens: totalChars }));
        setStreamingBlocks([...blocks]);
      } else if (obj.type === "vote-judge-end") {
        addLog(`JUDGE_COMPLETE`, "model");
        setStreamingBlocks([...blocks]);
      }
    });
    addLog(`DEBATE_SESSION_COMPLETE`, "sys");
    if (blocks.length === 0 || blocks.every(b => !b.content.trim())) {
      pushLocalMessage({ role: "assistant", content: `❌ RETINA_ERROR: Debate failed to generate content. This usually happens if the vision encoder or judges crash.`, model: "LOGOS_CORE" });
      return;
    }
    blocks.forEach((b) => {
      if (b.type === "vote-judge") {
        pushLocalMessage({ role: "vote-judge", content: b.content.trim(), model: b.model, sources: capturedSources, personaId: b.personaId });
      } else {
        pushLocalMessage({ role: `debate-${b.model}`, content: b.content.trim(), model: b.model, turn: b.turn, sources: capturedSources, personaId: b.personaId });
      }
    });
  }

  // ─── Collaborate ───
  async function handleCollaborate(prompt) {
    const ms = selectedPersonaIds.length >= 2 ? selectedPersonaIds : [];
    if (ms.length < 2) {
      addLog("❌ COLLAB_ERROR: Select at least 2 personas for collaboration.", "err");
      setIsStreaming(false);
      return;
    }
    const stages = [];
    let currentStage = null;

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    const res = await fetch(`${API}/chat/collaborate/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, personaIds: selectedPersonaIds, webMode, ragMode, images: cleanImages, pinnedMemories, unrestricted: unrestrictedMode }),
    });
    setPinnedMemories([]); // Clear after send

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "COLLABORATE_STREAM_CRASH" }));
      const errMsg = errorData.error || `OLLAMA_HTTP_${res.status}`;
      addLog(`❌ COLLABORATE_ERROR: ${errMsg}`, "sys");
      pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errMsg}`, model: "LOGOS_CORE" });
      setVisionBuffer([]);
      return;
    }

    setVisionBuffer([]);
    const startTime = Date.now();
    let capturedSources = [];
    let firstChunk = true;
    await readEventStream(res, (obj) => {
      if (firstChunk) {
        setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
        firstChunk = false;
      }
      if (obj.type === "sources") {
        capturedSources = obj.data;
        return;
      }
      if (obj.type === "stage-start") {
        addLog(`COLLAB_STAGE_START: ${obj.stage} by ${obj.personaName || obj.model}`, "model");
        setPipelineStatus({ stage: `Collab: ${obj.personaName || obj.model} (${obj.stage})`, current: stages.length + 1, total: 3 });
        currentStage = { label: `${obj.stage}: ${obj.personaName || obj.model}`, model: obj.model, personaId: obj.personaId, stage: obj.stage, content: "", type: "collaborate" };
        stages.push(currentStage);
      } else if (obj.type === "stage-chunk" && currentStage) {
        currentStage.content += obj.content;
        dispatchStreamLog(obj.content, 'model-chunk');
        const totalChars = prompt.length + stages.reduce((a, b) => a + b.content.length, 0);
        setMetrics(prev => ({ ...prev, tokens: totalChars }));
        setStreamingBlocks([...stages]);
      } else if (obj.type === "stage-end") {
        addLog(`COLLAB_STAGE_COMPLETE: ${currentStage.stage}`, "model");
        setStreamingBlocks([...stages]);
      }
    });
    addLog(`COLLABORATION_COMPLETE`, "sys");
    if (stages.length === 0 || stages.every(s => !s.content.trim())) {
      pushLocalMessage({ role: "assistant", content: `❌ RETINA_ERROR: Collaboration pipeline returned empty. Ensure vision-capable models are selected.`, model: "LOGOS_CORE" });
      return;
    }
    stages.forEach((st) =>
      pushLocalMessage({ role: `collab-${st.stage.toLowerCase()}`, content: st.content.trim(), model: st.model, stage: st.stage, sources: capturedSources, personaId: st.personaId })
    );
  }

  // ─── Pipeline (SYNAPSE) ───
  async function handlePipeline(prompt) {
    addLog(`SYNAPSE: Initiating pipeline [${synapsePreset}]`, "sys");

    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);
    const res = await fetch(`${API}/chat/pipeline/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        prompt, 
        presetKey: synapsePreset, 
        webMode, 
        ragMode, 
        images: cleanImages, 
        pinnedMemories, 
        unrestricted: unrestrictedMode,
        personaIds: selectedPersonaIds
      }),
    });
    
    // Signal Check: Ensure the persona mind is being transmitted
    console.log(`🔌 LOGOS_SYNAPSE -> Initiating Assembly Line with Personas: ${selectedPersonaIds.length > 0 ? selectedPersonaIds.join(', ') : "NONE"}`);
    
    setPinnedMemories([]);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "PIPELINE_CRASH" }));
      addLog(`❌ PIPELINE_ERROR: ${errorData.error}`, "sys");
      pushLocalMessage({ role: "assistant", content: `❌ SYSTEM_FAILURE: ${errorData.error}`, model: "LOGOS_CORE" });
      setVisionBuffer([]);
      return;
    }

    setVisionBuffer([]);
    const startTime = Date.now();
    let firstChunk = true;
    const stages = [];
    let currentStage = null;

    await readEventStream(res, (obj) => {
      if (firstChunk) {
        setMetrics(prev => ({ ...prev, latency: Date.now() - startTime }));
        firstChunk = false;
      }
      if (obj.type === "pipeline-stage-start") {
        addLog(`PIPELINE_STAGE_START: ${obj.role} by ${obj.personaName || obj.model}`, "model");
        setPipelineStatus({ stage: `Synapse: ${obj.personaName || obj.model} (${obj.role})`, current: obj.stageIndex + 1, total: obj.totalStages });
        currentStage = { label: `${obj.role}: ${obj.personaName || obj.model}`, model: obj.model, role: obj.role, content: "", type: "pipeline", personaId: obj.personaId };
        stages.push(currentStage);
      } else if (obj.type === "pipeline-stage-chunk" && currentStage) {
        currentStage.content += obj.content;
        dispatchStreamLog(obj.content, 'model-chunk');
        const totalChars = prompt.length + stages.reduce((a, b) => a + b.content.length, 0);
        setMetrics(prev => ({ ...prev, tokens: totalChars }));
        setStreamingBlocks([...stages]);
      } else if (obj.type === "pipeline-stage-end") {
        addLog(`SYNAPSE_STAGE_COMPLETE: ${obj.role}`, "model");
        setStreamingBlocks([...stages]);
      }
    });

    addLog(`SYNAPSE_PIPELINE_COMPLETE`, "sys");
    setPipelineStatus(null);
    if (stages.length === 0 || stages.every(s => !s.content.trim())) {
      pushLocalMessage({ role: "assistant", content: `❌ SYNAPSE_ERROR: Pipeline returned empty. Check model availability.`, model: "LOGOS_CORE" });
      return;
    }
    stages.forEach((st) =>
      pushLocalMessage({ role: `pipeline-${st.role.toLowerCase()}`, content: st.content.trim(), model: st.model, stage: st.role })
    );
  }

  const togglePersonaSelection = (id) => {
    setSelectedPersonaIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Stale model selection functions removed (Persona-centric refactor)

  // ─── Scenario ───
  async function handleScenario(prompt) {
    if (!selectedScenarioId) return;
    const scenario = scenarios.find(s => s.id === selectedScenarioId);
    if (!scenario) return;

    addLog(`START_SCENARIO: ${scenario.name}`, "sys");
    const cleanImages = visionBuffer.map(img => img.includes("base64,") ? img.split("base64,")[1] : img);

    const res = await fetch(`${API}/chat/scenario/${currentSession.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        scenarioId: selectedScenarioId,
        personaMap: { ...personaMap, ...(scenario.personaMap || {}) }, // Scenario personas override manual ones
        webMode,
        ragMode: scenario.rag_mode ?? ragMode,
        images: cleanImages,
        unrestricted: scenario.unrestricted_mode ?? unrestrictedMode,
        hiddenIntents: { ...hiddenIntents, ...(scenario.hiddenIntents || {}) }, // Scenario intents override manual ones
        roleModelMap
      }),
    });

    if (!res.ok) {
      addLog(`❌ SCENARIO_ERROR: ${res.status}`, "sys");
      setVisionBuffer([]);
      return;
    }
    setVisionBuffer([]);

    setVisionBuffer([]);
    const roleBuffers = {};
    scenario.participant_roles.forEach(r => roleBuffers[r] = { content: "", thought: "", personaId: null });

    await readEventStream(res, (obj) => {
      if (obj.type === "scenario-role-start") {
        addLog(`ROLE_ACTIVATE: ${obj.role}`, "sys");
      }
      if (obj.role) {
        if (!roleBuffers[obj.role]) roleBuffers[obj.role] = { content: "", thought: "", personaId: obj.personaId };
        
        if (obj.type === "thought") {
          roleBuffers[obj.role].thought += obj.content;
        } else if (obj.content) {
          roleBuffers[obj.role].content += obj.content;
          dispatchStreamLog(obj.content, 'model-chunk');
        }

        setStreamingBlocks(Object.entries(roleBuffers)
          .filter(([_, data]) => data.content.length > 0 || data.thought.length > 0)
          .map(([role, data]) => ({ label: role, content: data.content, thought: data.thought, personaId: data.personaId }))
        );
      }
    });

    Object.entries(roleBuffers).forEach(([role, data]) => {
      if (data.content) {
        pushLocalMessage({
          role: `scenario-${role}`,
          content: data.content.trim(),
          thought: data.thought.trim(),
          model: role,
          personaId: data.personaId,
          isScenarioResponse: true
        });
      }
    });
    setIsStreaming(false);
  }

  const handleSnapshot = async () => {
    if (!currentSession) return;
    addLog(`TEMPORAL_SNAPSHOT: Initiating branch from "${currentSession.title}"...`, "sys");
    try {
      const res = await fetch(`${API}/session/${currentSession.id}/snapshot`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        // Force refresh session list and select new branch
        const sessionsRes = await fetch(`${API}/sessions`);
        const allSessions = await sessionsRes.json();
        setSessions(allSessions);
        const newSess = allSessions.find(s => s.id === data.id);
        if (newSess) setCurrentSession(newSess);
        addLog(`BRANCH_SUCCESS: Switched to timeline "${data.title}"`, "sys");
      }
    } catch (e) {
      addLog(`❌ BRANCH_ERROR: ${e.message}`, "err");
    }
  };

  const handleEvaluate = async () => {
    if (!currentSession) return;
    setIsEvaluating(true);
    setEvaluation(null);
    addLog(`NARRATIVE_AUDIT: Initiating AI evaluation of reality stream...`, "sys");
    try {
      const res = await fetch(`${API}/chat/evaluate/${currentSession.id}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setEvaluation(data);
        addLog(`AUDIT_COMPLETE: Fidelity Score ${data.fidelity || 'N/A'}/10`, "sys");
      }
    } catch (e) {
      addLog(`❌ EVAL_ERROR: ${e.message}`, "err");
    } finally {
      setIsEvaluating(false);
    }
  };

  // Phase 25: Memory Sync Handlers
  const handleSyncMemory = async () => {
    if (!selectedNode || selectedNode.type !== 'global') return;
    const globalIndex = selectedNode.id.split('-')[1];
    setIsSyncingMemory(true);
    addLog(null, `🧠 MEMORY_SYNC: Initiating uplink for index ${globalIndex}...`, "sys");
    try {
      const res = await fetch(`${API}/memory/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: globalIndex, text: editNodeText })
      });
      if (res.ok) {
        addLog(null, `✅ SYNC_COMPLETE: Vector stabilization successful.`, "sys");
        // Refresh vectors to show new position
        fetchVectors();
        setSelectedNode(null);
      } else {
        throw new Error("Sync failed at backend boundary");
      }
    } catch (e) {
      addLog(null, `❌ SYNC_ERROR: ${e.message}`, "err");
    } finally {
      setIsSyncingMemory(false);
    }
  };

  const handlePruneMemory = async () => {
    if (!selectedNode || selectedNode.type !== 'global') return;
    if (!window.confirm("CRITICAL: Pruning is irreversible. Confirm node deletion?")) return;

    const globalIndex = selectedNode.id.split('-')[1];
    addLog(null, `🔥 MEMORY_PRUNE: Deleting node ${globalIndex}...`, "sys");
    try {
      const res = await fetch(`${API}/memory/${globalIndex}`, { method: "DELETE" });
      if (res.ok) {
        addLog(null, `✅ PRUNE_SUCCESS: Node purged from neural substrate.`, "sys");
        fetchVectors();
        setSelectedNode(null);
      }
    } catch (e) {
      addLog(null, `❌ PRUNE_ERROR: ${e.message}`, "err");
    }
  };

  // Phase 26: Memory Wipe for Persona
  const handleWipePersonaMemory = async (personaId, personaName) => {
    if (!window.confirm(`☢️ CRITICAL: Wipe ALL memories for "${personaName}"? This is irreversible.`)) return;
    addLog(`☢️ MEMORY_WIPE: Initiating for persona ${personaId}...`, "sys");
    try {
      const res = await fetch(`${API}/memory/persona/${personaId}/wipe`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        addLog(`✅ WIPE_COMPLETE: ${data.wiped || 0} memory records purged.`, "sys");
        fetchVectors();
      } else {
        throw new Error(`HTTP_${res.status}`);
      }
    } catch (e) {
      addLog(`❌ WIPE_ERROR: ${e.message}`, "err");
    }
  };

  // Phase 26: Copy & Regenerate
  const handleCopyMessage = (content, msgId) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    });
  };

  const handleRegenerate = async () => {
    if (!lastUserMessage || isStreaming || isRegenerating) return;
    setIsRegenerating(true);
    addLog(`↺ REGEN: Replaying last transmission...`, 'sys');
    try {
      await sendMessage(lastUserMessage.content);
    } finally {
      setIsRegenerating(false);
    }
  };

  const needsMultiModel = ["Parallel", "Debate", "Collaborate", "Pipeline"].includes(interactionMode);

  // Phase 26: Resize handlers
  const startSidebarResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev) => setSidebarWidth(Math.max(160, Math.min(400, startW + ev.clientX - startX)));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startDiagnosticsResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = diagnosticsWidth;
    const onMove = (ev) => setDiagnosticsWidth(Math.max(220, Math.min(600, startW - (ev.clientX - startX))));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ─── Helpers ───
  function getMessageMeta(msg) {
    const r = msg.role;
    if (r === "user") return { css: "user-msg", label: "YOU//" };
    if (r === "system") return { css: "sys-msg", label: "SYS//" };
    if (r === "error") return { css: "error-msg", label: "ERROR//" };

    const persona = msg.personaId ? personas.find(p => p.id === msg.personaId) : null;
    const resolvedName = persona ? persona.name : msg.model;

    if (r === "assistant") {
      const name = resolvedName || "ASSISTANT";
      return { css: "ai assistant-msg", label: name.toUpperCase() + "//" };
    }
    if (r.startsWith("assistant-") || r.startsWith("parallel-")) {
      const rawName = r.replace("assistant-", "").replace("parallel-", "");
      const name = persona ? persona.name : (resolvedName || rawName);
      return { css: "ai assistant-msg", label: name.toUpperCase() + "//" };
    }
    if (r.startsWith("debate-")) {
      const name = persona?.name || resolvedName || "AI";
      return { css: "ai assistant-msg", label: `⚔️ ${name} [TURN_${msg.turn || ""}]//` };
    }
    if (r.startsWith("collab-")) {
      const stageName = r.split("-")[1].toUpperCase();
      const name = persona ? ` (${persona.name})` : "";
      return { css: `ai collab-msg ${r}`, label: `COLLAB_${stageName}${name}//` };
    }
    if (r.startsWith("pipeline-")) {
      const name = persona?.name || resolvedName || "AI";
      return { css: "ai assistant-msg", label: `⚡ ${msg.stage || r.replace("pipeline-", "")} [${name}]//` };
    }
    if (r.startsWith("vote-answer-")) {
      const name = persona?.name || resolvedName || "AI";
      return { css: "ai assistant-msg", label: `🗳 ${name}//` };
    }
    if (r === "vote-judge") {
      const name = persona?.name || resolvedName || "AI";
      return { css: "ai system-msg", label: `🏛 JUDGE [${name}]//` };
    }
    if (r.startsWith("scenario-")) {
      const roleName = r.replace("scenario-", "").toUpperCase();
      const name = persona?.name || resolvedName || "AI";
      return { css: "ai system-msg", label: `🛰️ ${roleName} [${name}]//` };
    }

    return { css: "ai assistant-msg", label: r.toUpperCase() + "//" };
  }

  // ─── Render ───
  return (
    <div className={`app-container${darkMode ? ' dark-mode' : ''}`}>
      {/* Scan-line overlay */}
      <div className="scanline-overlay" />

      {activeView !== 'agent-desk' && (
        <ChatSidebar
          sessions={sessions}
          currentSession={currentSession}
          selectSession={selectSession}
          createSession={createSession}
          renameSession={renameSession}
          deleteSession={deleteSession}
          sessionFiles={sessionFiles}
          deleteFile={deleteFile}
          setShowUserProfile={setShowUserProfile}
          setShowPersonaForge={setShowPersonaForge}
          sidebarWidth={sidebarWidth}
        />
      )}

      {/* Sidebar resize gutter — hidden in agent desk */}
      {activeView !== 'agent-desk' && (
        <div className="resize-gutter resize-gutter-left" onMouseDown={startSidebarResize} title="Drag to resize sidebar" />
      )}

      <main className="chat-area">
        {/* ─── Header / Controls (hidden in Agent Desk) ─── */}
        {activeView !== 'agent-desk' && (
          <ChatHeader
            interactionMode={interactionMode}
            setInteractionMode={setInteractionMode}
            setAgentTerminalActive={setAgentTerminalActive}
            INTERACTION_MODES={INTERACTION_MODES}
            MODE_DESCRIPTIONS={MODE_DESCRIPTIONS}
            selectedPersonaId={selectedPersonaId}
            setSelectedPersonaId={setSelectedPersonaId}
            personas={personas}
            showModelDropdown={showModelDropdown}
            setShowModelDropdown={setShowModelDropdown}
            currentSession={currentSession}
            personaMood={personaMood}
            needsMultiModel={needsMultiModel}
            selectedPersonaIds={selectedPersonaIds}
            togglePersonaSelection={togglePersonaSelection}
            debateTurns={debateTurns}
            setDebateTurns={setDebateTurns}
            DEBATE_TURN_OPTIONS={DEBATE_TURN_OPTIONS}
            judgePersonaId={judgePersonaId}
            setJudgePersonaId={setJudgePersonaId}
            showJudgeDropdown={showJudgeDropdown}
            setShowJudgeDropdown={setShowJudgeDropdown}
            selectedScenarioId={selectedScenarioId}
            setSelectedScenarioId={setSelectedScenarioId}
            scenarios={scenarios}
            openScenarioBuilder={openScenarioBuilder}
            simulationChaos={simulationChaos}
            setSimulationChaos={setSimulationChaos}
            sendMessage={sendMessage}
            handleSnapshot={handleSnapshot}
            handleEvaluate={handleEvaluate}
            isEvaluating={isEvaluating}
            selectedModelSingle={selectedModelSingle}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            isVisionModel={isVisionModel}
            handleImageUpload={handleImageUpload}
            webMode={webMode}
            setWebMode={setWebMode}
            ragMode={ragMode}
            setRagMode={setRagMode}
            unrestrictedMode={unrestrictedMode}
            setUnrestrictedMode={setUnrestrictedMode}
            handleFileUpload={handleFileUpload}
            uploadStatus={uploadStatus}
            activeView={activeView}
            setActiveView={setActiveView}
          />
        )}

        {/* ─── Main View: Chat or Agent Desk ─── */}
        {activeView === 'agent-desk' ? (
          <AgentDesk
            personas={personas}
            API={API}
            darkMode={darkMode}
            onExit={() => setActiveView('chat')}
            activeSession={currentSession}
          />
        ) : (
          <>
            <ChatInterface
              currentSession={currentSession}
              messages={messages}
              getMessageMeta={getMessageMeta}
              selectedPersonaId={selectedPersonaId}
              personaMood={personaMood}
              isStreaming={isStreaming}
              streamingBlocks={streamingBlocks}
              messagesEndRef={messagesEndRef}
              setExpandedImage={setExpandedImage}
              API_BASE={API_BASE}
              speakText={speakText}
              copiedMsgId={copiedMsgId}
              handleCopyMessage={handleCopyMessage}
              handleRegenerate={handleRegenerate}
              isRegenerating={isRegenerating}
              pinnedMemories={pinnedMemories}
              setPinnedMemories={setPinnedMemories}
              visionBuffer={visionBuffer}
              setVisionBuffer={setVisionBuffer}
            />
            <ChatInput
              isStreaming={isStreaming}
              input={input}
              setInput={setInput}
              sendMessage={sendMessage}
              isListening={isListening}
              startListening={startListening}
              handleStopGeneration={handleStopGeneration}
              visionBuffer={visionBuffer}
              setVisionBuffer={setVisionBuffer}
            />
          </>
        )}
      </main>
      {/* Diagnostics resize gutter + Right panel — hidden in agent desk */}
      {activeView !== 'agent-desk' && (
        <div className="resize-gutter resize-gutter-right" onMouseDown={startDiagnosticsResize} title="Drag to resize diagnostics" />
      )}

      {activeView !== 'agent-desk' && (
        <aside className="neural-sidebar right-panel" style={{ width: diagnosticsWidth, minWidth: diagnosticsWidth, borderLeft: '2px solid var(--border)', borderRight: 'none', overflowY: 'auto' }}>
        <div className="right-panel-tabs">
          <button 
            type="button"
            className={`panel-tab ${activeTerminalTab === 'LOGS' ? 'active' : ''}`}
            onClick={() => setActiveTerminalTab('LOGS')}
          >
            LIVE_LOGS
          </button>
          <button 
            type="button"
            className={`panel-tab ${activeTerminalTab === 'NEURAL_MAP' ? 'active' : ''}`}
            onClick={() => setActiveTerminalTab('NEURAL_MAP')}
          >
            NEURAL_MAP
          </button>
        </div>


        {activeTerminalTab === 'NEURAL_MAP' ? (
          <NeuralMap
            vectorNodes={vectorNodes}
            pinnedMemories={pinnedMemories}
            personaMood={personaMood}
            heatmapEnabled={heatmapEnabled}
            selectedNode={selectedNode}
            onNodeSelect={setSelectedNode}
            editNodeText={editNodeText}
            setEditNodeText={setEditNodeText}
            isSyncingMemory={isSyncingMemory}
            handleSyncMemory={handleSyncMemory}
            handlePruneMemory={handlePruneMemory}
            setPinnedMemories={setPinnedMemories}
          />
        ) : (
          <div className="logs-container-restored" style={{ flex: 1, minHeight: 0 }}>
            <TerminalHub 
              isVisible={true} 
              isIntegrated={true}
              toggleVisibility={() => {}} 
              diagnosticsWidth={diagnosticsWidth}
            />
          </div>
        )}
        
        <div className="panel-decor-strip"></div>
        <SystemHUD 
          sysStats={sysStats} 
          onOpenDbManager={() => setShowDbManager(true)}
        />
        <MetricsPanel metrics={metrics} isStreaming={isStreaming} />
        <IcarusToolBelt handleManualTool={handleManualTool} />
      </aside>
      )}

      {/* --- PERSONA FORGE MODAL (MANAGER OVERHAUL) --- */}
      <PersonaForge
        showPersonaForge={showPersonaForge}
        setShowPersonaForge={setShowPersonaForge}
        forgeTab={forgeTab}
        setForgeTab={setForgeTab}
        personas={personas}
        editingPersona={editingPersona}
        openForge={openForge}
        deletePersona={deletePersona}
        forgeData={forgeData}
        setForgeData={setForgeData}
        models={models}
        setModels={setModels}
        API={API}
        addLog={addLog}
        handleSavePersona={handleSavePersona}
        forgeSaveStatus={forgeSaveStatus}
        handleWipePersonaMemory={handleWipePersonaMemory}
        moodHistory={moodHistory}
        setMoodHistory={setMoodHistory}
        sessionId={currentSession?.id}
      />


      {/* --- SCENARIO BUILDER MODAL --- */}
      <ScenarioBuilder
        showScenarioBuilder={showScenarioBuilder}
        setShowScenarioBuilder={setShowScenarioBuilder}
        editingScenario={editingScenario}
        forgeScenarioData={forgeScenarioData}
        setForgeScenarioData={setForgeScenarioData}
        personas={personas}
        handleSaveScenario={handleSaveScenario}
        deleteScenario={deleteScenario}
      />

      {/* Narrative Evaluation Overlay */}
      <NarrativeEvaluation
        evaluation={evaluation}
        setEvaluation={setEvaluation}
      />

      {/* --- USER PROFILE MODAL (Phase 14) --- */}
      <UserProfile
        showUserProfile={showUserProfile}
        setShowUserProfile={setShowUserProfile}
        userPersona={userPersona}
        setUserPersona={setUserPersona}
        API={API}
        addLog={addLog}
      />
      {/* Image Expansion Modal */}
      {expandedImage && (
        <div className="modern-modal-overlay" onClick={() => setExpandedImage(null)}>
          <div className="expanded-image-wrapper" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setExpandedImage(null)}>✕</button>
            <img src={expandedImage} alt="Expanded" className="expanded-image" />
          </div>
        </div>
      )}

      {/* --- NEURAL_DATA_ARCHITECT (SQLite CRUD) --- */}
      {showDbManager && (
        <NeuralDatabaseManager onClose={() => setShowDbManager(false)} API={API} />
      )}
    </div>
  );
}



