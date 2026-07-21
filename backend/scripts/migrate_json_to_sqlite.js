import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncPersona, syncSession, syncMessage, syncRelationship } from '../services/dbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const SESSIONS_DIR = path.join(__dirname, '../sessions');
const CHATS_DIR = path.join(__dirname, '../chats');
const PERSONAS_PATH = path.join(DATA_DIR, 'personas.json');
const RELATIONSHIPS_PATH = path.join(DATA_DIR, 'relationships.json');
const GLOBAL_MEMORY_PATH = path.join(DATA_DIR, 'global_episodic_memory.json');

export async function runJsonMigration(db) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("🔄 LÓGOS: Checking for legacy JSON files to migrate to SQLite...");
            let migratedAnything = false;

            // 1. Migrate Personas
            if (fs.existsSync(PERSONAS_PATH)) {
                console.log("   -> Migrating personas.json...");
                const data = JSON.parse(fs.readFileSync(PERSONAS_PATH, 'utf8'));
                if (data.personas) {
                    for (const p of data.personas) {
                        await syncPersona(p);
                    }
                }
                fs.renameSync(PERSONAS_PATH, PERSONAS_PATH + '.legacy.bak');
                migratedAnything = true;
            }

            // 2. Migrate Relationships
            if (fs.existsSync(RELATIONSHIPS_PATH)) {
                console.log("   -> Migrating relationships.json...");
                const data = JSON.parse(fs.readFileSync(RELATIONSHIPS_PATH, 'utf8'));
                for (const [personaId, relData] of Object.entries(data)) {
                    await syncRelationship(personaId, relData);
                }
                fs.renameSync(RELATIONSHIPS_PATH, RELATIONSHIPS_PATH + '.legacy.bak');
                migratedAnything = true;
            }

            // 3. Migrate Sessions and Chats
            if (fs.existsSync(CHATS_DIR)) {
                const files = fs.readdirSync(CHATS_DIR);
                let chatMigrated = false;
                for (const f of files) {
                    if (f.endsWith('.json') && !f.endsWith('.legacy.bak')) {
                        const chatPath = path.join(CHATS_DIR, f);
                        const chatData = JSON.parse(fs.readFileSync(chatPath, 'utf8'));
                        
                        // Insert session
                        await syncSession({
                            id: chatData.id,
                            title: chatData.title,
                            updatedAt: chatData.updatedAt || new Date().toISOString(),
                            summary: chatData.summary || ""
                        });

                        // Insert messages
                        if (chatData.messages) {
                            for (const msg of chatData.messages) {
                                await syncMessage(msg, chatData.id);
                            }
                        }

                        fs.renameSync(chatPath, chatPath + '.legacy.bak');
                        chatMigrated = true;
                    }
                }
                if (chatMigrated) {
                    console.log(`   -> Migrated chats in ${CHATS_DIR}`);
                    migratedAnything = true;
                }
            }

            // 4. Migrate Global Memory
            if (fs.existsSync(GLOBAL_MEMORY_PATH)) {
                console.log("   -> Migrating global_episodic_memory.json...");
                const data = JSON.parse(fs.readFileSync(GLOBAL_MEMORY_PATH, 'utf8'));
                for (const mem of data) {
                    await new Promise((res, rej) => {
                        db.run(
                            `INSERT INTO GlobalMemory (session_id, role, text, vector_json, source) VALUES (?, ?, ?, ?, ?)`,
                            [mem.session_id || null, mem.role || 'user', mem.text, JSON.stringify(mem.vector || []), mem.source || 'legacy_migration'],
                            (err) => err ? rej(err) : res()
                        );
                    });
                }
                fs.renameSync(GLOBAL_MEMORY_PATH, GLOBAL_MEMORY_PATH + '.legacy.bak');
                migratedAnything = true;
            }

            if (migratedAnything) {
                console.log("✅ LÓGOS: JSON to SQLite migration complete.");
            } else {
                console.log("✅ LÓGOS: No legacy JSON files needed migration.");
            }
            resolve();
        } catch (e) {
            console.error("❌ SQLITE: JSON Migration failed:", e.message);
            reject(e);
        }
    });
}
