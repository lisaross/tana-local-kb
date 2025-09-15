/**
 * Database migration system for Tana Local KB
 * 
 * Provides version control for database schema changes with support for
 * applying and rolling back migrations, validation, and comprehensive logging.
 */

import { createHash } from 'crypto'
import type {
  DatabaseConnection,
  MigrationDefinition,
  MigrationResult,
} from '../../types/database-types.js'
import { SchemaVersionError, DatabaseError } from '../../types/database-types.js'
import type { SchemaVersionRecord } from '../../types/schema.js'
import { CURRENT_SCHEMA_VERSION } from '../index.js'

/**
 * Migration definitions in chronological order
 */
export const MIGRATIONS: MigrationDefinition[] = [
  {
    version: 1,
    description: 'Initial database schema with core tables and triggers',
    up: [
      // Tables first
      `CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) > 0 AND length(id) <= 100),
        name TEXT NOT NULL CHECK(length(name) <= 1000),
        content TEXT NOT NULL DEFAULT '' CHECK(length(content) <= 1000000),
        doc_type TEXT CHECK(length(doc_type) <= 100),
        owner_id TEXT CHECK(length(owner_id) <= 100),
        created_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(created_at) IS NOT NULL),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(updated_at) IS NOT NULL),
        node_type TEXT NOT NULL CHECK(node_type IN ('node', 'field', 'reference')),
        is_system_node INTEGER NOT NULL DEFAULT 0 CHECK(is_system_node IN (0, 1)),
        fields_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(fields_json) AND length(fields_json) <= 100000),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json) AND length(metadata_json) <= 100000),
        FOREIGN KEY (owner_id) REFERENCES nodes(id) ON DELETE SET NULL
      ) STRICT`,
      
      `CREATE TABLE IF NOT EXISTS node_hierarchy (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
        parent_id TEXT NOT NULL CHECK(length(parent_id) <= 100),
        child_id TEXT NOT NULL CHECK(length(child_id) <= 100),
        position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
        created_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(created_at) IS NOT NULL),
        FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (child_id) REFERENCES nodes(id) ON DELETE CASCADE,
        CHECK(parent_id != child_id),
        UNIQUE(parent_id, child_id)
      ) STRICT`,
      
      `CREATE TABLE IF NOT EXISTS node_references (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
        source_id TEXT NOT NULL CHECK(length(source_id) <= 100),
        target_id TEXT NOT NULL CHECK(length(target_id) <= 100),
        reference_type TEXT NOT NULL DEFAULT 'reference' CHECK(length(reference_type) <= 50),
        context TEXT CHECK(length(context) <= 1000),
        created_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(created_at) IS NOT NULL),
        FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE,
        CHECK(source_id != target_id),
        UNIQUE(source_id, target_id, reference_type)
      ) STRICT`,
      
      `CREATE VIRTUAL TABLE IF NOT EXISTS node_search USING fts5(
        id UNINDEXED,
        name,
        content,
        tags,
        tokenize = 'porter unicode61 remove_diacritics 1'
      )`,
      
      `CREATE TABLE IF NOT EXISTS node_stats (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
        node_id TEXT NOT NULL UNIQUE CHECK(length(node_id) <= 100),
        access_count INTEGER NOT NULL DEFAULT 0 CHECK(access_count >= 0),
        reference_count INTEGER NOT NULL DEFAULT 0 CHECK(reference_count >= 0),
        child_count INTEGER NOT NULL DEFAULT 0 CHECK(child_count >= 0),
        depth_level INTEGER NOT NULL DEFAULT 0 CHECK(depth_level >= 0 AND depth_level <= 100),
        last_accessed TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(last_accessed) IS NOT NULL),
        computed_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(computed_at) IS NOT NULL),
        FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
      ) STRICT`,
      
      `CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
        filename TEXT NOT NULL CHECK(length(filename) > 0 AND length(filename) <= 500),
        file_hash TEXT NOT NULL CHECK(length(file_hash) = 64),
        node_count INTEGER NOT NULL DEFAULT 0 CHECK(node_count >= 0),
        started_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(started_at) IS NOT NULL),
        completed_at TEXT CHECK(datetime(completed_at) IS NOT NULL OR completed_at IS NULL),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        error_message TEXT CHECK(length(error_message) <= 10000),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json) AND length(metadata_json) <= 100000),
        UNIQUE(file_hash)
      ) STRICT`,
      
      `CREATE TABLE IF NOT EXISTS node_imports (
        node_id TEXT NOT NULL CHECK(length(node_id) <= 100),
        import_id TEXT NOT NULL CHECK(length(import_id) <= 100),
        created_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(created_at) IS NOT NULL),
        FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE,
        PRIMARY KEY (node_id, import_id)
      ) STRICT`,
      
      `CREATE TABLE IF NOT EXISTS schema_versions (
        version INTEGER PRIMARY KEY NOT NULL CHECK(version > 0),
        description TEXT NOT NULL CHECK(length(description) > 0 AND length(description) <= 500),
        applied_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(applied_at) IS NOT NULL),
        checksum TEXT NOT NULL CHECK(length(checksum) = 64)
      ) STRICT`,
      
      // Triggers
      `CREATE TRIGGER IF NOT EXISTS nodes_update_timestamp
       AFTER UPDATE ON nodes
       BEGIN
         UPDATE nodes SET updated_at = datetime('now') WHERE id = NEW.id;
       END`,
      
      `CREATE TRIGGER IF NOT EXISTS hierarchy_insert_stats
       AFTER INSERT ON node_hierarchy
       BEGIN
         INSERT OR IGNORE INTO node_stats (node_id) VALUES (NEW.parent_id);
         UPDATE node_stats 
         SET child_count = child_count + 1,
             computed_at = datetime('now')
         WHERE node_id = NEW.parent_id;
       END`,
      
      `CREATE TRIGGER IF NOT EXISTS hierarchy_delete_stats
       AFTER DELETE ON node_hierarchy
       BEGIN
         UPDATE node_stats 
         SET child_count = CASE 
           WHEN child_count > 0 THEN child_count - 1 
           ELSE 0 
         END,
         computed_at = datetime('now')
         WHERE node_id = OLD.parent_id;
       END`,
      
      `CREATE TRIGGER IF NOT EXISTS references_insert_stats
       AFTER INSERT ON node_references
       BEGIN
         INSERT OR IGNORE INTO node_stats (node_id) VALUES (NEW.target_id);
         UPDATE node_stats 
         SET reference_count = reference_count + 1,
             computed_at = datetime('now')
         WHERE node_id = NEW.target_id;
       END`,
      
      `CREATE TRIGGER IF NOT EXISTS references_delete_stats
       AFTER DELETE ON node_references
       BEGIN
         UPDATE node_stats 
         SET reference_count = CASE 
           WHEN reference_count > 0 THEN reference_count - 1 
           ELSE 0 
         END,
         computed_at = datetime('now')
         WHERE node_id = OLD.target_id;
       END`,
      
      `CREATE TRIGGER IF NOT EXISTS fts_insert
       AFTER INSERT ON nodes
       BEGIN
         INSERT INTO node_search(id, name, content, tags)
         VALUES (
           NEW.id,
           NEW.name,
           NEW.content,
           COALESCE(json_extract(NEW.fields_json, '$.tags'), '')
         );
       END`,
      
      `CREATE TRIGGER IF NOT EXISTS fts_update
       AFTER UPDATE ON nodes
       BEGIN
         UPDATE node_search 
         SET name = NEW.name,
             content = NEW.content,
             tags = COALESCE(json_extract(NEW.fields_json, '$.tags'), '')
         WHERE id = NEW.id;
       END`,
      
      `CREATE TRIGGER IF NOT EXISTS fts_delete
       AFTER DELETE ON nodes
       BEGIN
         DELETE FROM node_search WHERE id = OLD.id;
       END`,
      
      `CREATE TRIGGER IF NOT EXISTS hierarchy_circular_check
       BEFORE INSERT ON node_hierarchy
       BEGIN
         SELECT CASE
           WHEN EXISTS (
             WITH RECURSIVE ancestors(id) AS (
               SELECT NEW.parent_id
               UNION ALL
               SELECT h.parent_id 
               FROM node_hierarchy h
               JOIN ancestors a ON h.child_id = a.id
             )
             SELECT 1 FROM ancestors WHERE id = NEW.child_id
           )
           THEN RAISE(ABORT, 'Circular reference detected in hierarchy')
         END;
       END`,
    ],
    down: [
      'DROP TRIGGER IF EXISTS hierarchy_circular_check',
      'DROP TRIGGER IF EXISTS fts_delete',
      'DROP TRIGGER IF EXISTS fts_update',
      'DROP TRIGGER IF EXISTS fts_insert',
      'DROP TRIGGER IF EXISTS references_delete_stats',
      'DROP TRIGGER IF EXISTS references_insert_stats',
      'DROP TRIGGER IF EXISTS hierarchy_delete_stats',
      'DROP TRIGGER IF EXISTS hierarchy_insert_stats',
      'DROP TRIGGER IF EXISTS nodes_update_timestamp',
      'DROP TABLE IF EXISTS node_imports',
      'DROP TABLE IF EXISTS imports',
      'DROP TABLE IF EXISTS node_stats',
      'DROP TABLE IF EXISTS node_search',
      'DROP TABLE IF EXISTS node_references',
      'DROP TABLE IF EXISTS node_hierarchy',
      'DROP TABLE IF EXISTS nodes',
      'DROP TABLE IF EXISTS schema_versions',
    ],
    checksum: '', // Will be calculated
  },
  {
    version: 2,
    description: 'Add performance indexes for graph operations and search',
    up: [
      // Performance indexes for nodes table
      'CREATE INDEX IF NOT EXISTS idx_nodes_owner_id ON nodes(owner_id)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_system ON nodes(is_system_node)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at)',
      
      // Hierarchy indexes for fast graph traversal
      'CREATE INDEX IF NOT EXISTS idx_hierarchy_parent_id ON node_hierarchy(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_hierarchy_child_id ON node_hierarchy(child_id)',
      'CREATE INDEX IF NOT EXISTS idx_hierarchy_position ON node_hierarchy(parent_id, position)',
      
      // Reference indexes for relationship queries
      'CREATE INDEX IF NOT EXISTS idx_references_source_id ON node_references(source_id)',
      'CREATE INDEX IF NOT EXISTS idx_references_target_id ON node_references(target_id)',
      'CREATE INDEX IF NOT EXISTS idx_references_type ON node_references(reference_type)',
      
      // Stats indexes for analytics
      'CREATE INDEX IF NOT EXISTS idx_stats_node_id ON node_stats(node_id)',
      'CREATE INDEX IF NOT EXISTS idx_stats_access_count ON node_stats(access_count DESC)',
      'CREATE INDEX IF NOT EXISTS idx_stats_reference_count ON node_stats(reference_count DESC)',
      'CREATE INDEX IF NOT EXISTS idx_stats_depth_level ON node_stats(depth_level)',
      
      // Import tracking indexes
      'CREATE INDEX IF NOT EXISTS idx_imports_status ON imports(status)',
      'CREATE INDEX IF NOT EXISTS idx_imports_started_at ON imports(started_at)',
      'CREATE INDEX IF NOT EXISTS idx_imports_file_hash ON imports(file_hash)',
      'CREATE INDEX IF NOT EXISTS idx_node_imports_import_id ON node_imports(import_id)',
      
      // Composite indexes for common query patterns
      'CREATE INDEX IF NOT EXISTS idx_nodes_type_owner ON nodes(node_type, owner_id)',
      'CREATE INDEX IF NOT EXISTS idx_hierarchy_parent_position ON node_hierarchy(parent_id, position)',
      'CREATE INDEX IF NOT EXISTS idx_references_source_type ON node_references(source_id, reference_type)',
      
      // Analyze tables after creating indexes
      'ANALYZE',
    ],
    down: [
      'DROP INDEX IF EXISTS idx_references_source_type',
      'DROP INDEX IF EXISTS idx_hierarchy_parent_position',
      'DROP INDEX IF EXISTS idx_nodes_type_owner',
      'DROP INDEX IF EXISTS idx_node_imports_import_id',
      'DROP INDEX IF EXISTS idx_imports_file_hash',
      'DROP INDEX IF EXISTS idx_imports_started_at',
      'DROP INDEX IF EXISTS idx_imports_status',
      'DROP INDEX IF EXISTS idx_stats_depth_level',
      'DROP INDEX IF EXISTS idx_stats_reference_count',
      'DROP INDEX IF EXISTS idx_stats_access_count',
      'DROP INDEX IF EXISTS idx_stats_node_id',
      'DROP INDEX IF EXISTS idx_references_type',
      'DROP INDEX IF EXISTS idx_references_target_id',
      'DROP INDEX IF EXISTS idx_references_source_id',
      'DROP INDEX IF EXISTS idx_hierarchy_position',
      'DROP INDEX IF EXISTS idx_hierarchy_child_id',
      'DROP INDEX IF EXISTS idx_hierarchy_parent_id',
      'DROP INDEX IF EXISTS idx_nodes_updated_at',
      'DROP INDEX IF EXISTS idx_nodes_created_at',
      'DROP INDEX IF EXISTS idx_nodes_system',
      'DROP INDEX IF EXISTS idx_nodes_type',
      'DROP INDEX IF EXISTS idx_nodes_owner_id',
    ],
    checksum: '', // Will be calculated
  },
]

