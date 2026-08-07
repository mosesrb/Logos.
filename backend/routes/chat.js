import { getChatHandlers } from "../controllers/chatController.js";
import { validateBody, ChatBodySchema } from "../middleware/validate.js";

export function setupChatRoutes(app, context) {
  const handlers = getChatHandlers(context);

  app.post("/api/chat/:sessionId", validateBody(ChatBodySchema), handlers.handleStandardChat);
  app.post("/api/chat/parallel/:sessionId", handlers.handleParallelChat);
  app.post("/api/chat/debate/:sessionId", handlers.handleDebateChat);
  app.post("/api/chat/collaborate/:sessionId", handlers.handleCollaborateChat);
  app.get("/api/synapse/presets", handlers.getSynapsePresets);
  app.post("/api/chat/pipeline/:sessionId", handlers.handlePipelineChat);
  app.post("/api/chat/scenario/:sessionId", handlers.handleScenarioChat);
}
