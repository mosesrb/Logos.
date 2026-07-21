import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../services/dbService.js';
import fs from 'fs';
import path from 'path';

describe('dbService', () => {
    it('creates database files', () => {
        const dbPath = path.resolve('database', 'logos.db');
        expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('enables WAL mode for concurrency', () => {
        return new Promise((resolve, reject) => {
            db.get("PRAGMA journal_mode;", (err, row) => {
                if (err) return reject(err);
                expect(row.journal_mode.toLowerCase()).toBe('wal');
                resolve();
            });
        });
    });

    it('has the required core schema tables', () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, rows) => {
                if (err) return reject(err);
                const tableNames = rows.map(r => r.name);
                expect(tableNames).toContain('Personas');
                expect(tableNames).toContain('Sessions');
                expect(tableNames).toContain('Messages');
                expect(tableNames).toContain('Settings');
                resolve();
            });
        });
    });
});
