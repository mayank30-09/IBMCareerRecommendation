const env = require('../config/env');
const httpStatus = require('../constants/httpStatus');
const errorCodes = require('../constants/errorCodes');
const logger = require('../config/logger');

/**
 * OpenRouter Service
 * Manages API interactions with OpenRouter Chat Completions API.
 */
class OpenRouterService {
  constructor() {
    this.rawTimeout = env.REQUEST_TIMEOUT;
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.provider = 'openrouter';

    const parsed = parseInt(this.rawTimeout, 10);
    this.timeoutMs = !isNaN(parsed) && parsed > 0 ? parsed : 15000;
  }

  /**
   * Dynamically retrieves active API key from runtime environment.
   */
  getApiKey() {
    return (process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || '').trim();
  }

  /**
   * Dynamically retrieves active model from runtime environment.
   */
  getModel() {
    return (process.env.OPENROUTER_MODEL || env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free').trim();
  }

  /**
   * Validates configuration parameters.
   */
  validateConfig() {
    const apiKey = this.getApiKey();
    const model = this.getModel();

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '' || apiKey.includes('your-key') || apiKey.includes('xxxxxxxx')) {
      const error = new Error('OPENROUTER_API_KEY is missing or invalid in environment variables');
      error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      error.code = errorCodes.AI_CONFIG_ERROR;
      throw error;
    }

    if (!model || typeof model !== 'string') {
      const error = new Error('OPENROUTER_MODEL must be a non-empty string');
      error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      error.code = errorCodes.AI_CONFIG_ERROR;
      throw error;
    }
  }

  /**
   * Helper method to clean and extract JSON payload from model response text.
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

    let cleaned = responseText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

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
      const error = new Error('Failed to parse JSON response from OpenRouter AI');
      error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      error.code = errorCodes.AI_PARSING_ERROR;
      error.details = { rawText: responseText, parseError: parseErr.message };
      throw error;
    }
  }

  /**
   * Sends a prompt to OpenRouter Chat Completions API.
   * Supports calling as:
   * - sendPrompt(systemPrompt, userPrompt)
   * - sendPrompt(promptText)
   * 
   * @param {string} arg1 - System prompt or combined prompt text
   * @param {string} [arg2] - User prompt text if arg1 is system prompt
   * @returns {Promise<Object>} Object containing { text, model, finishReason, usageMetadata, responseTime }
   */
  async sendPrompt(arg1, arg2) {
    this.validateConfig();

    const apiKey = this.getApiKey();
    const activeModel = this.getModel();

    let systemContent = 'You are a precise career analyst. Always return valid JSON only.';
    let userContent = '';

    if (arg2 !== undefined && typeof arg2 === 'string') {
      systemContent = arg1;
      userContent = arg2;
    } else if (typeof arg1 === 'string') {
      userContent = arg1;
    } else {
      const err = new Error('Invalid prompt text provided to OpenRouterService');
      err.statusCode = httpStatus.BAD_REQUEST;
      err.code = errorCodes.VALIDATION_ERROR;
      throw err;
    }

    // Diagnostic logging before request execution
    logger.info(
      {
        provider: this.provider,
        model: activeModel,
        hasApiKey: !!apiKey,
        keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'NONE',
        apiUrl: this.apiUrl
      },
      'Dispatching prompt request to OpenRouter API'
    );

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    const startTime = Date.now();

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'CareerPilot AI'
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
          ],
          temperature: 0.3,
          max_tokens: 1500
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutTimer);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const responseHeaders = response.headers ? Object.fromEntries(response.headers.entries()) : {};

        // Log complete diagnostic upstream error payload
        logger.error(
          {
            provider: this.provider,
            model: activeModel,
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            upstreamResponseBody: errorText
          },
          `Upstream OpenRouter API error response (HTTP ${response.status})`
        );
        
        if (response.status === 401) {
          const err = new Error('Unauthorized: Invalid OpenRouter API key provided');
          err.statusCode = httpStatus.UNAUTHORIZED;
          err.code = errorCodes.AI_CONFIG_ERROR;
          err.upstreamResponseBody = errorText;
          throw err;
        }

        if (response.status === 429 || errorText.toLowerCase().includes('rate limit') || errorText.toLowerCase().includes('quota')) {
          const err = new Error('The AI service is temporarily unavailable because the current API quota has been reached. Please try again later.');
          err.statusCode = httpStatus.TOO_MANY_REQUESTS || 429;
          err.code = errorCodes.AI_SERVICE_ERROR;
          err.upstreamResponseBody = errorText;
          throw err;
        }

        const err = new Error(`OpenRouter API request failed with status ${response.status}: ${errorText}`);
        err.statusCode = response.status >= 500 ? httpStatus.SERVICE_UNAVAILABLE : httpStatus.BAD_REQUEST;
        err.code = errorCodes.AI_SERVICE_ERROR;
        err.upstreamResponseBody = errorText;
        throw err;
      }

      const json = await response.json();
      const text = json.choices?.[0]?.message?.content;

      if (!text || typeof text !== 'string') {
        const err = new Error('Empty or invalid content returned from OpenRouter AI response');
        err.statusCode = httpStatus.SERVICE_UNAVAILABLE;
        err.code = errorCodes.AI_PARSING_ERROR;
        throw err;
      }

      const usageMetadata = json.usage || null;
      const finishReason = json.choices?.[0]?.finish_reason || 'stop';

      // Structured Pino logging
      logger.info(
        {
          provider: this.provider,
          model: activeModel,
          responseTime,
          usageMetadata
        },
        'OpenRouter AI prompt completed successfully'
      );

      return {
        text,
        model: activeModel,
        finishReason,
        usageMetadata,
        responseTime
      };
    } catch (error) {
      clearTimeout(timeoutTimer);

      if (error.name === 'AbortError') {
        const err = new Error(`OpenRouter AI request timed out after ${this.timeoutMs}ms`);
        err.statusCode = httpStatus.SERVICE_UNAVAILABLE;
        err.code = errorCodes.AI_SERVICE_ERROR;
        throw err;
      }

      throw error;
    }
  }

  /**
   * Readiness check method for OpenRouter service.
   */
  async testConnection() {
    const result = await this.sendPrompt('You are helpful.', 'Reply with exactly: CareerPilot AI Working');
    const returnedText = (result.text || '').trim();

    if (!returnedText.includes('CareerPilot AI Working')) {
      const error = new Error(`OpenRouter connection test failed: Received "${returnedText}"`);
      error.statusCode = httpStatus.SERVICE_UNAVAILABLE;
      error.code = errorCodes.AI_SERVICE_ERROR;
      throw error;
    }

    return {
      status: 'online',
      provider: this.provider,
      model: result.model,
      responseTime: result.responseTime
    };
  }
}

const openRouterService = new OpenRouterService();
module.exports = openRouterService;
