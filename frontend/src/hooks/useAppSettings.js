import { useState, useEffect, useCallback } from 'react';

const API_BASE = "http://127.0.0.1:3008/api";

/**
 * useAppSettings - Centralized hook for persistent app configuration.
 * Implements "Lazy Migration": reads from backend SQLite, falls back to localStorage.
 */
export function useAppSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Failed to fetch settings from backend:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /**
   * getSetting - Retrieves a setting value with fallback logic.
   * Priority: SQLite State -> LocalStorage -> Default
   */
  const getSetting = (key, defaultValue) => {
    // 1. Check if we have it in our synchronized state (from SQLite)
    if (settings[key] !== undefined) {
      return settings[key];
    }

    // 2. Fallback to LocalStorage (Legacy / Local-only)
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      try {
        return JSON.parse(legacy);
      } catch {
        return legacy;
      }
    }

    // 3. Return default
    return defaultValue;
  };

  /**
   * updateSetting - Persists a setting to SQLite and updates local state.
   */
  const updateSetting = async (key, value) => {
    // Optimistic Update
    setSettings(prev => ({ ...prev, [key]: value }));

    try {
      await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      
      // Also update localStorage for immediate availability on refresh (redundancy)
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (err) {
      console.error(`Failed to update setting ${key}:`, err);
    }
  };

  return {
    settings,
    loading,
    getSetting,
    updateSetting,
    refresh: fetchSettings
  };
}
