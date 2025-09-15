/**
 * Database performance settings and configuration presets
 * 
 * Optimized SQLite configurations for different use cases:
 * - Development: Fast startup, debugging enabled
 * - Production: Maximum performance, reliability
 * - Memory: In-memory operations for testing
 */

import type { DatabaseConfig } from '../types/database-types.js'

/**
 * Base performance PRAGMA settings for optimal SQLite performance
 */
export const BASE_PERFORMANCE_PRAGMAS = {
  // Enable WAL mode for better concurrency and crash recovery
  journal_mode: 'WAL',
  
  // Optimize for faster writes (NORMAL is safer than OFF but faster than FULL)
  synchronous: 'NORMAL',
  
  // Enable foreign key constraints
  foreign_keys: 'ON',
  
  // Optimize page size for modern SSD storage
  page_size: '4096',
  
  // Auto-vacuum to maintain performance over time
  auto_vacuum: 'INCREMENTAL',
  
  // Use memory for temporary storage
  temp_store: 'MEMORY',
  
  // Optimize query planner
  optimize: '',
} as const

/**
 * Development configuration - prioritizes debugging and fast iteration
 */
export const DEVELOPMENT_PRAGMAS = {
  ...BASE_PERFORMANCE_PRAGMAS,
  
  // Smaller cache for development to reduce memory usage
  cache_size: '-8000', // 8MB
  
  // Faster checkpoint interval for development
  wal_autocheckpoint: '1000',
  
  // Minimal mmap for easier debugging
  mmap_size: '67108864', // 64MB
} as const

/**
 * Production configuration - optimized for maximum performance and reliability
 */
export const PRODUCTION_PRAGMAS = {
  ...BASE_PERFORMANCE_PRAGMAS,
  
  // Large cache size for production workloads
  cache_size: '-131072', // 128MB
  
  // Less frequent checkpoints for better write performance
  wal_autocheckpoint: '10000',
  
  // Large memory-mapped I/O for better read performance
  mmap_size: '1073741824', // 1GB
  
  // Enable query planner analysis
  analysis_limit: '1000',
  
  // Optimize for read-heavy workloads
  threads: '4',
} as const

/**
 * Memory configuration - for in-memory databases and testing
 */
export const MEMORY_PRAGMAS = {
  ...BASE_PERFORMANCE_PRAGMAS,
  
  // Use memory journal for fastest performance
  journal_mode: 'MEMORY',
  
  // Disable synchronization for memory DBs
  synchronous: 'OFF',
  
  // Large cache since we're already in memory
  cache_size: '-262144', // 256MB
  
  // No WAL checkpoints needed for memory DBs
  wal_autocheckpoint: '0',
  
  // Maximum mmap for memory operations
  mmap_size: '2147483648', // 2GB
} as const

/**
 * High-performance configuration for large datasets (1M+ nodes)
 */
export const HIGH_PERFORMANCE_PRAGMAS = {
  ...PRODUCTION_PRAGMAS,
  
  // Very large cache for big datasets
  cache_size: '-524288', // 512MB
  
  // Aggressive memory mapping
  mmap_size: '4294967296', // 4GB
  
  // Optimize for bulk operations
  wal_autocheckpoint: '50000',
  
  // Enable additional optimizations
  case_sensitive_like: 'ON',
  count_changes: 'OFF',
  empty_result_callbacks: 'OFF',
} as const

/**
 * Configuration presets for different environments
 */
export const CONFIG_PRESETS: Record<string, Partial<DatabaseConfig>> = {
  development: {
    pragmas: DEVELOPMENT_PRAGMAS,
    maxConnections: 3,
    timeout: 5000,
    enableWAL: true,
    enableFTS: true,
    autoVacuum: false,
  },
  
  production: {
    pragmas: PRODUCTION_PRAGMAS,
    maxConnections: 10,
    timeout: 30000,
    enableWAL: true,
    enableFTS: true,
    autoVacuum: true,
    backupInterval: 3600000, // 1 hour
  },
  
  testing: {
    pragmas: MEMORY_PRAGMAS,
    maxConnections: 1,
    timeout: 1000,
    memory: true,
    enableWAL: false,
    enableFTS: true,
    autoVacuum: false,
  },
  
  'high-performance': {
    pragmas: HIGH_PERFORMANCE_PRAGMAS,
    maxConnections: 5,
    timeout: 60000,
    enableWAL: true,
    enableFTS: true,
    autoVacuum: true,
    backupInterval: 7200000, // 2 hours
  },
} as const

/**
 * Get configuration for a specific environment
 */
export function getConfigPreset(environment: keyof typeof CONFIG_PRESETS): Partial<DatabaseConfig> {
  const preset = CONFIG_PRESETS[environment]
  if (!preset) {
    throw new Error(`Unknown configuration preset: ${environment}`)
  }
  return preset
}

