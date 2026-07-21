import fetch from "node-fetch";
import { agentToolsSchema, ToolRegistry } from "../utils/tools.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

import capabilityService from "./capabilityService.js";
import * as dbService from "./dbService.js";

// OLLAMA_BASE_URL is handled via process.env


/**
 * Executes the OpenClaude-inspired autonomous Tool Loop via Ollama.
 * Connects directly to the active Express Response object (SSE) to update the Terminal UI.
 * @param {Object} res - Express response object.
 * @param {string} agentModel - Model to use.
 * @param {string} systemPrompt - Persona system prompt.
 * @param {string} initialUserPrompt - Original user request.
 * @param {Object} persona - Full persona object for traits.
 * @param {Object} context - { sessionId, saveMessage(role, content), history }
 */
export async function executeAgenticTask(res, agentModel, systemPrompt, initialUserPrompt, persona, context = {}) {
    const { sessionId, saveMessage, maxLoops: maxLoopsParam, history = [] } = context;
    // Note: allowedTools is intentionally not destructured — server owns tool policy via SERVER_ALLOWED_TOOLS.
    console.log(`🤖 AGENT_SERVICE: Starting task for session [${sessionId}] with [${history.length}] context messages`);
    
    let isAborted = false;
    res.on("close", () => {
        console.log("🤖 AGENT_SERVICE: Connection closed by client. Aborting loop.");
        isAborted = true;
    });

    const messages = [
        { role: "system", content: `${systemPrompt || "You are an autonomous AI engineering agent."} When asked to write or create code, you MUST use the agentWriteFile tool to formulate full files. Wait for syntax validation before concluding. Keep conversational answers concise.` },
        ...history,
        { role: "user", content: initialUserPrompt }
    ];

    // Extract persona-specific options (traits/parameters)
    const options = {
        temperature: persona?.temperature ?? 0.7,
        top_p: persona?.top_p ?? 0.9,
        num_predict: 2048 // Extended prediction window for complex tasks
    };
    
    // Merge standard trait mapping if provided
    if (persona?.traits) {
        // Map some UI traits into standard LLM params if applicable
        if (persona.traits.logic > 0.8) options.temperature = 0.2; // High logic = low temperature
        if (persona.traits.playfulness > 0.8) options.temperature = 1.0; // High playfulness = high temperature
    }


    // Persistence: Save the initial user message immediately if context is provided
    if (saveMessage) {
        saveMessage("user", initialUserPrompt);
    }

    let loopCount = 0;
    const MAX_LOOPS = maxLoopsParam || 8; // Configurable from AgentDesk; default 8

    // W-05 Server-owned tool policy via CapabilityService
    const allowedTools = await capabilityService.getAllowedCapabilities(sessionId);
    const toolsToUse = agentToolsSchema.filter(t => allowedTools.has(t.function.name));
    while (loopCount < MAX_LOOPS && !isAborted) {
        loopCount++;
        
        try {
            if (isAborted) break;
            res.write(`data: ${JSON.stringify({ type: "agent-status", msg: `[Loop ${loopCount}/${MAX_LOOPS}] Analyzing task...` })}\n\n`);

            const requestPayload = {
                model: agentModel,
                messages: messages,
                tools: toolsToUse,
                options: options,  // Apply persona's unique "vibe"
                stream: false 
            };

            // Heartbeat: Keep connection alive while Ollama is thinking
            const heartbeat = setInterval(() => {
                if (isAborted || res.writableEnded) {
                    clearInterval(heartbeat);
                    return;
                }
                res.write(`data: ${JSON.stringify({ type: "agent-status", msg: `[Loop ${loopCount}] Processor pulse...` })}\n\n`);
            }, 5000);

            let response;
            try {
                response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestPayload)
                });
            } finally {
                clearInterval(heartbeat);
            }

            if (isAborted) return; // Exit if aborted during fetch

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`🤖 AGENT_ERROR: Ollama returned ${response.status} - ${errorBody}`);
                
                // Specialized Model Guardrail
                if (response.status === 400 && (errorBody.includes("tools") || errorBody.includes("not support"))) {
                    throw new Error(`Model [${agentModel}] does not support autonomous tools. Recommended: qwen2.5-coder or llama3.1.`);
                }
                
                throw new Error(`Ollama API returned ${response.status} ${response.statusText}: ${errorBody}`);
            }

            const data = await response.json();
            const msg = data.message;
            
            // Append AI's raw choice back to the context window
            messages.push(msg);

            // Enforce strictly properly formatted JSON tool_calls.
            // Phase 4 removes extreme markdown block hijacking to harden prompt bounds.
            if (msg.content && (!msg.tool_calls || msg.tool_calls.length === 0)) {
                // If model outputs content without tool_calls, we assume it's just talking.
            }
            // 1. Tool Call Evaluation
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const call of msg.tool_calls) {
                    const funcName = call.function.name;
                    const callId = call.id; // Capture the unique tool call ID
                    
                    let funcArgs;
                    try {
                        funcArgs = typeof call.function.arguments === 'string' 
                            ? JSON.parse(call.function.arguments) 
                            : call.function.arguments;
                    } catch (e) {
                        funcArgs = {};
                    }
                    
                    // Alert Frontend Terminal
                    res.write(`data: ${JSON.stringify({ 
                        type: "agent-tool-start", 
                        tool: funcName, 
                        args: funcArgs 
                    })}\n\n`);
                    
                    const executor = ToolRegistry[funcName];
                    let result;
                    let isSuccess = 0;
                    const startTime = Date.now();

                    // Guard check
                    if (!allowedTools.has(funcName)) {
                        result = { success: false, error: `Tool ${funcName} is not authorized for this session.` };
                    } else if (executor) {
                        try {
                            result = await executor({ ...funcArgs, sessionId });
                            isSuccess = result.success ? 1 : 0;
                        } catch (err) {
                            result = { success: false, error: err.message };
                        }
                    } else {
                        result = { success: false, error: `Tool ${funcName} not found mapped in system.` };
                    }
                    
                    const duration = Date.now() - startTime;

                    // Audit Logging
                    try {
                        await dbService.runQuery(
                            `INSERT INTO AgentAudit (session_id, agent_id, tool_name, arguments_json, capability_approved, success, result_preview, duration_ms) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                sessionId, 
                                agentModel, 
                                funcName, 
                                JSON.stringify(funcArgs), 
                                allowedTools.has(funcName) ? 1 : 0, 
                                isSuccess, 
                                JSON.stringify(result).substring(0, 500), 
                                duration
                            ]
                        );
                    } catch (auditErr) {
                        console.error("Failed to write to AgentAudit:", auditErr);
                    }

                    // Alert Frontend Terminal Result
                    res.write(`data: ${JSON.stringify({ 
                        type: "agent-tool-result", 
                        tool: funcName, 
                        result: result 
                    })}\n\n`);

                    // Inject tool response so Ollama knows what happened
                    // Standard spec requires tool_call_id to map back to the original call
                    messages.push({
                        role: "tool",
                        content: JSON.stringify(result),
                        tool_call_id: callId 
                    });
                }
            } 
            // 2. Final Output Evaluation (No tools invoked)
            else {
                 res.write(`data: ${JSON.stringify({ 
                     type: "agent-final", 
                     content: msg.content 
                 })}\n\n`);
                 
                 // Persistence: Save AXON's final answer to the session history
                 if (saveMessage) {
                     saveMessage("assistant", msg.content);
                 }

                 res.write(`data: [DONE]\n\n`);
                 return msg.content;
            }

        } catch (error) {
            console.error("Agent Service Error:", error.message);
            res.write(`data: ${JSON.stringify({ type: "agent-error", content: "Agent crash: " + error.message })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return;
        }
    }
    
    // Failsafe exit
    res.write(`data: ${JSON.stringify({ type: "agent-error", content: "Agent exceeded maximum tool execution loop." })}\n\n`);
    res.write(`data: [DONE]\n\n`);
}
