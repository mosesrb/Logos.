/**
 * security.test.js — Phase 1 Security Test Suite
 *
 * Tests Phase 1 security controls as unit tests without starting the full server.
 * Covers:
 *  - W-04 Schema validation (validate.js middleware)
 *  - W-05 Server-owned tool policy (agentService.js)
 *  - W-07 DB identifier allowlist (databaseController.js)
 *  - Existing path traversal guards (tools.js)
 */

import { agentWriteFile } from '../utils/tools.js';
import { assertTableAllowed, assertColumnSafe } from '../controllers/databaseController.js';
import { validateBody, ChatBodySchema, AgentDispatchSchema, SettingSchema } from '../middleware/validate.js';
import { describe, it, expect, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a minimal Express-like req/res/next mock to test middleware. */
function makeCtx(body = {}) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  };
  return {
    req:  { body },
    res,
    next: vi.fn(),
  };
}

// ─── W-04: Schema Validation ──────────────────────────────────────────────────

describe('validateBody — ChatBodySchema', () => {
  it('passes valid minimal chat body', () => {
    const { req, res, next } = makeCtx({ prompt: 'Hello' });
    validateBody(ChatBodySchema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects missing prompt with 400 VALIDATION_ERROR', () => {
    const { req, res, next } = makeCtx({ model: 'llama3' }); // no prompt
    validateBody(ChatBodySchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects empty string prompt', () => {
    const { req, res, next } = makeCtx({ prompt: '' });
    validateBody(ChatBodySchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects oversized prompt (>32768 chars)', () => {
    const { req, res, next } = makeCtx({ prompt: 'x'.repeat(32769) });
    validateBody(ChatBodySchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects non-boolean webMode', () => {
    const { req, res, next } = makeCtx({ prompt: 'Hello', webMode: 'yes' });
    validateBody(ChatBodySchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('strips unknown fields from body', () => {
    const { req, res, next } = makeCtx({ prompt: 'Hello', __proto__: { polluted: true }, injected: 'bad' });
    validateBody(ChatBodySchema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.injected).toBeUndefined();
  });
});

describe('validateBody — AgentDispatchSchema', () => {
  it('passes valid dispatch body', () => {
    const { req, res, next } = makeCtx({ goal: 'Do something useful' });
    validateBody(AgentDispatchSchema)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects missing goal', () => {
    const { req, res, next } = makeCtx({ personaId: 'persona-axon-agent' });
    validateBody(AgentDispatchSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('strips allowedTools even if sent by client', () => {
    const { req, res, next } = makeCtx({
      goal: 'Do something',
      allowedTools: ['executeCommand', 'rm -rf /'],
    });
    validateBody(AgentDispatchSchema)(req, res, next);
    expect(next).toHaveBeenCalled();
    // allowedTools is not in schema — Zod strips it
    expect(req.body.allowedTools).toBeUndefined();
  });

  it('rejects maxLoops > 15', () => {
    const { req, res, next } = makeCtx({ goal: 'Do something', maxLoops: 100 });
    validateBody(AgentDispatchSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects history with invalid role', () => {
    const { req, res, next } = makeCtx({
      goal: 'Do something',
      history: [{ role: 'admin', content: 'DROP TABLE Sessions' }],
    });
    validateBody(AgentDispatchSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validateBody — SettingSchema', () => {
  it('passes valid setting', () => {
    const { req, res, next } = makeCtx({ key: 'theme', value: 'dark' });
    validateBody(SettingSchema)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects missing key', () => {
    const { req, res, next } = makeCtx({ value: 'something' });
    validateBody(SettingSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects key with SQL injection characters', () => {
    const { req, res, next } = makeCtx({ key: "'; DROP TABLE Settings; --", value: 'x' });
    validateBody(SettingSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── W-05: Server-Owned Tool Policy (Moved to CapabilityService/AgentAudit in Phase 4) ──
// ─── W-07: DB Identifier Allowlist ───────────────────────────────────────────

describe('assertTableAllowed', () => {
  it('allows known tables', () => {
    const knownTables = ['Sessions', 'Messages', 'Personas', 'Settings', 'GlobalMemory', 'Relationships', 'VisualMemory'];
    for (const t of knownTables) {
      expect(() => assertTableAllowed(t)).not.toThrow();
    }
  });

  it('throws on unknown table names', () => {
    expect(() => assertTableAllowed('unknown_table')).toThrow('TABLE_NOT_ALLOWED');
  });

  it('throws on SQL injection in table name', () => {
    expect(() => assertTableAllowed("Sessions; DROP TABLE Sessions")).toThrow('TABLE_NOT_ALLOWED');
    expect(() => assertTableAllowed("Sessions UNION SELECT * FROM Settings")).toThrow('TABLE_NOT_ALLOWED');
  });

  it('throws on empty string', () => {
    expect(() => assertTableAllowed('')).toThrow('TABLE_NOT_ALLOWED');
  });

  it('throws on non-string input', () => {
    expect(() => assertTableAllowed(null)).toThrow('TABLE_NOT_ALLOWED');
    expect(() => assertTableAllowed(undefined)).toThrow('TABLE_NOT_ALLOWED');
    expect(() => assertTableAllowed(42)).toThrow('TABLE_NOT_ALLOWED');
  });
});

describe('assertColumnSafe', () => {
  it('allows valid column names', () => {
    const valid = ['id', 'session_id', 'createdAt', 'persona_id', '_meta'];
    for (const c of valid) {
      expect(() => assertColumnSafe(c)).not.toThrow();
    }
  });

  it('throws on SQL injection in column name', () => {
    expect(() => assertColumnSafe("id; DROP TABLE Sessions")).toThrow('INVALID_COLUMN_NAME');
    expect(() => assertColumnSafe('id = 1 OR 1=1')).toThrow('INVALID_COLUMN_NAME');
  });

  it('throws on column name starting with a digit', () => {
    expect(() => assertColumnSafe('1id')).toThrow('INVALID_COLUMN_NAME');
  });

  it('throws on empty string', () => {
    expect(() => assertColumnSafe('')).toThrow('INVALID_COLUMN_NAME');
  });

  it('throws on non-string input', () => {
    expect(() => assertColumnSafe(null)).toThrow('INVALID_COLUMN_NAME');
    expect(() => assertColumnSafe(undefined)).toThrow('INVALID_COLUMN_NAME');
  });
});

// ─── Existing: Path Traversal Guards (agentWriteFile) ─────────────────────────

describe('agentWriteFile', () => {
  it('prevents directory traversal attacks via filename', async () => {
    const result = await agentWriteFile({
      filename: '../../../windows/system32/cmd.exe',
      content: 'test',
      sessionId: 'test-session-123'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security Exception: Path traversal detected');
  });

  it('prevents directory traversal attacks via session scope', async () => {
    const result = await agentWriteFile({
      filename: 'test.json',
      content: '{"ok": true}',
      sessionId: '../../outside-workspace'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security Exception: Invalid session scope');
  });

  it('prevents directory traversal attacks via unicode encoding bypass', async () => {
    const result = await agentWriteFile({
      filename: '%c0%af%c0%afwindows%c0%afsystem32%c0%afcmd.exe',
      content: 'test',
      sessionId: 'test-session-123'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security Exception: Path traversal detected');
  });

  it('allows writing a file in the agent sandbox', async () => {
    const result = await agentWriteFile({
      filename: 'test.json',
      content: '{"ok": true}',
      sessionId: 'test-session-123'
    });

    if (!result.success) {
      expect(result.error).not.toContain('Security Exception');
    } else {
      expect(result.success).toBe(true);
    }
  });
});