/**
 * Calculate checksum for migration statements
 */
function calculateChecksum(statements: string[]): string {
  const content = statements.join('\n')
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Initialize migration checksums
 */
function initializeMigrations(): void {
  for (const migration of MIGRATIONS) {
    if (!migration.checksum) {
      migration.checksum = calculateChecksum(migration.up)
    }
  }
}

/**
 * Migration runner class
 */
export class MigrationRunner {
  constructor(private connection: DatabaseConnection) {
    initializeMigrations()
  }

  /**
   * Get current schema version from database
   */
  async getCurrentVersion(): Promise<number> {
    try {
      const result = this.connection.query<SchemaVersionRecord>(
        'SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1'
      )
      return result.length > 0 ? result[0].version : 0
    } catch (error) {
      // Schema versions table doesn't exist yet
      return 0
    }
  }

  /**
   * Get all applied migrations
   */
  async getAppliedMigrations(): Promise<SchemaVersionRecord[]> {
    try {
      return this.connection.query<SchemaVersionRecord>(
        'SELECT * FROM schema_versions ORDER BY version'
      )
    } catch (error) {
      return []
    }
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(): Promise<boolean> {
    const currentVersion = await this.getCurrentVersion()
    return currentVersion < CURRENT_SCHEMA_VERSION
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<MigrationDefinition[]> {
    const currentVersion = await this.getCurrentVersion()
    return MIGRATIONS.filter(migration => migration.version > currentVersion)
  }

  /**
   * Validate migration integrity
   */
  private async validateMigration(migration: MigrationDefinition): Promise<void> {
    const appliedMigrations = await this.getAppliedMigrations()
    const appliedMigration = appliedMigrations.find(m => m.version === migration.version)
    
    if (appliedMigration && appliedMigration.checksum !== migration.checksum) {
      throw new SchemaVersionError(
        migration.version,
        appliedMigration.version
      )
    }
  }

  /**
   * Apply a single migration
   */
  async applyMigration(migration: MigrationDefinition): Promise<MigrationResult> {
    const startTime = Date.now()
    
    try {
      await this.validateMigration(migration)
      
      return this.connection.transaction(() => {
        // Execute migration statements
        for (const statement of migration.up) {
          if (statement.trim()) {
            this.connection.run(statement)
          }
        }
        
        // Record migration in schema_versions table
        this.connection.run(
          `INSERT OR REPLACE INTO schema_versions (version, description, applied_at, checksum)
           VALUES (?, ?, datetime('now'), ?)`,
          [migration.version, migration.description, migration.checksum]
        )
        
        const duration = Date.now() - startTime
        
        return {
          version: migration.version,
          success: true,
          duration,
          appliedAt: new Date(),
        }
      })
    } catch (error) {
      const duration = Date.now() - startTime
      
      return {
        version: migration.version,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
        appliedAt: new Date(),
      }
    }
  }

  /**
   * Rollback a single migration
   */
  async rollbackMigration(migration: MigrationDefinition): Promise<MigrationResult> {
    const startTime = Date.now()
    
    try {
      return this.connection.transaction(() => {
        // Execute rollback statements
        for (const statement of migration.down) {
          if (statement.trim()) {
            this.connection.run(statement)
          }
        }
        
        // Remove migration record
        this.connection.run(
          'DELETE FROM schema_versions WHERE version = ?',
          [migration.version]
        )
        
        const duration = Date.now() - startTime
        
        return {
          version: migration.version,
          success: true,
          duration,
          appliedAt: new Date(),
        }
      })
    } catch (error) {
      const duration = Date.now() - startTime
      
      return {
        version: migration.version,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
        appliedAt: new Date(),
      }
    }
  }

  /**
   * Apply all pending migrations
   */
  async migrate(): Promise<MigrationResult[]> {
    const pendingMigrations = await this.getPendingMigrations()
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations')
      return []
    }
    
    console.log(`Applying ${pendingMigrations.length} pending migrations...`)
    
    const results: MigrationResult[] = []
    
    for (const migration of pendingMigrations) {
      console.log(`Applying migration ${migration.version}: ${migration.description}`)
      
      const result = await this.applyMigration(migration)
      results.push(result)
      
      if (!result.success) {
        console.error(`Migration ${migration.version} failed: ${result.error}`)
        break
      }
      
      console.log(`Migration ${migration.version} completed in ${result.duration}ms`)
    }
    
    return results
  }

  /**
   * Rollback to a specific version
   */
  async rollbackTo(targetVersion: number): Promise<MigrationResult[]> {
    const currentVersion = await this.getCurrentVersion()
    
    if (targetVersion >= currentVersion) {
      throw new DatabaseError(`Target version ${targetVersion} is not lower than current version ${currentVersion}`)
    }
    
    const migrationsToRollback = MIGRATIONS
      .filter(migration => migration.version > targetVersion && migration.version <= currentVersion)
      .reverse() // Rollback in reverse order
    
    console.log(`Rolling back ${migrationsToRollback.length} migrations to version ${targetVersion}...`)
    
    const results: MigrationResult[] = []
    
    for (const migration of migrationsToRollback) {
      console.log(`Rolling back migration ${migration.version}: ${migration.description}`)
      
      const result = await this.rollbackMigration(migration)
      results.push(result)
      
      if (!result.success) {
        console.error(`Rollback of migration ${migration.version} failed: ${result.error}`)
        break
      }
      
      console.log(`Migration ${migration.version} rolled back in ${result.duration}ms`)
    }
    
    return results
  }

  /**
   * Get migration status information
   */
  async getStatus(): Promise<{
    currentVersion: number
    latestVersion: number
    pendingMigrations: number
    appliedMigrations: SchemaVersionRecord[]
  }> {
    const currentVersion = await this.getCurrentVersion()
    const appliedMigrations = await this.getAppliedMigrations()
    const pendingMigrations = await this.getPendingMigrations()
    
    return {
      currentVersion,
      latestVersion: CURRENT_SCHEMA_VERSION,
      pendingMigrations: pendingMigrations.length,
      appliedMigrations,
    }
  }

  /**
   * Verify database integrity after migrations
   */
  async verifyIntegrity(): Promise<{
    isValid: boolean
    errors: string[]
    checks: Record<string, boolean>
  }> {
    const errors: string[] = []
    const checks: Record<string, boolean> = {}
    
    try {
      // Check foreign key constraints
      const fkErrors = this.connection.query('PRAGMA foreign_key_check')
      checks.foreignKeys = fkErrors.length === 0
      if (fkErrors.length > 0) {
        errors.push(`Foreign key violations: ${fkErrors.length}`)
      }
      
      // Check database integrity
      const integrityResult = this.connection.query('PRAGMA integrity_check')
      checks.integrity = integrityResult.length === 1 && (integrityResult[0] as any).integrity_check === 'ok'
      if (!checks.integrity) {
        errors.push(`Database integrity check failed: ${JSON.stringify(integrityResult)}`)
      }
      
      // Verify all required tables exist
      const tables = this.connection.query(
        "SELECT name FROM sqlite_master WHERE type='table'"
      )
      const tableNames = tables.map((t: any) => t.name)
      
      const requiredTables = [
        'nodes', 'node_hierarchy', 'node_references', 'node_search',
        'node_stats', 'imports', 'node_imports', 'schema_versions'
      ]
      
      for (const table of requiredTables) {
        checks[`table_${table}`] = tableNames.includes(table)
        if (!tableNames.includes(table)) {
          errors.push(`Required table missing: ${table}`)
        }
      }
      
      // Verify triggers exist
      const triggers = this.connection.query(
        "SELECT name FROM sqlite_master WHERE type='trigger'"
      )
      const triggerNames = triggers.map((t: any) => t.name)
      
      const requiredTriggers = [
        'nodes_update_timestamp',
        'hierarchy_insert_stats',
        'hierarchy_delete_stats',
        'references_insert_stats',
        'references_delete_stats',
        'fts_insert',
        'fts_update',
        'fts_delete',
        'hierarchy_circular_check'
      ]
      
      for (const trigger of requiredTriggers) {
        checks[`trigger_${trigger}`] = triggerNames.includes(trigger)
        if (!triggerNames.includes(trigger)) {
          errors.push(`Required trigger missing: ${trigger}`)
        }
      }
      
    } catch (error) {
      errors.push(`Integrity check failed: ${error}`)
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      checks,
    }
  }
}

/**
 * Create migration runner for a database connection
 */
export function createMigrationRunner(connection: DatabaseConnection): MigrationRunner {
  return new MigrationRunner(connection)
}

/**
 * Quick migration helper - apply all pending migrations
 */
export async function migrateDatabase(connection: DatabaseConnection): Promise<boolean> {
  const runner = createMigrationRunner(connection)
  const results = await runner.migrate()
  
  const allSuccessful = results.every(result => result.success)
  
  if (allSuccessful) {
    console.log('All migrations applied successfully')
    
    // Verify integrity after migration
    const integrity = await runner.verifyIntegrity()
    if (!integrity.isValid) {
      console.error('Database integrity check failed after migration:', integrity.errors)
      return false
    }
  } else {
    console.error('Some migrations failed')
  }
  
  return allSuccessful
}

/**
 * Export migration definitions and current version
 */
export { CURRENT_SCHEMA_VERSION }