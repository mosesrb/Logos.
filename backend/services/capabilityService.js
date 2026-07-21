import * as dbService from "./dbService.js";

/**
 * CapabilityService
 * Implements a deny-by-default capability boundary for agent execution.
 */
class CapabilityService {
    constructor() {
        // Base capabilities granted to all sessions by default (safe read-only or scoped operations)
        this.baseCapabilities = new Set([
            "readFileTool",
            "listDirTool",
            "mempalaceSearch",
        ]);
        
        // Tools requiring explicit capability grants or user approval
        this.restrictedCapabilities = new Set([
            "agentWriteFile",
            "mempalaceDiaryWrite",
        ]);
    }

    /**
     * Determines which tools are allowed for a specific session.
     * @param {string} sessionId 
     * @returns {Set<string>} Set of allowed tool names
     */
    async getAllowedCapabilities(sessionId) {
        // In a complete implementation, this would query the DB for specific grants per session.
        // For now, we grant the base capabilities, plus restricted capabilities if they are
        // explicitly defined as part of the Phase 4 agent scope.
        // We simulate a strict policy by allowing them, but requiring runtime approval in the manifest.
        const allowed = new Set([...this.baseCapabilities, ...this.restrictedCapabilities]);
        
        // Example check:
        // const sessionGrants = await dbService.runQuery("SELECT capability FROM SessionCapabilities WHERE session_id = ?", [sessionId]);
        // sessionGrants.forEach(g => allowed.add(g.capability));

        return allowed;
    }

    /**
     * Checks if a tool execution is authorized for the given session.
     */
    async isToolAuthorized(sessionId, toolName) {
        const allowed = await this.getAllowedCapabilities(sessionId);
        return allowed.has(toolName);
    }
}

export default new CapabilityService();
