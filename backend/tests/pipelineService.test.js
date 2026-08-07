import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePipeline } from '../services/pipelineService.js';
import { llmProvider } from '../services/llm/index.js';

// Mock dependencies
vi.mock('../services/llm/index.js', () => ({
  llmProvider: {
    runModel: vi.fn()
  }
}));

vi.mock('../services/dbService.js', () => ({
  ensureSession: vi.fn().mockResolvedValue({ messages: [] }),
  syncSession: vi.fn().mockResolvedValue(),
  saveSessionToDisk: vi.fn().mockResolvedValue(),
  getPersona: vi.fn().mockResolvedValue({ id: 'persona-1', name: 'Test Persona' }),
  getRelationship: vi.fn().mockResolvedValue({}),
  syncRelationship: vi.fn().mockResolvedValue()
}));

vi.mock('../services/memoryService.js', () => ({
  indexEpisodicMemory: vi.fn()
}));

vi.mock('../ai/memoryUpdater.js', () => ({
  updateRelationship: vi.fn(),
  tagAndStoreMemory: vi.fn()
}));

const mockContext = {
  addLog: vi.fn(),
  buildPersonaSystemPrompt: vi.fn().mockReturnValue('System Prompt'),
  buildFullPrompt: vi.fn().mockResolvedValue({ prompt: 'Full Prompt', sources: [] }),
  saveRelationships: vi.fn()
};

describe('pipelineService', () => {
  let mockRes;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = {
      write: vi.fn(),
      end: vi.fn()
    };
    llmProvider.runModel.mockResolvedValue('Pipeline Step Output');
  });

  it('should execute pipeline stages in sequence', async () => {
    const pipelineData = {
      stages: [
        { name: 'Stage 1', prompt: 'Do thing 1' },
        { name: 'Stage 2', prompt: 'Do thing 2' }
      ]
    };

    await executePipeline({
      pipelineStages: pipelineData.stages,
      personaIds: ['persona-1'],
      sessionId: 'test-session',
      prompt: 'Initial prompt',
      images: [],
      res: mockRes,
      context: mockContext
    });

    // Each stage should invoke runModel
    expect(llmProvider.runModel).toHaveBeenCalledTimes(2);
    
    // Check if the response was streamed
    expect(mockRes.write).toHaveBeenCalled();
  });
});
