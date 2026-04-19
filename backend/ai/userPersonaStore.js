/**
 * userPersonaStore.js
 * Manages the persistent profile of the user.
 */

import fs from 'fs';
import path from 'path';

const USER_PERSONA_PATH = path.join(process.cwd(), 'backend', 'data', 'user_persona.json');

const defaultUserPersona = {
  profile: {
    communication_style: "balanced",
    prefers_depth: true,
    tone_preference: "neutral"
  },
  goals: []
};

/**
 * Loads the user persona profile.
 */
export function loadUserPersona() {
  try {
    if (fs.existsSync(USER_PERSONA_PATH)) {
      return JSON.parse(fs.readFileSync(USER_PERSONA_PATH, 'utf8'));
    }
  } catch (e) {
    console.error("❌ USER_PERSONA: Failed to load profile:", e.message);
  }
  return { ...defaultUserPersona };
}

/**
 * Saves the user persona profile.
 * @param {Object} persona - The user persona object.
 */
export function saveUserPersona(persona) {
  try {
    const dir = path.dirname(USER_PERSONA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USER_PERSONA_PATH, JSON.stringify(persona, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error("❌ USER_PERSONA: Failed to save profile:", e.message);
    return false;
  }
}
