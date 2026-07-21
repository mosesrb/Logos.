import { describe, it, expect, vi, beforeEach } from 'vitest';
import fetch from 'node-fetch';
import { executeAgenticTask } from '../services/agentService.js';
import * as tools from '../utils/tools.js';
import capabilityService from '../services/capabilityService.js';
import * as dbService from '../services/dbService.js';

vi.mock('node-fetch', () => ({
  default: vi.fn()
}));

vi.mock('../services/capabilityService.js', () => ({
  default: {
    getAllowedCapabilities: vi.fn()
  }
}));

vi.mock('../services/dbService.js', () => ({
  runQuery: vi.fn().mockResolvedValue({ id: 1 })
}));

// We must override the registry itself since the service calls the registry
tools.ToolRegistry['agentWriteFile'] = vi.fn().mockResolvedValue({ success: true, message: "File written mock" });
tools.ToolRegistry['shellExec'] = vi.fn().mockResolvedValue({ success: true, stdout: "Exploited!" });

describe('Agent Security - Phase 4', () => {
    let mockRes;
    
    beforeEach(() => {
        vi.clearAllMocks();
        mockRes = {
            write: vi.fn(),
            end: vi.fn(),
            on: vi.fn()
        };
        
        // Default: only agentWriteFile allowed
        capabilityService.getAllowedCapabilities.mockResolvedValue(new Set(['agentWriteFile']));
    });

    it('rejects unauthorized tools and logs to audit', async () => {
        // Mock the LLM trying to call an unauthorized tool (e.g. shellExec)
        const attackJSON = `{"tool_calls": [{"id": "attack_1", "type": "function", "function": {"name": "shellExec", "arguments": "{\\"command\\": \\"rm -rf /\\"}"}}]}`;
        
        fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ({
                message: { role: 'assistant', tool_calls: [{id: "attack_1", type: "function", function: {name: "shellExec", arguments: "{\"command\": \"rm -rf /\"}"}}] }
            })
        }).mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ({
                message: { role: 'assistant', content: "Task failed." }
            })
        });

        const persona = { name: "TestBot" };
        await executeAgenticTask(mockRes, "test-model", "sys", "user", persona, { sessionId: "123", history: [] });

        // Ensure the tool was NOT invoked
        expect(tools.ToolRegistry.shellExec).not.toHaveBeenCalled();
        
        // Ensure the rejection was logged to AgentAudit
        expect(dbService.runQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO AgentAudit'),
            expect.arrayContaining([
                "123",            // session_id
                "test-model",     // agent_id
                "shellExec",      // tool_name
                expect.any(String), // arguments_json
                0,                // capability_approved (false)
                0                 // success
            ])
        );
    });

    it('allows authorized tools and logs to audit', async () => {
        fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ({
                message: { role: 'assistant', tool_calls: [{id: "safe_1", type: "function", function: {name: "agentWriteFile", arguments: "{\"filename\": \"safe.txt\", \"content\": \"data\"}"}}] }
            })
        }).mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ({
                message: { role: 'assistant', content: "Task complete." }
            })
        });

        const persona = { name: "TestBot" };
        await executeAgenticTask(mockRes, "test-model", "sys", "user", persona, { sessionId: "123", history: [] });

        // Ensure the tool WAS invoked
        expect(tools.ToolRegistry.agentWriteFile).toHaveBeenCalledWith({
            filename: "safe.txt",
            content: "data",
            sessionId: "123"
        });
        
        // Ensure the success was logged to AgentAudit
        expect(dbService.runQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO AgentAudit'),
            expect.arrayContaining([
                "123",            // session_id
                "test-model",     // agent_id
                "agentWriteFile", // tool_name
                expect.any(String), // arguments_json
                1,                // capability_approved (true)
                1                 // success
            ])
        );
    });
});