/**
 * Merge configuration presets with custom overrides
 */
export function mergeConfig(
  preset: keyof typeof CONFIG_PRESETS,
  overrides: Partial<DatabaseConfig> = {}
): Partial<DatabaseConfig> {
  const baseConfig = getConfigPreset(preset)
  
  return {
    ...baseConfig,
    ...overrides,
    pragmas: {
      ...baseConfig.pragmas,
      ...overrides.pragmas,
    },
  }
}

/**
 * Validate database configuration
 */
export function validateConfig(config: DatabaseConfig): void {
  const errors: string[] = []
  
  // Validate required fields
  if (!config.path && !config.memory) {
    errors.push('Database path is required unless using memory mode')
  }
  
  if (config.timeout < 0) {
    errors.push('Timeout must be non-negative')
  }
  
  if (config.maxConnections < 1) {
    errors.push('Max connections must be at least 1')
  }
  
  // Validate PRAGMA values
  if (config.pragmas) {
    const validJournalModes = ['DELETE', 'TRUNCATE', 'PERSIST', 'MEMORY', 'WAL', 'OFF']
    const journalMode = config.pragmas.journal_mode
    if (journalMode && !validJournalModes.includes(String(journalMode).toUpperCase())) {
      errors.push(`Invalid journal_mode: ${journalMode}`)
    }
    
    const validSyncModes = ['OFF', 'NORMAL', 'FULL', 'EXTRA']
    const syncMode = config.pragmas.synchronous
    if (syncMode && !validSyncModes.includes(String(syncMode).toUpperCase())) {
      errors.push(`Invalid synchronous mode: ${syncMode}`)
    }
    
    const cacheSize = config.pragmas.cache_size
    if (cacheSize && typeof cacheSize === 'string') {
      const numericValue = parseInt(cacheSize.replace('-', ''))
      if (isNaN(numericValue) || numericValue === 0) {
        errors.push(`Invalid cache_size: ${cacheSize}`)
      }
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
  }
}

/**
 * Performance monitoring thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
  // Query execution time thresholds (milliseconds)
  SLOW_QUERY_THRESHOLD: 100,
  VERY_SLOW_QUERY_THRESHOLD: 1000,
  
  // Connection pool thresholds
  HIGH_CONNECTION_USAGE: 0.8, // 80% of max connections
  
  // Database size thresholds (bytes)
  LARGE_DATABASE_SIZE: 1024 * 1024 * 1024, // 1GB
  VERY_LARGE_DATABASE_SIZE: 10 * 1024 * 1024 * 1024, // 10GB
  
  // Cache hit rate threshold
  LOW_CACHE_HIT_RATE: 0.85, // 85%
} as const

/**
 * Get recommended configuration based on expected data size
 */
export function getRecommendedConfig(estimatedNodes: number): Partial<DatabaseConfig> {
  if (estimatedNodes < 10000) {
    return getConfigPreset('development')
  } else if (estimatedNodes < 100000) {
    return getConfigPreset('production')
  } else {
    return getConfigPreset('high-performance')
  }
}

/**
 * Optimize configuration for specific use cases
 */
export const USE_CASE_OPTIMIZATIONS = {
  // Optimized for bulk import operations
  bulk_import: {
    pragmas: {
      ...PRODUCTION_PRAGMAS,
      synchronous: 'OFF', // Faster imports at slight risk
      wal_autocheckpoint: '100000', // Less frequent checkpoints
      temp_store: 'MEMORY',
      cache_size: '-262144', // 256MB cache
    },
  },
  
  // Optimized for read-heavy workloads (search, queries)
  read_heavy: {
    pragmas: {
      ...PRODUCTION_PRAGMAS,
      mmap_size: '2147483648', // 2GB mmap
      cache_size: '-524288', // 512MB cache
      threads: '8', // More threads for read operations
    },
  },
  
  // Optimized for real-time updates
  real_time: {
    pragmas: {
      ...PRODUCTION_PRAGMAS,
      synchronous: 'FULL', // Maximum durability
      wal_autocheckpoint: '1000', // Frequent checkpoints
      busy_timeout: '30000', // Higher timeout for busy database
    },
  },
} as const

/**
 * Apply use case specific optimizations
 */
export function applyUseCaseOptimization(
  baseConfig: DatabaseConfig,
  useCase: keyof typeof USE_CASE_OPTIMIZATIONS
): DatabaseConfig {
  const optimization = USE_CASE_OPTIMIZATIONS[useCase]
  
  return {
    ...baseConfig,
    pragmas: {
      ...baseConfig.pragmas,
      ...optimization.pragmas,
    },
  }
}