import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runMigrations } from '../database/migrations.js';
import { runJsonMigration } from '../scripts/migrate_json_to_sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../../backend/database/logos.db');
const SCHEMA_PATH = path.join(__dirname, '../../backend/database/schema.sql');
const SEED_PATH = path.join(__dirname, '../../backend/data/personas.json');
const SEED_TEMPLATE_PATH = path.join(__dirname, '../../backend/data/personas.seed.json');

export const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("❌ SQLITE: Database connection failed:", err.message);
    } else {
        console.log("✅ SQLITE: Connected to logos.db");
        initDatabase();
    }
});

function initDatabase() {
    try {
        db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;", async (pragmaErr) => {
            if (pragmaErr) console.error("❌ SQLITE: Failed to set WAL mode:", pragmaErr.message);
            
            try {
                await runMigrations(db);
                console.log("✅ SQLITE: Migrations applied successfully");
                await runJsonMigration(db);
                await seedPersonasIfNeeded();
            } catch (err) {
                console.error("❌ SQLITE: Failed to apply migrations:", err.message);
            }
        });
    } catch (e) {
        console.error("❌ SQLITE: Error initializing database:", e.message);
    }
}

async function seedPersonasIfNeeded() {
    try {
        const seedFile = fs.existsSync(SEED_PATH) ? SEED_PATH : SEED_TEMPLATE_PATH;
        if (!fs.existsSync(seedFile)) return;

        const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
        if (!seedData || !seedData.personas) return;

        const count = await getSingle("SELECT COUNT(*) as count FROM Personas");
        const isEmpty = !count || count.count === 0;

        if (isEmpty) {
            // First-time seed: insert all from JSON
            console.log(`🌱 LÓGOS: Seeding initial personas from ${path.basename(seedFile)}...`);
            for (const p of seedData.personas) {
                await syncPersona(p);
            }
            console.log(`✅ LÓGOS: Seeded ${seedData.personas.length} personas.`);
        } else {
            // Always resync to backfill any missing metadata fields (idempotent via INSERT OR REPLACE)
            console.log(`🔄 LÓGOS: Re-syncing ${seedData.personas.length} personas from JSON to backfill metadata...`);
            for (const p of seedData.personas) {
                await syncPersona(p);
            }
        }
    } catch (err) {
        console.error("⚠️ LÓGOS_SEED_ERROR:", err.message);
    }
}

