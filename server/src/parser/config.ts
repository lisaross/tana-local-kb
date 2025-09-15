/**
 * Parser configuration and constants
 */

import { ParserOptions } from './types'

// Performance constants
export const PARSER_CONSTANTS = {
  DEFAULT_BATCH_SIZE: 1000,
  DEFAULT_MEMORY_LIMIT_MB: 100,
  DEFAULT_PROGRESS_INTERVAL_MS: 1000,
  DEFAULT_MAX_ERRORS: 1000,
  
  // Buffer sizes for streaming
  FILE_READ_BUFFER_SIZE: 64 * 1024, // 64KB
  JSON_PARSE_BUFFER_SIZE: 10 * 1024, // 10KB
  
  // Memory management
  GC_TRIGGER_INTERVAL: 1000, // Trigger GC every N nodes
  MEMORY_CHECK_INTERVAL: 100, // Check memory every N nodes
  
  // System node patterns
  SYSTEM_NODE_PREFIXES: ['SYS_', 'SYSTEM_', '_'],
  SYSTEM_NODE_NAMES: [
    'System',
    'Templates',
    'Daily notes',
    'Inbox',
    'Home',
    'Library',
    'Schema',
    'Configuration',
    'Settings',
    'Workspace',
    'All pages',
    'Supertags',
    'Fields',
    'Trash',
    'Archive'
  ],
  
  // Content normalization
  MAX_CONTENT_LENGTH: 10000,
  CONTENT_TRUNCATE_SUFFIX: '... [truncated]'
} as const

// Environment-based configuration
export function getEnvironmentConfig(): Partial<ParserOptions> {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const isProduction = process.env.NODE_ENV === 'production'
  const isTesting = process.env.NODE_ENV === 'test'
  
  // Base configuration
  const config: Partial<ParserOptions> = {
    continueOnError: !isTesting, // Stop on errors in tests
    preserveRawData: isDevelopment, // Keep raw data in development
  }
  
  // Development-specific settings
  if (isDevelopment) {
    config.progressInterval = 500 // More frequent updates
    config.maxErrors = 10 // Fail fast in development
    config.memoryLimit = 200 // Higher limit for development
  }
  
  // Production-specific settings
  if (isProduction) {
    config.progressInterval = 5000 // Less frequent updates
    config.maxErrors = 10000 // More tolerant of errors
    config.memoryLimit = 100 // Conservative memory limit
    config.preserveRawData = false // Save memory
  }
  
  // Test-specific settings
  if (isTesting) {
    config.progressInterval = 10000 // Minimal progress updates
    config.continueOnError = false // Stop on first error
    config.memoryLimit = 50 // Low limit for tests
  }
  
  return config
}

// Configuration presets
export const PARSER_PRESETS = {
  // Fast parsing with minimal validation
  FAST: {
    skipSystemNodes: true,
    batchSize: 2000,
    memoryLimit: 200,
    continueOnError: true,
    maxErrors: 10000,
    preserveRawData: false,
    normalizeContent: false,
    progressInterval: 2000
  },
  
  // Balanced parsing with good error handling
  BALANCED: {
    skipSystemNodes: true,
    batchSize: 1000,
    memoryLimit: 100,
    continueOnError: true,
    maxErrors: 1000,
    preserveRawData: false,
    normalizeContent: true,
    progressInterval: 1000
  },
  
  // Thorough parsing with validation
  THOROUGH: {
    skipSystemNodes: true,
    batchSize: 500,
    memoryLimit: 150,
    continueOnError: true,
    maxErrors: 100,
    preserveRawData: true,
    normalizeContent: true,
    progressInterval: 500
  },
  
  // Memory-constrained parsing
  MEMORY_EFFICIENT: {
    skipSystemNodes: true,
    batchSize: 250,
    memoryLimit: 50,
    continueOnError: true,
    maxErrors: 1000,
    preserveRawData: false,
    normalizeContent: false,
    progressInterval: 2000
  }
} as const

export type ParserPreset = keyof typeof PARSER_PRESETS

/**
 * Get parser options from a preset
 */
export function getParserPreset(preset: ParserPreset): ParserOptions {
  const baseConfig = PARSER_PRESETS[preset]
  const envConfig = getEnvironmentConfig()
  
  return {
    ...baseConfig,
    ...envConfig,
    includeFields: [],
    excludeFields: []
  } as ParserOptions
}