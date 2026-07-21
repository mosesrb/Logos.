import { getSession, getPersonas, getPersona, getRelationships, getRelationship, syncSession, syncPersona, syncMessage, syncRelationship, runQuery } from "../services/dbService.js";
/**
 * databaseController.js — Phase 1 hardened
 *
 * The generic table editor is intentionally unavailable unless
 * ENABLE_DATABASE_ADMIN_API=true is set for a non-production diagnostic session.
 * All SQL identifiers (table names, column names) are validated against a
 * compile-time allowlist to prevent identifier injection.
 */
import fs from "fs";
import path from "path";
import { getQuery } from "../services/dbService.js";
import { createBackup, exportDataAsJson } from "../services/backupService.js";
// ─── Identifier Allowlist (W-07) ─────────────────────────────────────────────

/**
 * Tables that the admin API may touch, mapped to their primary key column name.
 * Any table not listed here will be rejected with 400 TABLE_NOT_ALLOWED.
 */
const ALLOWED_TABLES = new Map([
  ["Sessions",      "id"],
  ["Messages",      "id"],
  ["Personas",      "id"],
  ["Settings",      "key"],
  ["GlobalMemory",  "id"],
  ["Relationships", "id"],
  ["VisualMemory",  "image_id"],
]);

/** Column names must be plain identifiers — no semicolons, quotes, spaces, or SQL keywords. */
const SAFE_COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * Throws a 400-tagged error if the table is not in the allowlist.
 * @param {string} table
 */
export function assertTableAllowed(table) {
  if (typeof table !== "string" || !ALLOWED_TABLES.has(table)) {
    const err = new Error("TABLE_NOT_ALLOWED");
    err.status = 400;
    throw err;
  }
}

/**
 * Throws a 400-tagged error if the column name contains unsafe characters.
 * @param {string} col
 */
export function assertColumnSafe(col) {
  if (typeof col !== "string" || !SAFE_COLUMN_RE.test(col)) {
    const err = new Error("INVALID_COLUMN_NAME");
    err.status = 400;
    throw err;
  }
}

// ─── Route Setup ─────────────────────────────────────────────────────────────

