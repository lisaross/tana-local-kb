/**
 * Environment-specific database configuration management
 * 
 * Handles configuration loading from environment variables, validates settings,
 * and provides environment-specific defaults for development, testing, and production.
 */

import { join } from 'path'
import type { DatabaseConfig } from '../types/database-types.js'
import { getConfigPreset, mergeConfig, validateConfig, CONFIG_PRESETS } from './settings.js'

/**
 * Environment variable names for database configuration
 */
export const ENV_VARS = {
  DATABASE_PATH: 'DATABASE_PATH',
  DATABASE_MEMORY: 'DATABASE_MEMORY',
  DATABASE_READ_ONLY: 'DATABASE_READ_ONLY',
  DATABASE_TIMEOUT: 'DATABASE_TIMEOUT',
  DATABASE_MAX_CONNECTIONS: 'DATABASE_MAX_CONNECTIONS',
  DATABASE_ENABLE_WAL: 'DATABASE_ENABLE_WAL',
  DATABASE_ENABLE_FTS: 'DATABASE_ENABLE_FTS',
  DATABASE_AUTO_VACUUM: 'DATABASE_AUTO_VACUUM',
  DATABASE_BACKUP_INTERVAL: 'DATABASE_BACKUP_INTERVAL',
  DATABASE_LOG_QUERIES: 'DATABASE_LOG_QUERIES',
  DATABASE_LOG_SLOW_QUERIES: 'DATABASE_LOG_SLOW_QUERIES',
  NODE_ENV: 'NODE_ENV',
  DATABASE_PRESET: 'DATABASE_PRESET',
} as const

/**
 * Default database paths for different environments
 */
export const DEFAULT_PATHS = {
  development: './data/tana-kb-dev.db',
  test: ':memory:',
  testing: ':memory:',
  production: './data/tana-kb.db',
} as const

/**
 * Get environment type from NODE_ENV
 */
export function getEnvironment(): string {
  return process.env.NODE_ENV || 'development'
}

/**
 * Get database path based on environment
 */
export function getDatabasePath(): string {
  // Check for explicit path override
  if (process.env[ENV_VARS.DATABASE_PATH]) {
    return process.env[ENV_VARS.DATABASE_PATH]!
  }

  // Use in-memory for memory mode
  if (process.env[ENV_VARS.DATABASE_MEMORY] === 'true') {
    return ':memory:'
  }

  // Get environment-specific default
  const env = getEnvironment()
  const defaultPath = DEFAULT_PATHS[env as keyof typeof DEFAULT_PATHS] || DEFAULT_PATHS.development

  // For file-based databases, ensure the path is absolute
  if (defaultPath !== ':memory:' && !defaultPath.startsWith('/')) {
    return join(process.cwd(), defaultPath)
  }

  return defaultPath
}

/**
 * Parse boolean environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

/**
 * Parse integer environment variable
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Load configuration from environment variables
 */
export function loadEnvironmentConfig(): Partial<DatabaseConfig> {
  const env = getEnvironment()
  const isMemory = parseBoolean(process.env[ENV_VARS.DATABASE_MEMORY], env === 'test' || env === 'testing')
  
  return {
    path: getDatabasePath(),
    memory: isMemory,
    readOnly: parseBoolean(process.env[ENV_VARS.DATABASE_READ_ONLY], false),
    timeout: parseInteger(process.env[ENV_VARS.DATABASE_TIMEOUT], 30000),
    maxConnections: parseInteger(process.env[ENV_VARS.DATABASE_MAX_CONNECTIONS], 5),
    enableWAL: parseBoolean(process.env[ENV_VARS.DATABASE_ENABLE_WAL], !isMemory),
    enableFTS: parseBoolean(process.env[ENV_VARS.DATABASE_ENABLE_FTS], true),
    autoVacuum: parseBoolean(process.env[ENV_VARS.DATABASE_AUTO_VACUUM], env === 'production'),
    backupInterval: parseInteger(process.env[ENV_VARS.DATABASE_BACKUP_INTERVAL], 0),
  }
}

/**
 * Get complete database configuration for current environment
 */
export function getDatabaseConfig(): DatabaseConfig {
  const env = getEnvironment()
  const preset = process.env[ENV_VARS.DATABASE_PRESET] || env
  
  // Start with environment preset
  let config: Partial<DatabaseConfig>
  try {
    config = getConfigPreset(preset as keyof typeof CONFIG_PRESETS)
  } catch {
    // Fallback to development if preset is unknown
    console.warn(`Unknown database preset: ${preset}, falling back to development`)
    config = getConfigPreset('development')
  }
  
  // Merge with environment variables
  const envConfig = loadEnvironmentConfig()
  config = mergeConfig(preset as keyof typeof CONFIG_PRESETS, envConfig)
  
  // Ensure required fields have defaults
  const fullConfig: DatabaseConfig = {
    path: config.path || getDatabasePath(),
    memory: config.memory || false,
    readOnly: config.readOnly || false,
    timeout: config.timeout || 30000,
    maxConnections: config.maxConnections || 5,
    pragmas: config.pragmas || {},
    enableWAL: config.enableWAL || false,
    enableFTS: config.enableFTS || true,
    autoVacuum: config.autoVacuum || false,
    backupInterval: config.backupInterval,
  }
  
  // Validate the final configuration
  validateConfig(fullConfig)
  
  return fullConfig
}

/**
 * Development-specific configuration helpers
 */
