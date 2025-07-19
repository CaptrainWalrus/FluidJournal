/**
 * config.js - Central configuration for service ports
 * This file provides port information for services in the CurvesV2 system
 */

// Define service ports
const SERVICE_PORTS = {
  "curvesv2-server": { port: 3002 },
  "metrics-dashboard": { port: 3003 },
  "dtw-service": { port: 5000 },
  "signal-pool-service": { port: 3004 },
  "pattern-dashboard": { port: 3001 },
  "pattern-toolkit": { port: 3006 },
  "control-panel": { port: 8080 }
};

/**
 * Get the port for a specific service
 * @param {string} serviceName - The name of the service
 * @returns {number|undefined} The port number or undefined if not found
 */
function getServicePort(serviceName) {
  return SERVICE_PORTS[serviceName]?.port;
}

/**
 * Get all service configurations
 * @returns {Object} All service configurations
 */
function getServices() {
  return SERVICE_PORTS;
}

// Pattern matching configuration
const PATTERN_MATCHING = {
  MIN_BARS_REQUIRED: 20,
  MAX_BARS_STORED: 300,
  DEFAULT_OPTIONS: {
    focusBarCount: 20
  }
};

/**
 * Get configuration for a specific context
 * @param {string} contextName - The name of the context
 * @returns {Object} Configuration for the context
 */
function getContextConfig(contextName) {
  // Default pattern options for different contexts
  const configs = {
    'timeline': {
      pattern: {
        DEFAULT_OPTIONS: {
          focusBarCount: 20
        }
      }
    },
    'realtime': {
      pattern: {
        DEFAULT_OPTIONS: {
          focusBarCount: 10
        }
      }
    }
  };
  
  return configs[contextName] || configs['realtime']; // Default to realtime if context not found
}

module.exports = {
  getServicePort,
  getServices,
  getContextConfig,
  PATTERN_MATCHING
}; 