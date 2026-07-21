import { getSession, getPersonas, getPersona, getRelationships, getRelationship, syncSession, syncPersona, syncMessage, syncRelationship, runQuery } from "../services/dbService.js";
import fs from "fs";
import path from "path";
import { resolveSafePath } from "../utils/pathResolver.js";

/**
 * Serves agent-generated artifacts securely, explicitly resolving and 
 * streaming files instead of relying on `express.static`.
 * 
 * Enforces headers for isolation (e.g., Content-Security-Policy).
 */
export function setupArtifactRoutes(app, context) {
  const { UPLOADS_DIR } = context;
  const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

  app.get("/uploads/:sessionId/agent_files/:filename", async (req, res) => {
    const { sessionId, filename } = req.params;

    if (typeof sessionId !== "string" || !SAFE_SESSION_ID.test(sessionId)) {
      return res.status(400).json({ error: "Invalid session ID format" });
    }

    try {
      const sessionDir = resolveSafePath(UPLOADS_DIR, sessionId);
      const agentDir = resolveSafePath(sessionDir, "agent_files");
      const targetFile = resolveSafePath(agentDir, filename);

      if (!fs.existsSync(targetFile)) {
        return res.status(404).json({ error: "Artifact not found" });
      }

      // Explicitly set security headers for sandboxed iframes
      res.setHeader("X-Content-Type-Options", "nosniff");
      // Add sandboxing headers; iframe should specify its own sandbox flags too
      res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");

      res.sendFile(targetFile);
    } catch (err) {
      console.error(`[SECURITY] Artifact resolution failed: ${err.message}`);
      res.status(403).json({ error: "Forbidden or invalid path" });
    }
  });
}