export const developmentHelpers = {
  /**
   * Create a temporary in-memory database for testing
   */
  createTestConfig(): DatabaseConfig {
    return {
      path: ':memory:',
      memory: true,
      readOnly: false,
      timeout: 5000,
      maxConnections: 1,
      pragmas: {
        journal_mode: 'MEMORY',
        synchronous: 'OFF',
        foreign_keys: 'ON',
        cache_size: '-8000',
      },
      enableWAL: false,
      enableFTS: true,
      autoVacuum: false,
    }
  },

  /**
   * Create configuration for development database with debugging
   */
  createDevConfig(customPath?: string): DatabaseConfig {
    const config = getDatabaseConfig()
    
    return {
      ...config,
      path: customPath || join(process.cwd(), 'data/tana-kb-dev.db'),
      timeout: 10000,
      maxConnections: 3,
      pragmas: {
        ...config.pragmas,
        // Enable query logging in development
        case_sensitive_like: 'OFF',
      },
    }
  },

  /**
   * Create configuration optimized for imports during development
   */
  createImportConfig(customPath?: string): DatabaseConfig {
    const config = getDatabaseConfig()
    
    return {
      ...config,
      path: customPath || config.path,
      timeout: 60000, // Longer timeout for imports
      pragmas: {
        ...config.pragmas,
        synchronous: 'OFF', // Faster imports
        wal_autocheckpoint: '100000',
        cache_size: '-32000', // 32MB cache
      },
    }
  },
}

/**
 * Production-specific configuration helpers
 */
export const productionHelpers = {
  /**
   * Create production configuration with high reliability
   */
  createProductionConfig(dataDir?: string): DatabaseConfig {
    const basePath = dataDir || join(process.cwd(), 'data')
    
    return {
      path: join(basePath, 'tana-kb.db'),
      memory: false,
      readOnly: false,
      timeout: 30000,
      maxConnections: 10,
      pragmas: {
        journal_mode: 'WAL',
        synchronous: 'NORMAL',
        foreign_keys: 'ON',
        cache_size: '-131072', // 128MB
        mmap_size: '1073741824', // 1GB
        wal_autocheckpoint: '10000',
        temp_store: 'MEMORY',
        auto_vacuum: 'INCREMENTAL',
      },
      enableWAL: true,
      enableFTS: true,
      autoVacuum: true,
      backupInterval: 3600000, // 1 hour
    }
  },

  /**
   * Create read-only configuration for backup or analysis
   */
  createReadOnlyConfig(dbPath: string): DatabaseConfig {
    return {
      path: dbPath,
      memory: false,
      readOnly: true,
      timeout: 15000,
      maxConnections: 5,
      pragmas: {
        query_only: 'ON',
        cache_size: '-65536', // 64MB
        mmap_size: '536870912', // 512MB
        temp_store: 'MEMORY',
      },
      enableWAL: false,
      enableFTS: true,
      autoVacuum: false,
    }
  },
}

/**
 * Configuration validation for different environments
 */
export function validateEnvironmentConfig(): void {
  const config = getDatabaseConfig()
  const env = getEnvironment()
  
  const warnings: string[] = []
  const errors: string[] = []
  
  // Environment-specific validations
  if (env === 'production') {
    if (config.memory) {
      errors.push('Memory databases should not be used in production')
    }
    
    if (!config.enableWAL) {
      warnings.push('WAL mode is recommended for production')
    }
    
    if (!config.autoVacuum) {
      warnings.push('Auto-vacuum is recommended for production')
    }
    
    if (!config.backupInterval) {
      warnings.push('Backup interval should be set for production')
    }
  }
  
  if (env === 'development') {
    if (config.path === ':memory:') {
      warnings.push('Using memory database in development - data will not persist')
    }
  }
  
  // Check file system permissions for file-based databases
  if (!config.memory && config.path !== ':memory:') {
    try {
      // Check if we can write to the database directory
      const dbDir = config.path.includes('/') ? config.path.substring(0, config.path.lastIndexOf('/')) : '.'
      
      // For production, ensure data directory exists
      if (env === 'production' && dbDir === './data') {
        warnings.push('Ensure data directory exists and has proper permissions')
      }
    } catch (error) {
      warnings.push(`Cannot validate database path permissions: ${error}`)
    }
  }
  
  // Log warnings
  if (warnings.length > 0) {
    console.warn('Database configuration warnings:')
    warnings.forEach(warning => console.warn(`  - ${warning}`))
  }
  
  // Throw errors
  if (errors.length > 0) {
    throw new Error(`Database configuration errors:\n${errors.map(e => `  - ${e}`).join('\n')}`)
  }
}

/**
 * Export configuration summary for debugging
 */
export function getConfigSummary(): {
  environment: string
  databasePath: string
  isMemory: boolean
  isReadOnly: boolean
  enabledFeatures: string[]
  pragmaSettings: Record<string, any>
} {
  const config = getDatabaseConfig()
  const env = getEnvironment()
  
  const enabledFeatures: string[] = []
  if (config.enableWAL) enabledFeatures.push('WAL')
  if (config.enableFTS) enabledFeatures.push('FTS')
  if (config.autoVacuum) enabledFeatures.push('Auto-Vacuum')
  if (config.backupInterval) enabledFeatures.push('Auto-Backup')
  
  return {
    environment: env,
    databasePath: config.path,
    isMemory: config.memory,
    isReadOnly: config.readOnly,
    enabledFeatures,
    pragmaSettings: config.pragmas,
  }
}