const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env');
const httpStatus = require('../constants/httpStatus');
const errorCodes = require('../constants/errorCodes');

class GeminiService {
  constructor() {
    this.apiKey = env.GEMINI_API_KEY;
    this.configuredModel = env.GEMINI_MODEL;
    this.rawTimeout = env.REQUEST_TIMEOUT;
    this.fallbackModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    this.activeModel = null;
    this.client = null;

    const parsed = parseInt(this.rawTimeout, 10);
    this.timeoutMs = !isNaN(parsed) && parsed > 0 ? parsed : 15000;
  }

  /**
   * Validates configuration parameters.
   */
  validateConfig() {
    if (!this.apiKey || typeof this.apiKey !== 'string' || this.apiKey.trim() === '') {
      const error = new Error('GEMINI_API_KEY is missing or invalid in environment variables');
      error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      error.code = errorCodes.AI_CONFIG_ERROR;
      throw error;
    }

    if (this.rawTimeout !== undefined && this.rawTimeout !== null && String(this.rawTimeout).trim() !== '') {
      const parsed = parseInt(this.rawTimeout, 10);
      if (isNaN(parsed) || parsed <= 0) {
        const error = new Error('REQUEST_TIMEOUT must be a positive integer');
        error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        error.code = errorCodes.AI_CONFIG_ERROR;
        throw error;
      }
      this.timeoutMs = parsed;
    } else {
      this.timeoutMs = 15000;
    }

    if (this.configuredModel && typeof this.configuredModel !== 'string') {
      const error = new Error('GEMINI_MODEL must be a string');
      error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      error.code = errorCodes.AI_CONFIG_ERROR;
      throw error;
    }
  }

  /**
   * Initializes GoogleGenerativeAI client.
   */
  getClient() {
    this.validateConfig();
    if (!this.client) {
      this.client = new GoogleGenerativeAI(this.apiKey);
    }
    return this.client;
  }

  /**
   * Helper method to sleep during exponential backoff retries.
   */
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determines if an error is a transient failure worthy of a retry.
   * Retries ONLY for: 429, 500, 502, 503, 504, ECONNRESET, ETIMEDOUT, Network timeout.
   * NEVER retries for: 400, 401, 403, 404, quota exhausted (permanent), safety blocked, invalid key.
   */
  isTransientError(error) {
    if (!error) return false;
    const msg = error.message ? error.message.toLowerCase() : '';
    const status = error.status || error.statusCode;

    // Explicit permanent failures - NEVER RETRY
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      msg.includes('invalid api key') ||
      msg.includes('api_key_invalid') ||
      msg.includes('quota') ||
      msg.includes('resource_exhausted') ||
      msg.includes('permission_denied') ||
      msg.includes('safety') ||
      msg.includes('blocked')
    ) {
      return false;
    }

