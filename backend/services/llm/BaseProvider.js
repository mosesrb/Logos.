/**
 * IModelProvider interface / Base class
 */
export class BaseProvider {
  /**
   * Run a model for standard inference
   * @param {string} model 
   * @param {string} prompt 
   * @param {Function} onChunkCallback 
   * @param {Array} images 
   * @param {string} systemPrompt 
   * @param {Object} options 
   * @returns {Promise<string>}
   */
  async runModel(model, prompt, onChunkCallback = null, images = [], systemPrompt = null, options = null) {
    throw new Error("runModel() must be implemented by subclass");
  }

  /**
   * Run a model and enforce structured JSON output.
   * If the model supports native structured outputs (e.g. format="json"), use it.
   * @param {string} model
   * @param {string} prompt
   * @param {Object} schema The expected JSON schema
   * @param {string} systemPrompt
   * @param {Array} images
   * @returns {Promise<Object>}
   */
  async runModelStructured(model, prompt, schema = null, systemPrompt = null, images = []) {
    throw new Error("runModelStructured() must be implemented by subclass");
  }

  /**
   * Run a model with a full conversation history
   * @param {string} model 
   * @param {Array} messages 
   * @param {Object} options 
   * @param {Function} onChunkCallback 
   * @returns {Promise<string>}
   */
  async runConversationStream(model, messages, options = null, onChunkCallback = null) {
    throw new Error("runConversationStream() must be implemented by subclass");
  }
}
