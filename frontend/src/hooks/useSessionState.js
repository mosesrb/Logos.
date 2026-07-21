import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../services/apiClient.js";

export function useSessionState({ selectedModelSingle }) {
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  
  // These could be lifted or kept here, as they are tightly bound to a session
  const [sessionFiles, setSessionFiles] = useState([]);
  const [webMode, setWebMode] = useState(false);
  const [ragMode, setRagMode] = useState(false);
  const [interactionMode, setInteractionMode] = useState("Normal");
  
  const lastLoadedSessionId = useRef(null);
  const titlingSessionsRef = useRef(new Set());

  // Initial fetch of sessions
  useEffect(() => {
    apiFetch("/sessions")
      .then(data => {
        setSessions(data);
        if (data.length > 0 && !currentSession) {
          const lastSess = [...data].sort((a,b) => new Date(b.lastUpdate || b.createdAt) - new Date(a.lastUpdate || a.createdAt))[0];
          setCurrentSession(lastSess);
        }
      })
      .catch(e => console.error("Sessions fetch failed", e));
  }, []); // Run once on mount

  // Load session data when currentSession changes
  useEffect(() => {
    if (!currentSession?.id) return;
    
    apiFetch(`/session/${currentSession.id}`)
      .then((s) => {
        setMessages(s.messages || []);
        setWebMode(!!s.webMode);
        setRagMode(!!s.ragMode);
        setInteractionMode(s.parallelMode ? "Parallel" : (s.interactionMode || "Normal"));
        fetchFiles(s.id);
        lastLoadedSessionId.current = s.id;
      })
      .catch(console.error);
  }, [currentSession?.id]);

  const fetchFiles = useCallback((sessionId) => {
    apiFetch(`/session/${sessionId}/files`)
      .then(setSessionFiles)
      .catch(console.error);
  }, []);

  const selectSession = useCallback((id) => {
    setMessages([]); // Clear immediately for isolation
    setCurrentSession({ id });
  }, []);

  const createSession = useCallback(async () => {
    try {
      const data = await apiFetch("/session", {
        method: "POST",
        body: JSON.stringify({ webMode: false, parallelMode: false, selectedPersonaIds: [], ragMode: false }),
      });
      setSessions((s) => [...s, data]);
      setCurrentSession(data);
      setMessages([]);
    } catch (e) {
      console.error("Failed to create session", e);
    }
  }, []);

  const deleteSession = useCallback(async (id) => {
    try {
      await apiFetch(`/session/${id}`, { method: "DELETE" });
      setSessions((s) => s.filter((x) => x.id !== id));
      if (currentSession?.id === id) {
        setCurrentSession(null);
        setMessages([]);
      }
    } catch (e) {
      console.error("Failed to delete session", e);
    }
  }, [currentSession]);

  const renameSession = useCallback(async (id, title) => {
    try {
      await apiFetch(`/session/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setSessions((s) => s.map((x) => (x.id === id ? { ...x, title } : x)));
      if (currentSession?.id === id) setCurrentSession(prev => ({ ...prev, title }));
    } catch (e) {
      console.error("Failed to rename session", e);
    }
  }, [currentSession]);

  const autoRenameSession = useCallback(async (sessionId, msgs) => {
    if (!msgs || msgs.length < 2) return;
    const firstUserMsg = msgs.find(m => m.role === "user");
    if (!firstUserMsg) return;

    if (titlingSessionsRef.current.has(sessionId)) return;
    titlingSessionsRef.current.add(sessionId);

    const prompt = `Generate a very short, concise 3-word title for a chat that starts with: "${firstUserMsg.content.substring(0, 100)}". Output ONLY the title, no quotes.`;

    try {
      const res = await apiFetch("/chat/action/generate-title", {
        method: "POST",
        body: JSON.stringify({ prompt, model: selectedModelSingle })
      });
      if (res.title) {
        renameSession(sessionId, res.title.trim());
      }
    } catch (e) {
      console.error("Auto-rename failed", e);
    }
  }, [selectedModelSingle, renameSession]);

  // Auto-rename logic
  useEffect(() => {
    const isDefaultTitle = currentSession?.title === "New Chat" || currentSession?.title === "Neural Link" || !currentSession?.title;
    if (currentSession && messages.length >= 2 && isDefaultTitle) {
      if (!titlingSessionsRef.current.has(currentSession.id)) {
        autoRenameSession(currentSession.id, messages);
      }
    }
  }, [messages.length, currentSession, autoRenameSession]);

  return {
    sessions,
    setSessions,
    currentSession,
    setCurrentSession,
    messages,
    setMessages,
    sessionFiles,
    setSessionFiles,
    webMode,
    setWebMode,
    ragMode,
    setRagMode,
    interactionMode,
    setInteractionMode,
    selectSession,
    createSession,
    deleteSession,
    renameSession
  };
}
