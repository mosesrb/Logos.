import { useState, useEffect } from "react";

export function useUIState() {
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'agent-desk'
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('parthenope_dark') === 'true');
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('parthenope_sidebar_w') || '240'));
  const [diagnosticsWidth, setDiagnosticsWidth] = useState(() => parseInt(localStorage.getItem('parthenope_diag_w') || '360'));
  const [activeTerminalTab, setActiveTerminalTab] = useState("LOGS");
  const [scrollLock, setScrollLock] = useState(true);
  
  // Modals and Dropdowns
  const [showDbManager, setShowDbManager] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showPersonaForge, setShowPersonaForge] = useState(false);
  const [showScenarioBuilder, setShowScenarioBuilder] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showJudgeDropdown, setShowJudgeDropdown] = useState(false);

  // Phase 26: Dark Mode persistence
  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode);
    localStorage.setItem('parthenope_dark', darkMode.toString());
  }, [darkMode]);

  // Phase 26: Panel size persistence
  useEffect(() => {
    localStorage.setItem('parthenope_sidebar_w', sidebarWidth.toString());
  }, [sidebarWidth]);
  
  useEffect(() => {
    localStorage.setItem('parthenope_diag_w', diagnosticsWidth.toString());
  }, [diagnosticsWidth]);

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

  return {
    activeView, setActiveView,
    darkMode, setDarkMode,
    sidebarWidth, setSidebarWidth,
    diagnosticsWidth, setDiagnosticsWidth,
    activeTerminalTab, setActiveTerminalTab,
    scrollLock, setScrollLock,
    showDbManager, setShowDbManager,
    showUserProfile, setShowUserProfile,
    showPersonaForge, setShowPersonaForge,
    showScenarioBuilder, setShowScenarioBuilder,
    showModelDropdown, setShowModelDropdown,
    showJudgeDropdown, setShowJudgeDropdown
  };
}
