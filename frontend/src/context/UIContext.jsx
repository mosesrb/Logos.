import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAppSettings } from '../hooks/useAppSettings';

const UIContext = createContext();

export function UIProvider({ children }) {
  const { getSetting, updateSetting, loading: settingsLoading } = useAppSettings();

  // Layout & Theming
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [diagnosticsWidth, setDiagnosticsWidth] = useState(360);
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'agent-desk'
  const [scrollLock, setScrollLock] = useState(true);

  // Modes
  const [interactionMode, setInteractionMode] = useState("Normal");
  const [webMode, setWebMode] = useState(false);
  const [ragMode, setRagMode] = useState(false);
  const [unrestrictedMode, setUnrestrictedMode] = useState(false);
  
  // UI Toggles & Dropdowns
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showJudgeDropdown, setShowJudgeDropdown] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showPersonaForge, setShowPersonaForge] = useState(false);
  const [showScenarioBuilder, setShowScenarioBuilder] = useState(false);
  const [forgeTab, setForgeTab] = useState("settings"); // "settings" | "history"
  const [activeTerminalTab, setActiveTerminalTab] = useState("LOGS");

  // Sync with DB settings on load
  useEffect(() => {
    if (!settingsLoading) {
      setDarkMode(getSetting('parthenope_dark', true));
      setSidebarWidth(getSetting('parthenope_sidebar_w', 240));
      setDiagnosticsWidth(getSetting('parthenope_diag_w', 360));
    }
  }, [settingsLoading, getSetting]);

  // Wrappers to update settings persistently
  const toggleDarkMode = (newVal) => {
    setDarkMode(newVal);
    updateSetting('parthenope_dark', newVal);
  };
  
  const updateSidebarWidth = (newVal) => {
    setSidebarWidth(newVal);
    updateSetting('parthenope_sidebar_w', newVal);
  };

  const updateDiagnosticsWidth = (newVal) => {
    setDiagnosticsWidth(newVal);
    updateSetting('parthenope_diag_w', newVal);
  };

  const value = {
    darkMode, toggleDarkMode,
    sidebarWidth, updateSidebarWidth,
    diagnosticsWidth, updateDiagnosticsWidth,
    activeView, setActiveView,
    scrollLock, setScrollLock,
    interactionMode, setInteractionMode,
    webMode, setWebMode,
    ragMode, setRagMode,
    unrestrictedMode, setUnrestrictedMode,
    showModelDropdown, setShowModelDropdown,
    showJudgeDropdown, setShowJudgeDropdown,
    heatmapEnabled, setHeatmapEnabled,
    showUserProfile, setShowUserProfile,
    showPersonaForge, setShowPersonaForge,
    showScenarioBuilder, setShowScenarioBuilder,
    forgeTab, setForgeTab,
    activeTerminalTab, setActiveTerminalTab
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
