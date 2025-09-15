/**
 * Migration utilities for database schema management
 * 
 * Provides functions for reading migration files and managing schema versions
 */

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Read a migration file from the migrations directory
 */
export async function readMigrationFile(filename: string): Promise<string> {
  const migrationPath = join(__dirname, 'migrations', filename)
  try {
    return await readFile(migrationPath, 'utf-8')
  } catch (error) {
    throw new Error(`Failed to read migration file ${filename}: ${error}`)
  }
}

/**
 * Extract version number from migration filename
 */
export function getMigrationVersion(filename: string): number {
  const match = filename.match(/^(\d+)_/)
  if (!match) {
    throw new Error(`Invalid migration filename format: ${filename}`)
  }
  return parseInt(match[1], 10)
}

/**
 * Generate checksum for migration content
 */
export async function generateMigrationChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Parse migration file content to extract metadata
 */
export interface MigrationMetadata {
  version: number
  description: string
  statements: string[]
  checksum: string
}

export async function parseMigrationFile(filename: string): Promise<MigrationMetadata> {
  const content = await readMigrationFile(filename)
  const version = getMigrationVersion(filename)
  const checksum = await generateMigrationChecksum(content)
  
  // Extract description from comment
  const descriptionMatch = content.match(/-- Description: (.+)/i)
  const description = descriptionMatch?.[1] || `Migration ${version}`
  
  // Split content into individual statements
  const statements = content
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    .map(stmt => stmt + ';')
  
  return {
    version,
    description,
    statements,
    checksum
  }
}

/**
 * Validate migration file integrity
 */
export async function validateMigration(filename: string): Promise<boolean> {
  try {
    const metadata = await parseMigrationFile(filename)
    
    // Basic validation checks
    if (metadata.version <= 0) {
      throw new Error(`Invalid version number: ${metadata.version}`)
    }
    
    if (metadata.statements.length === 0) {
      throw new Error('Migration contains no SQL statements')
    }
    
    if (metadata.description.length === 0) {
      throw new Error('Migration has no description')
    }
    
    return true
  } catch (error) {
    console.error(`Migration validation failed for ${filename}:`, error)
    return false
  }
}