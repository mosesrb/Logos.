/**
 * validate.js — Phase 1 Security Boundary
 *
 * Provides a Zod-based Express middleware factory and canonical request schemas.
 * Apply with: app.post("/route", validateBody(SomeSchema), handler)
 *
 * Contract:
 *  - On failure → 400 JSON { error: "VALIDATION_ERROR", fields: {...} }
 *  - On success → req.body is replaced with the Zod-parsed (coerced + stripped) value.
 *    Unknown fields are stripped; defaults are applied.
 */

import { z } from "zod";

/**
 * Returns an Express middleware that validates req.body against the given Zod schema.
 * @param {z.ZodTypeAny} schema
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        fields: result.error.flatten().fieldErrors,
      });
    }
    // Replace body with parsed data — unknowns stripped, types coerced, defaults applied.
    req.body = result.data;
    next();
  };
}

// ─── Shared Schemas ───────────────────────────────────────────────────────────

/**
 * POST /api/chat/:sessionId
 */
export const ChatBodySchema = z.object({
  prompt:          z.string().min(1).max(32768),
  model:           z.string().max(128).optional(),
  webMode:         z.boolean().optional(),
  ragMode:         z.boolean().optional(),
  // images: base64 data URIs — cap count and individual size
  images:          z.array(z.string().max(8 * 1024 * 1024)).max(10).optional(),
  pinnedMemories:  z.array(z.string().max(4096)).max(20).optional(),
  personaId:       z.string().max(128).nullable().optional(),
  unrestricted:    z.boolean().optional(),
});

/**
 * POST /api/agent/dispatch
 *
 * Note: `allowedTools` is intentionally absent. The server owns tool policy
 * via SERVER_ALLOWED_TOOLS in agentService.js. Any client-supplied allowedTools
 * is stripped here before reaching the service layer.
 */
export const AgentDispatchSchema = z.object({
  goal:      z.string().min(1).max(4096),
  personaId: z.string().max(128).nullable().optional(),
  maxLoops:  z.number().int().min(1).max(15).optional(),
  history:   z.array(
    z.object({
      role:    z.enum(["user", "assistant", "system", "tool"]),
      content: z.string().max(32768),
    })
  ).max(100).optional(),
});

/**
 * POST /api/agent/chat
 */
export const AgentChatSchema = z.object({
  message:      z.string().min(1).max(32768),
  model:        z.string().max(128).optional(),
  sessionId:    z.string()
    .min(1).max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, "Invalid session ID format"),
  systemPrompt: z.string().max(16384).optional(),
  // Allow a partial persona object (full persona is resolved server-side)
  persona:      z.object({
    id:             z.string().max(128).optional(),
    name:           z.string().max(128).optional(),
    temperature:    z.number().min(0).max(2).optional(),
    top_p:          z.number().min(0).max(1).optional(),
    traits:         z.record(z.number()).optional(),
    system_prompt:  z.string().max(8192).optional(),
    goal:           z.string().max(2048).optional(),
    core_expertise: z.string().max(2048).optional(),
    model:          z.string().max(128).optional(),
  }).nullable().optional(),
});

/**
 * POST /api/settings
 */
export const SettingSchema = z.object({
  key:   z.string()
    .min(1).max(128)
    .regex(/^[A-Za-z0-9][\w.:_-]*$/, "Setting key must be alphanumeric with . : _ - allowed"),
  value: z.any(),  // settings accept any JSON-serializable value
});

/**
 * POST /api/memory/edit
 */
export const MemoryEditSchema = z.object({
  index: z.number().int().min(0),
  text:  z.string().min(3).max(8192),
});
