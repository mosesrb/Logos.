import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(db) {
    return new Promise((resolve, reject) => {
        // Enforce foreign keys globally
        db.exec("PRAGMA foreign_keys = ON;", (err) => {
            if (err) return reject(new Error("Failed to enable foreign keys: " + err.message));

            // Create migrations ledger if it doesn't exist
            db.exec(`
                CREATE TABLE IF NOT EXISTS migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `, (err) => {
                if (err) return reject(new Error("Failed to create migrations table: " + err.message));

                db.all("SELECT version FROM migrations", (err, rows) => {
                    if (err) return reject(err);

                    const appliedVersions = new Set(rows.map(r => r.version));
                    const migrationsDir = path.join(__dirname, 'migrations');
                    
                    if (!fs.existsSync(migrationsDir)) {
                        return resolve(); // No migrations directory
                    }

                    const files = fs.readdirSync(migrationsDir).sort();
                    
                    let promiseChain = Promise.resolve();

                    files.forEach(file => {
                        const match = file.match(/^(\d+)_.*\.sql$/);
                        if (match) {
                            const version = parseInt(match[1], 10);
                            if (!appliedVersions.has(version)) {
                                promiseChain = promiseChain.then(() => applyMigration(db, version, file, path.join(migrationsDir, file)));
                            }
                        }
                    });

                    promiseChain.then(resolve).catch(reject);
                });
            });
        });
    });
}

function applyMigration(db, version, name, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`🚀 SQLITE: Applying migration v${version}: ${name}`);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        db.exec("BEGIN TRANSACTION;", (err) => {
            if (err) return reject(err);
            
            db.exec(sql, (err) => {
                if (err) {
                    db.exec("ROLLBACK;", () => {
                        console.error(`❌ SQLITE: Migration v${version} failed. Rolled back.`);
                        reject(err);
                    });
                    return;
                }
                
                db.run("INSERT INTO migrations (version, name) VALUES (?, ?)", [version, name], (err) => {
                    if (err) {
                        db.exec("ROLLBACK;", () => {
                            console.error(`❌ SQLITE: Failed to record migration v${version}. Rolled back.`);
                            reject(err);
                        });
                        return;
                    }
                    
                    db.exec("COMMIT;", (err) => {
                        if (err) reject(err);
                        else {
                            console.log(`✅ SQLITE: Migration v${version} applied successfully.`);
                            resolve();
                        }
                    });
                });
            });
        });
    });
}