export function setupDatabaseRoutes(app, context) {
  const databaseAdminEnabled = true; // Enabled for development testing

  // Phase 3: Backup and Recovery Endpoints (Available independently of Admin API)
  app.post("/api/db/backup", async (req, res) => {
    try {
      const backupPath = await createBackup();
      res.json({ success: true, backupPath });
    } catch (e) {
      res.status(500).json({ error: "Backup failed: " + e.message });
    }
  });

  app.get("/api/db/export", async (req, res) => {
    try {
      const data = await exportDataAsJson();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Export failed: " + e.message });
    }
  });

  // The generic table editor bypasses all domain validation and persistence
  // invariants. It is intentionally unavailable unless explicitly enabled for
  // a non-production diagnostic session.
  if (!databaseAdminEnabled) {
    app.use("/api/db", (req, res) => {
      res.status(404).json({ error: "DATABASE_ADMIN_API_DISABLED" });
    });
    return;
  }

  const {
    CHATS_DIR,
    GLOBAL_MEMORY_PATH,
    GLOBAL_IMAGE_INDEX_PATH,
    PERSONA_MEMORY_PERSONAS_DIR,
    getChatPath,
    personas,
    savePersonas,
    relationships,
    saveRelationships
  } = context;

  // List all tables
  app.get("/api/db/tables", async (req, res) => {
    try {
      const tables = await getQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      res.json(tables.map(t => t.name));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Fetch table data with pagination support
  app.get("/api/db/data/:table", async (req, res) => {
    const { table } = req.params;
    const limit  = parseInt(req.query.limit)  || 100;
    const offset = parseInt(req.query.offset) || 0;

    try {
      assertTableAllowed(table);

      // 1. Get the actual data
      const data = await getQuery(`SELECT * FROM ${table} LIMIT ? OFFSET ?`, [limit, offset]);

      // 2. Get total count
      const countResult = await getQuery(`SELECT COUNT(*) as total FROM ${table}`);
      const total = countResult[0]?.total || 0;

      // 3. Auto-detect Primary Key via PRAGMA
      const schema  = await getQuery(`PRAGMA table_info(${table})`);
      const pkField = schema.find(c => c.pk === 1)?.name || (data.length > 0 ? Object.keys(data[0])[0] : null);

      res.json({ data, total, pk: pkField, schema });
    } catch (e) {
      const status = e.status || 500;
      res.status(status).json({ error: e.message });
    }
  });

  // Update/Modify record cell
  app.post("/api/db/update", async (req, res) => {
    const { table, idField, idValue, updates } = req.body;
    if (!table || !idField || !idValue || !updates) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    try {
      assertTableAllowed(table);
      assertColumnSafe(idField);
      // Validate every column being updated
      for (const key of Object.keys(updates)) {
        assertColumnSafe(key);
      }

      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(", ");
      const values    = [...Object.values(updates), idValue];
      await runQuery(`UPDATE ${table} SET ${setClause} WHERE ${idField} = ?`, values);
      res.json({ success: true });
    } catch (e) {
      const status = e.status || 500;
      res.status(status).json({ error: e.message });
    }
  });

  // Insert new record
  app.post("/api/db/insert", async (req, res) => {
    const { table, data } = req.body;
    if (!table || !data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No data provided for insertion." });
    }

    try {
      assertTableAllowed(table);
      for (const key of Object.keys(data)) {
        assertColumnSafe(key);
      }

      const fields       = Object.keys(data).join(", ");
      const placeholders = Object.keys(data).map(() => "?").join(", ");
      const values       = Object.values(data);

      await runQuery(`INSERT INTO ${table} (${fields}) VALUES (${placeholders})`, values);
      res.json({ success: true });
    } catch (e) {
      const status = e.status || 500;
      console.error(`[DB_INSERT_ERROR] Table: ${table}`, e);
      let errorMsg = e.message;
      if (e.message.includes("UNIQUE constraint failed")) {
        errorMsg = "Constraint violation: Record with this ID already exists.";
      } else if (e.message.includes("NOT NULL constraint failed")) {
        errorMsg = "Constraint violation: Required fields missing.";
      }
      res.status(status).json({ error: errorMsg });
    }
  });

  // Delete record or clear table
  app.delete("/api/db/delete/:table", async (req, res) => {
    const { table }             = req.params;
    const { idField, idValue, all } = req.query;

    try {
      assertTableAllowed(table);

      if (all === "true") {
        await runQuery(`DELETE FROM ${table}`);
        // Special: Handle JSON cleanup if purging all
        if (table === "Sessions") {
          const files = fs.readdirSync(CHATS_DIR);
          files.forEach(f => {
            if (f.endsWith(".json") && f !== "global_episodic_memory.json") {
              fs.unlinkSync(path.join(CHATS_DIR, f));
            }
          });
        } else if (table === "GlobalMemory") {
          fs.writeFileSync(GLOBAL_MEMORY_PATH, "[]", "utf8");
        }
        return res.json({ success: true, message: "Table purged." });
      }

      if (!idField || !idValue) return res.status(400).json({ error: "Missing ID" });
      assertColumnSafe(idField);
      await runQuery(`DELETE FROM ${table} WHERE ${idField} = ?`, [idValue]);

      // ─── Dual-Delete Synchronization ───
      if (table === "Sessions") {
        const chatPath = getChatPath(idValue);
        if (fs.existsSync(chatPath)) fs.unlinkSync(chatPath);
      } else if (table === "VisualMemory") {
        // Find the image and delete it from disk and index
        const index = JSON.parse(fs.readFileSync(GLOBAL_IMAGE_INDEX_PATH, "utf8"));
        const img   = index.find(i => i.image_id === idValue);
        if (img) {
          const personaId = img.persona;
          const fullPath  = path.join(PERSONA_MEMORY_PERSONAS_DIR, personaId, "images", img.file_name);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          const filteredIndex = index.filter(i => i.image_id !== idValue);
          fs.writeFileSync(GLOBAL_IMAGE_INDEX_PATH, JSON.stringify(filteredIndex, null, 2), "utf8");
        }
      }

      res.json({ success: true });
    } catch (e) {
      const status = e.status || 500;
      res.status(status).json({ error: e.message });
    }
  });
}
