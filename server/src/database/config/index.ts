/**
 * Database configuration module exports
 * 
 * Central export point for all database configuration functionality
 */

// Connection management
export {
  BunDatabaseConnection,
  BunDatabaseTransaction,
  ConnectionPool,
  createConnection,
  createConnectionPool,
} from './connection.js'

// Performance settings and presets
export {
  BASE_PERFORMANCE_PRAGMAS,
  DEVELOPMENT_PRAGMAS,
  PRODUCTION_PRAGMAS,
  MEMORY_PRAGMAS,
  HIGH_PERFORMANCE_PRAGMAS,
  CONFIG_PRESETS,
  PERFORMANCE_THRESHOLDS,
  USE_CASE_OPTIMIZATIONS,
  getConfigPreset,
  mergeConfig,
  validateConfig,
  getRecommendedConfig,
  applyUseCaseOptimization,
} from './settings.js'

// Environment configuration
export {
  ENV_VARS,
  DEFAULT_PATHS,
  getEnvironment,
  getDatabasePath,
  loadEnvironmentConfig,
  getDatabaseConfig,
  developmentHelpers,
  productionHelpers,
  validateEnvironmentConfig,
  getConfigSummary,
} from './environment.js'

// Re-export types for convenience
export type {
  DatabaseConfig,
  DatabaseConnection,
  DatabaseTransaction,
  DatabaseEvent,
  DatabaseEventHandler,
  DatabaseError,
  QueryPerformance,
} from '../types/database-types.js'