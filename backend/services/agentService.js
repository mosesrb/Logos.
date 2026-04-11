import fetch from "node-fetch";
import { agentToolsSchema, ToolRegistry } from "../utils/tools.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

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
    const { sessionId, saveMessage, allowedTools, maxLoops: maxLoopsParam, history = [] } = context;
    console.log(`🤖 AGENT_SERVICE: Starting task for session [${sessionId}] with [${history.length}] context messages`);
    
    let isAborted = false;
    res.on("close", () => {
        console.log("🤖 AGENT_SERVICE: Connection closed by client. Aborting loop.");
        isAborted = true;
    });

    const messages = [
        { role: "system", content: systemPrompt || "You are an autonomous AI engineering agent. Keep answers concise." },
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

    // Filter tools if the caller has specified an allowedTools list
    const toolsToUse = (allowedTools && allowedTools.length > 0)
        ? agentToolsSchema.filter(t => allowedTools.includes(t.function.name))
        : agentToolsSchema;
    
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

                    if (executor) {
                        try {
                            result = await executor(funcArgs);
                        } catch (err) {
                            result = { success: false, error: err.message };
                        }
                    } else {
                        result = { success: false, error: `Tool ${funcName} not found mapped in system.` };
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
