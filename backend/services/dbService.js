import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        db.exec(schema, async (err) => {
            if (err) {
                console.error("❌ SQLITE: Failed to apply schema:", err.message);
            } else {
                console.log("✅ SQLITE: Schema initialized successfully");
                await seedPersonasIfNeeded();
            }
        });
    } catch (e) {
        console.error("❌ SQLITE: Error reading schema file:", e.message);
    }
}

async function seedPersonasIfNeeded() {
    try {
        const count = await getSingle("SELECT COUNT(*) as count FROM Personas");
        if (count && count.count === 0) {
            // Use generated personas.json from setup, fall back to template if setup hasn't run
            const seedFile = fs.existsSync(SEED_PATH) ? SEED_PATH : SEED_TEMPLATE_PATH;
            console.log(`🌱 LÓGOS: Seeding initial personas from ${path.basename(seedFile)}...`);
            const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
            if (seedData && seedData.personas) {
                for (const p of seedData.personas) {
                    await syncPersona(p);
                }
                console.log(`✅ LÓGOS: Seeded ${seedData.personas.length} personas.`);
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

    const sql = `INSERT OR REPLACE INTO Personas (id, name, description, system_prompt, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?)`;
    const metadata = JSON.stringify({
        goal: p.goal || "",
        rules: p.rules || [],
        traits: p.traits || {},
        temperature: typeof p.temperature === 'number' ? p.temperature : 0.7,
        top_p: typeof p.top_p === 'number' ? p.top_p : 0.9,
        model: p.model || "",
        voice: p.voice || "",
        availableModes: p.availableModes || ["Normal"]
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
    const sql = `INSERT OR REPLACE INTO Sessions (id, title, updated_at, summary) VALUES (?, ?, ?, ?)`;
    return runQuery(sql, [s.id, s.title || "Untitled Session", s.updatedAt || new Date().toISOString(), s.summary || ""]);
}

/** Synchronize a single Message */
export async function syncMessage(msg, sessionId) {
    const sql = `INSERT OR REPLACE INTO Messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`;
    const id = msg.id || `${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return runQuery(sql, [id, sessionId, msg.role, content, msg.time || new Date().toISOString()]);
}

/** Synchronize Relationship data */
export async function syncRelationship(personaId, data) {
    const sql = `INSERT OR REPLACE INTO Relationships (persona_id, trust_level, notes, last_interaction) VALUES (?, ?, ?, ?)`;
    return runQuery(sql, [personaId, data.trust || 50, data.notes || "", data.last_interaction || new Date().toISOString()]);
}

/** Synchronize Visual Memory */
export async function syncVisualMemory(img) {
    const sql = `INSERT OR REPLACE INTO VisualMemory (image_id, persona_id, file_name, url, embedding_json, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
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
