/**
 * Database schema export index
 * 
 * Central export point for all schema-related definitions and utilities
 */

// Core schema definitions
export * from './definitions.js'
export * from './indexes.js'

// Migration utilities
export { readMigrationFile, getMigrationVersion } from './migration-utils.js'

// Schema validation and setup utilities
import { createDatabaseSchema, PERFORMANCE_PRAGMAS } from './definitions.js'
import { createAllIndexes } from './indexes.js'

/**
 * Complete database initialization function
 * Returns all SQL statements needed to set up the database
 */
export function getCompleteSchemaSQL(): string[] {
  const statements: string[] = []
  
  // Add PRAGMA settings
  Object.entries(PERFORMANCE_PRAGMAS).forEach(([pragma, value]) => {
    statements.push(`PRAGMA ${pragma} = ${value};`)
  })
  
  // Add table creation statements
  statements.push(...createDatabaseSchema())
  
  // Add index creation statements
  statements.push(...createAllIndexes())
  
  // Add final optimization
  statements.push('ANALYZE;')
  statements.push('PRAGMA optimize;')
  
  return statements
}

/**
 * Get migration file paths in order
 */
export function getMigrationFiles(): string[] {
  return [
    './migrations/001_initial.sql',
    './migrations/002_indexes.sql',
  ]
}

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = 2