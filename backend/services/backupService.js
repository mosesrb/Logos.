import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, runQuery } from './dbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.join(__dirname, '../../backend/data/backups');

if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export async function createBackup() {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUPS_DIR, `logos_backup_${timestamp}.db`);
        
        // Use VACUUM INTO for safe online backup (supported in SQLite 3.27+)
        db.run(`VACUUM INTO ?`, [backupFile], (err) => {
            if (err) {
                console.error("❌ SQLITE BACKUP: Failed", err);
                return reject(err);
            }
            console.log(`✅ SQLITE BACKUP: Successfully created at ${backupFile}`);
            pruneOldBackups();
            resolve(backupFile);
        });
    });
}

function pruneOldBackups() {
    const MAX_BACKUPS = 7;
    try {
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('logos_backup_') && f.endsWith('.db'))
            .map(f => ({ name: f, path: path.join(BACKUPS_DIR, f), time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time); // newest first

        if (files.length > MAX_BACKUPS) {
            const toDelete = files.slice(MAX_BACKUPS);
            toDelete.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️ Pruned old backup: ${file.name}`);
                } catch(e) {
                    console.error(`❌ Failed to prune backup ${file.name}:`, e.message);
                }
            });
        }
    } catch(e) {
        console.error("❌ BACKUP PRUNE ERROR:", e.message);
    }
}

export async function exportDataAsJson() {
    // Generate a complete JSON dump of critical tables
    const sessions = await runQuery("SELECT * FROM Sessions");
    const messages = await runQuery("SELECT * FROM Messages");
    const personas = await runQuery("SELECT * FROM Personas");
    const relationships = await runQuery("SELECT * FROM Relationships");
    const globalMemory = await runQuery("SELECT * FROM GlobalMemory");

    // Reconstruct nested structure if needed, or just return flat
    return {
        timestamp: new Date().toISOString(),
        version: "1.0",
        data: {
            sessions,
            messages,
            personas,
            relationships,
            globalMemory
        }
    };
}
