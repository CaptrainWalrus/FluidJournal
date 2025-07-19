// Use native fetch (Node.js 18+) or require node-fetch if available
const fetch = globalThis.fetch || (() => {
  try {
    return require('node-fetch');
  } catch (e) {
    throw new Error('Neither native fetch nor node-fetch is available. Please use Node.js 18+ or install node-fetch.');
  }
})();

/**
 * Agentic Memory Client
 * Handles communication with the Storage Agent for vector storage
 */
class AgenticMemoryClient {
  constructor() {
    this.baseUrl = process.env.AGENTIC_MEMORY_URL || 'http://localhost:3015';
    this.timeout = parseInt(process.env.AGENTIC_MEMORY_TIMEOUT) || 5000;
    this.enabled = process.env.AGENTIC_MEMORY_ENABLED === 'true';
    this.retryAttempts = 2;
    
    console.log(`AgenticMemoryClient initialized: enabled=${this.enabled}, url=${this.baseUrl}`);
  }

  /**
   * Store a feature vector from position deregistration
   * @param {Object} vectorData - Vector data to store
   * @returns {Promise<Object>} Storage result
   */
  async storeVector(vectorData) {
    if (!this.enabled) {
      return { success: false, reason: 'Agentic Memory disabled' };
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const startTime = Date.now();
        
        const response = await fetch(`${this.baseUrl}/api/store-vector`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(vectorData),
          timeout: this.timeout
        });

        const duration = Date.now() - startTime;
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        console.log(`[AGENTIC-MEMORY] Vector stored successfully`, {
          vectorId: result.vectorId,
          entrySignalId: vectorData.entrySignalId,
          duration,
          attempt
        });

        return {
          success: true,
          vectorId: result.vectorId,
          duration
        };

      } catch (error) {
        lastError = error;
        
        console.error(`[AGENTIC-MEMORY] Store attempt ${attempt} failed:`, {
          error: error.message,
          entrySignalId: vectorData.entrySignalId,
          attempt,
          willRetry: attempt < this.retryAttempts
        });

        // Wait before retry (exponential backoff)
        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    // All attempts failed
    console.error(`[AGENTIC-MEMORY] Failed to store vector after ${this.retryAttempts} attempts:`, {
      finalError: lastError.message,
      entrySignalId: vectorData.entrySignalId
    });

    return {
      success: false,
      error: lastError.message
    };
  }

  /**
   * Health check for Storage Agent
   * @returns {Promise<boolean>} Whether service is healthy
   */
  async healthCheck() {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        timeout: 2000 // Shorter timeout for health checks
      });

      return response.ok;

    } catch (error) {
      console.warn(`[AGENTIC-MEMORY] Health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object|null>} Stats or null if failed
   */
  async getStats() {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/stats`, {
        method: 'GET',
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.stats || result; // Handle both wrapped and unwrapped responses

    } catch (error) {
      console.error(`[AGENTIC-MEMORY] Failed to get stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Store features at registration time (Split Storage Phase 1)
   * @param {Object} featureData - Feature data to store
   * @returns {Promise<Object>} Storage result
   */
  async storeFeatures(featureData) {
    if (!this.enabled) {
      return { success: false, reason: 'Agentic Memory disabled' };
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const startTime = Date.now();
        
        const response = await fetch(`${this.baseUrl}/api/store-features`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(featureData),
          timeout: this.timeout
        });

        const duration = Date.now() - startTime;
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        console.log(`[SPLIT-STORAGE] Features stored successfully`, {
          vectorId: result.vectorId,
          entrySignalId: featureData.entrySignalId,
          duration,
          attempt
        });

        return {
          success: true,
          vectorId: result.vectorId,
          duration
        };

      } catch (error) {
        lastError = error;
        
        console.error(`[SPLIT-STORAGE] Store features attempt ${attempt} failed:`, {
          error: error.message,
          entrySignalId: featureData.entrySignalId,
          attempt,
          willRetry: attempt < this.retryAttempts
        });

        // Wait before retry (exponential backoff)
        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    return {
      success: false,
      error: lastError.message
    };
  }

  /**
   * Store outcome at deregistration time (Split Storage Phase 2)
   * @param {Object} outcomeData - Outcome data to store
   * @returns {Promise<Object>} Storage result
   */
  async storeOutcome(outcomeData) {
    if (!this.enabled) {
      return { success: false, reason: 'Agentic Memory disabled' };
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const startTime = Date.now();
        
        const response = await fetch(`${this.baseUrl}/api/store-outcome`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(outcomeData),
          timeout: this.timeout
        });

        const duration = Date.now() - startTime;
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        console.log(`[SPLIT-STORAGE] Outcome stored successfully`, {
          vectorId: result.vectorId,
          entrySignalId: outcomeData.entrySignalId,
          duration,
          attempt
        });

        return {
          success: true,
          vectorId: result.vectorId,
          duration
        };

      } catch (error) {
        lastError = error;
        
        console.error(`[SPLIT-STORAGE] Store outcome attempt ${attempt} failed:`, {
          error: error.message,
          entrySignalId: outcomeData.entrySignalId,
          attempt,
          willRetry: attempt < this.retryAttempts
        });

        // Wait before retry (exponential backoff)
        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    return {
      success: false,
      error: lastError.message
    };
  }

  /**
   * Query similar vectors (for future Risk Agent use)
   * @param {Array} features - Feature vector to find similar patterns for
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Similar vectors
   */
  async querySimilar(features, options = {}) {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/query-similar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          features,
          ...options
        }),
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.results || [];

    } catch (error) {
      console.error(`[AGENTIC-MEMORY] Failed to query similar vectors: ${error.message}`);
      return [];
    }
  }

  /**
   * Get vectors with filters
   * @param {Object} filters - Filter options (instrument, since, limit, entryType)
   * @returns {Promise<Array>} Array of vectors
   */
  async getVectors(filters = {}) {
    if (!this.enabled) {
      return [];
    }

    try {
      const queryParams = new URLSearchParams();
      if (filters.instrument) queryParams.append('instrument', filters.instrument);
      if (filters.since) queryParams.append('since', filters.since);
      if (filters.limit) queryParams.append('limit', filters.limit);
      if (filters.entryType) queryParams.append('entryType', filters.entryType);

      const response = await fetch(`${this.baseUrl}/api/vectors?${queryParams}`, {
        method: 'GET',
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.vectors || [];

    } catch (error) {
      console.error(`[AGENTIC-MEMORY] Failed to get vectors: ${error.message}`);
      return [];
    }
  }

  /**
   * Test the connection with sample data
   * @returns {Promise<boolean>} Whether test succeeded
   */
  async testConnection() {
    if (!this.enabled) {
      console.log('[AGENTIC-MEMORY] Test skipped - service disabled');
      return false;
    }

    try {
      // Test health check first
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        console.error('[AGENTIC-MEMORY] Health check failed');
        return false;
      }

      console.log('[AGENTIC-MEMORY] Connection test passed');
      return true;

    } catch (error) {
      console.error(`[AGENTIC-MEMORY] Connection test failed: ${error.message}`);
      return false;
    }
  }
}

module.exports = AgenticMemoryClient;