// Promisified write query helper
export function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// Promisified multi-row select helper
export function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Promisified single-row select helper
export function getSingle(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// ─── Neural Sync Helpers (Dual-Write Bridge) ───

/** Synchronize a Persona entry */
export async function syncPersona(p) {
    if (!p || typeof p !== 'object') {
        console.warn("⚠️ [DBSync] Skipped sync: Persona is null or invalid.");
        return;
    }

    const sql = `INSERT INTO Personas (id, name, description, system_prompt, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, system_prompt=excluded.system_prompt, updated_at=excluded.updated_at, metadata=excluded.metadata`;
    const metadata = JSON.stringify({
        // Core behavior
        goal: p.goal || "",
        rules: p.rules || [],
        traits: p.traits || {},
        temperature: typeof p.temperature === 'number' ? p.temperature : 0.7,
        top_p: typeof p.top_p === 'number' ? p.top_p : 0.9,
        // Model & voice bindings
        model: p.model || "",
        voice: p.voice || "",
        // Mode availability
        availableModes: p.availableModes || ["Normal", "Agent", "Parallel", "Debate", "Collaborate", "Pipeline", "Scenario"],
        // Extended profile fields (previously lost on DB round-trip)
        core_expertise: p.core_expertise || "",
        personality_style: p.personality_style || "",
        quirks: p.quirks || "",
        imageGeneration: p.imageGeneration !== false,
        imageRetrieval: p.imageRetrieval !== false,
    });
    
    return runQuery(sql, [
        p.id, 
        p.name || "Unnamed Persona", 
        p.description || "", 
        p.system_prompt || "", 
        p.updatedAt || new Date().toISOString(), 
        metadata
    ]);
}

/** Synchronize a Session entry */
export async function syncSession(s) {
    const sql = `INSERT INTO Sessions (id, title, updated_at, summary) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at, summary=excluded.summary`;
    return runQuery(sql, [s.id, s.title || "Untitled Session", s.updatedAt || new Date().toISOString(), s.summary || ""]);
}

/** Synchronize a single Message */
export async function syncMessage(msg, sessionId) {
    const sql = `INSERT INTO Messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id, role=excluded.role, content=excluded.content, timestamp=excluded.timestamp`;
    const id = msg.id || `${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return runQuery(sql, [id, sessionId, msg.role, content, msg.time || new Date().toISOString()]);
}

/** Synchronize Relationship data */
export async function syncRelationship(relKey, data) {
    const personaId = relKey.includes("_") ? relKey.split("_")[1] : relKey;
    const sql = `INSERT INTO Relationships (id, persona_id, trust_level, notes, last_interaction) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET persona_id=excluded.persona_id, trust_level=excluded.trust_level, notes=excluded.notes, last_interaction=excluded.last_interaction`;
    return runQuery(sql, [relKey, personaId, data.trust || 50, data.notes || "", data.last_interaction || new Date().toISOString()]);
}

/** Synchronize Visual Memory */
export async function syncVisualMemory(img) {
    const sql = `INSERT INTO VisualMemory (image_id, persona_id, file_name, url, embedding_json, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(image_id) DO UPDATE SET persona_id=excluded.persona_id, file_name=excluded.file_name, url=excluded.url, embedding_json=excluded.embedding_json, metadata_json=excluded.metadata_json, created_at=excluded.created_at`;
    return runQuery(sql, [
        img.image_id, 
        img.persona, 
        img.file_name, 
        img.url, 
        JSON.stringify(img.embedding || []), 
        JSON.stringify(img.metadata || {}), 
        img.created_at || new Date().toISOString()
    ]);
}

/** Settings Management */
export async function upsertSetting(key, value) {
    const sql = `INSERT INTO Settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`;
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    return runQuery(sql, [key, valStr]);
}

export async function getSetting(key) {
    const row = await getSingle(`SELECT value FROM Settings WHERE key = ?`, [key]);
    if (!row) return null;
    try {
        return JSON.parse(row.value);
    } catch {
        return row.value;
    }
}

export async function getAllSettings() {
    const rows = await getQuery(`SELECT key, value FROM Settings`);
    const settings = {};
    rows.forEach(r => {
        try {
            settings[r.key] = JSON.parse(r.value);
        } catch {
            settings[r.key] = r.value;
        }
    });
    return settings;
}

/** ─── Data Access Getters ─── */

export async function getPersonas() {
    const rows = await getQuery("SELECT * FROM Personas");
    return rows.map(r => {
        let meta = {};
        try { meta = JSON.parse(r.metadata || '{}'); } catch(e) {}
        return {
            id: r.id,
            name: r.name,
            description: r.description,
            system_prompt: r.system_prompt,
            updatedAt: r.updated_at,
            ...meta
        };
    });
}

export async function getPersona(id) {
    const r = await getSingle("SELECT * FROM Personas WHERE id = ?", [id]);
    if (!r) return null;
    let meta = {};
    try { meta = JSON.parse(r.metadata || '{}'); } catch(e) {}
    return {
        id: r.id,
        name: r.name,
        description: r.description,
        system_prompt: r.system_prompt,
        updatedAt: r.updated_at,
        ...meta
    };
}

export async function getSessions() {
    const rows = await getQuery("SELECT * FROM Sessions ORDER BY updated_at DESC");
    const sessionsDict = {};
    rows.forEach(r => {
        sessionsDict[r.id] = {
            id: r.id,
            title: r.title,
            updatedAt: r.updated_at,
            summary: r.summary
        };
    });
    return sessionsDict;
}

export async function getSession(id) {
    const r = await getSingle("SELECT * FROM Sessions WHERE id = ?", [id]);
    if (!r) return null;
    
    const msgs = await getQuery("SELECT * FROM Messages WHERE session_id = ? ORDER BY timestamp ASC", [id]);
    
    return {
        id: r.id,
        title: r.title,
        updatedAt: r.updated_at,
        summary: r.summary,
        messages: msgs.map(m => {
            let content = m.content;
            try { 
                if (content.startsWith('{') || content.startsWith('[')) {
                    content = JSON.parse(content);
                }
            } catch(e) {}
            return {
                id: m.id,
                role: m.role,
                content: content,
                time: m.timestamp
            };
        })
    };
}

export async function getRelationships() {
    const rows = await getQuery("SELECT * FROM Relationships");
    const rels = {};
    rows.forEach(r => {
        rels[`user_${r.persona_id}`] = {
            trust: r.trust_level,
            notes: r.notes,
            last_interaction: r.last_interaction
        };
    });
    return rels;
}

export async function getRelationship(personaId) {
    const r = await getSingle("SELECT * FROM Relationships WHERE persona_id = ?", [personaId]);
    if (!r) return { trust: 50, notes: "", last_interaction: "" };
    return {
        trust: r.trust_level,
        notes: r.notes,
        last_interaction: r.last_interaction
    };
}