    // Transient HTTP status codes
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      return true;
    }

    // Transient network keywords
    if (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('fetch failed') ||
      msg.includes('network error')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Extracts text content from a raw Gemini response.
   */
  extractText(response) {
    if (!response) return '';
    if (typeof response.text === 'function') {
      return response.text();
    }
    if (response.candidates && response.candidates[0]?.content?.parts[0]?.text) {
      return response.candidates[0].content.parts[0].text;
    }
    return '';
  }

  /**
   * Cleans markdown code fences, isolates JSON object/array substring, and parses JSON.
   * @param {string} responseText 
   * @returns {Object|Array} Parsed JSON
   */
  extractJson(responseText) {
    if (!responseText || typeof responseText !== 'string') {
      const error = new Error('Empty or invalid text provided for JSON extraction');
      error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      error.code = errorCodes.AI_PARSING_ERROR;
      throw error;
    }

    // 1. Remove markdown code blocks (```json ... ``` or ``` ... ```)
    let cleaned = responseText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

    // 2. Locate first '{' or '[' and last '}' or ']' to strip surrounding conversational prose
    const firstObj = cleaned.indexOf('{');
    const firstArr = cleaned.indexOf('[');
    let startIdx = -1;

    if (firstObj !== -1 && firstArr !== -1) {
      startIdx = Math.min(firstObj, firstArr);
    } else if (firstObj !== -1) {
      startIdx = firstObj;
    } else if (firstArr !== -1) {
      startIdx = firstArr;
    }

    const lastObj = cleaned.lastIndexOf('}');
    const lastArr = cleaned.lastIndexOf(']');
    let endIdx = Math.max(lastObj, lastArr);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
    }

    try {
      return JSON.parse(cleaned);
    } catch (parseErr) {
      const error = new Error('Failed to parse JSON response from Gemini AI');
      error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      error.code = errorCodes.AI_PARSING_ERROR;
      error.details = { rawText: responseText, parseError: parseErr.message };
      throw error;
    }
  }

  /**
   * Executes a single API call with specified model and timeout enforcement.
   */
  async executeContentGeneration(modelName, promptText) {
    const client = this.getClient();
    const model = client.getGenerativeModel({ model: modelName });
    let timer = null;
    const startTime = Date.now();

    try {
      const generatePromise = model.generateContent(promptText);
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          console.warn(`[GeminiService] Request timeout after ${this.timeoutMs}ms`);
          const err = new Error(`Gemini request timed out after ${this.timeoutMs}ms`);
          err.statusCode = httpStatus.SERVICE_UNAVAILABLE;
          err.code = errorCodes.AI_SERVICE_ERROR;
          reject(err);
        }, this.timeoutMs);
      });

      const result = await Promise.race([generatePromise, timeoutPromise]);
      if (timer) clearTimeout(timer);

      const responseTime = Date.now() - startTime;
      const response = (result && result.response) ? await result.response : result;
      const text = this.extractText(response);
      const candidate = (response && response.candidates) ? response.candidates[0] : null;

      return {
        text,
        model: modelName,
        finishReason: candidate ? candidate.finishReason : undefined,
        usageMetadata: (response && response.usageMetadata) || undefined,
        responseTime
      };
    } catch (error) {
      if (timer) clearTimeout(timer);
      throw error;
    }
  }

  /**
   * Resolves a working model dynamically.
   * If GEMINI_MODEL is set in env, attempts it directly.
   * Otherwise probes fallback models in order with a lightweight ping request.
   * Caches the first successful model permanently.
   */
  async resolveWorkingModel() {
    if (this.activeModel) {
      return this.activeModel;
    }

    const candidateModels = [];

    if (this.configuredModel && typeof this.configuredModel === 'string' && this.configuredModel.trim() !== '') {
      candidateModels.push(this.configuredModel.trim());
    }

    for (const modelCandidate of this.fallbackModels) {
      if (!candidateModels.includes(modelCandidate)) {
        candidateModels.push(modelCandidate);
      }
    }

    let lastError = null;

    for (const modelCandidate of candidateModels) {
      try {
        console.log(`[GeminiService] Probing model availability for: ${modelCandidate}...`);
        await this.executeContentGeneration(modelCandidate, 'ping');

        // Lock and cache the first model that successfully responds
        this.activeModel = modelCandidate;
        console.log(`[GeminiService] Successfully validated and cached active model: ${this.activeModel}`);
        return this.activeModel;
      } catch (err) {
        lastError = err;
        const msg = err.message ? err.message.toLowerCase() : '';

        if (
          err.status === 404 ||
          msg.includes('not found') ||
          msg.includes('unsupported model') ||
          msg.includes('is not supported') ||
          msg.includes('invalid model')
        ) {
          console.warn(`[GeminiService] Model '${modelCandidate}' is unavailable or invalid. Attempting next fallback...`);
          continue;
        }

        if (this.isTransientError(err)) {
          console.warn(`[GeminiService] Transient network error while probing model '${modelCandidate}': ${err.message}. Attempting next candidate...`);
          continue;
        }

        // Fatal authentication / configuration error (e.g. invalid API key 401/403)
        throw err;
      }
    }

    if (lastError && lastError.code) {
      throw lastError;
    }

    const configError = new Error(
      lastError
        ? `Failed to resolve a working Gemini model: ${lastError.message}`
        : 'No supported Gemini model could be reached or authorized.'
    );
    configError.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    configError.code = errorCodes.AI_CONFIG_ERROR;
    throw configError;
  }

  /**
   * Sends a prompt to Gemini with model detection, timeout support, and exponential backoff retry.
   * @param {string} promptText 
   * @param {Object} options - Optional overrides (maxAttempts, backoffMs)
   * @returns {Promise<Object>} Object containing { text, model, finishReason, usageMetadata, responseTime }
   */
  async sendPrompt(promptText, options = {}) {
    const maxAttempts = options.maxAttempts || 3;
    const baseBackoff = options.backoffMs || 1000;
    let lastError = null;

    const modelName = await this.resolveWorkingModel();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executeContentGeneration(modelName, promptText);
      } catch (error) {
        lastError = error;
        const isTransient = this.isTransientError(error);

        if (attempt < maxAttempts && isTransient) {
          const delay = baseBackoff * Math.pow(2, attempt - 1);
          console.warn(`[GeminiService] Retry attempt ${attempt}/${maxAttempts} after transient error. Waiting ${delay}ms...`);
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    const appError = new Error((lastError && lastError.message) ? lastError.message : 'Failed to communicate with Gemini AI service');
    appError.statusCode = (lastError && lastError.statusCode) || httpStatus.SERVICE_UNAVAILABLE;
    appError.code = (lastError && lastError.code) || errorCodes.AI_SERVICE_ERROR;
    appError.details = lastError ? lastError.stack : undefined;
    throw appError;
  }

  /**
   * Connection test method to verify Gemini API readiness.
   * Prompts: "Return EXACTLY: OK". Verifies output strictly equals "OK".
   */
  async testConnection() {
    console.log('[GeminiService] Executing connection readiness test...');
    const result = await this.sendPrompt('Return EXACTLY: OK');
    const returnedText = (result.text || '').trim();

    if (returnedText !== 'OK') {
      const error = new Error(`Connection test failed: Expected "OK", received "${returnedText}"`);
      error.statusCode = httpStatus.SERVICE_UNAVAILABLE;
      error.code = errorCodes.AI_SERVICE_ERROR;
      throw error;
    }

    console.log('[GeminiService] Connection test successful. Gemini service is online.');
    return {
      status: 'online',
      model: result.model,
      responseTime: result.responseTime
    };
  }
}

const geminiService = new GeminiService();
module.exports = geminiService;
