/**
 * Main database module for Tana Local KB
 * 
 * Central export point for all database functionality including connections,
 * migrations, configuration, and high-level database operations.
 */

import type { DatabaseConnection, DatabaseConfig } from './types/database-types.js'
import { createConnection, getDatabaseConfig, validateEnvironmentConfig } from './config/index.js'
import { createMigrationRunner, migrateDatabase } from './schema/migrations/index.js'

// Re-export all types and interfaces
export type * from './types/index.js'

// Re-export configuration functionality
export * from './config/index.js'

// Re-export schema definitions
export * from './schema/index.js'

// Re-export migration system
export * from './schema/migrations/index.js'

/**
 * Database instance manager - singleton pattern for main database
 */
class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private connection: DatabaseConnection | null = null
  private config: DatabaseConfig | null = null

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  /**
   * Initialize database with configuration
   */
  async initialize(customConfig?: Partial<DatabaseConfig>): Promise<DatabaseConnection> {
    if (this.connection) {
      return this.connection
    }

    try {
      // Validate environment configuration
      validateEnvironmentConfig()

      // Get configuration (environment + overrides)
      this.config = customConfig 
        ? { ...getDatabaseConfig(), ...customConfig }
        : getDatabaseConfig()

      console.log('Initializing database with configuration:', {
        path: this.config.path,
        memory: this.config.memory,
        readOnly: this.config.readOnly,
        enableWAL: this.config.enableWAL,
        enableFTS: this.config.enableFTS,
      })

      // Create connection
      this.connection = await createConnection(this.config)

      // Run migrations if not read-only
      if (!this.config.readOnly) {
        const migrationSuccess = await migrateDatabase(this.connection)
        if (!migrationSuccess) {
          throw new Error('Database migration failed')
        }
      }

      console.log('Database initialized successfully')
      return this.connection

    } catch (error) {
      console.error('Failed to initialize database:', error)
      throw error
    }
  }

  /**
   * Get current database connection
   */
  getConnection(): DatabaseConnection {
    if (!this.connection) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.connection
  }

  /**
   * Get current configuration
   */
  getConfig(): DatabaseConfig {
    if (!this.config) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.config
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.connection !== null
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      this.connection.close()
      this.connection = null
      this.config = null
      console.log('Database connection closed')
    }
  }

  /**
   * Reinitialize database (useful for configuration changes)
   */
  async reinitialize(customConfig?: Partial<DatabaseConfig>): Promise<DatabaseConnection> {
    await this.close()
    return this.initialize(customConfig)
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{
    isHealthy: boolean
    connectionActive: boolean
    version: number
    metrics: any
    issues: string[]
  }> {
    const issues: string[] = []
    let isHealthy = true
    let connectionActive = false
    let version = 0
    let metrics: any = {}

    try {
      if (!this.connection) {
        issues.push('Database not initialized')
        isHealthy = false
      } else {
        // Test connection
        this.connection.query('SELECT 1')
        connectionActive = true

        // Get schema version
        try {
          const runner = createMigrationRunner(this.connection)
          version = await runner.getCurrentVersion()
        } catch (error) {
          issues.push('Could not determine schema version')
        }

        // Get connection metrics if available
        if ('getMetrics' in this.connection) {
          metrics = (this.connection as any).getMetrics()
        }

        // Check for slow queries
        if (metrics.slowQueries && metrics.slowQueries.length > 0) {
          issues.push(`${metrics.slowQueries.length} slow queries detected`)
        }
      }
    } catch (error) {
      isHealthy = false
      connectionActive = false
      issues.push(`Connection test failed: ${error}`)
    }

    return {
      isHealthy,
      connectionActive,
      version,
      metrics,
      issues,
    }
  }
}

/**
 * Global database instance
 */
const db = DatabaseManager.getInstance()

/**
 * Initialize the main database connection
 */
export async function initializeDatabase(config?: Partial<DatabaseConfig>): Promise<DatabaseConnection> {
  return db.initialize(config)
}

/**
 * Get the main database connection
 */
export function getDatabase(): DatabaseConnection {
  return db.getConnection()
}

/**
 * Get database configuration
 */
export function getDatabaseConfiguration(): DatabaseConfig {
  return db.getConfig()
}

/**
 * Check if database is ready
 */
export function isDatabaseReady(): boolean {
  return db.isInitialized()
}

/**
 * Close the main database connection
 */
export async function closeDatabase(): Promise<void> {
  return db.close()
}

/**
 * Get database health information
 */
export async function getDatabaseHealth() {
  return db.getHealthStatus()
}

/**
 * Utility functions for common database operations
 */
export const dbUtils = {
  /**
   * Create a new database connection (for testing or special use cases)
   */
  async createTestConnection(config?: Partial<DatabaseConfig>): Promise<DatabaseConnection> {
    const testConfig: DatabaseConfig = {
      path: ':memory:',
      memory: true,
      readOnly: false,
      timeout: 5000,
      maxConnections: 1,
      pragmas: {
        journal_mode: 'MEMORY',
        synchronous: 'OFF',
        foreign_keys: 'ON',
      },
      enableWAL: false,
      enableFTS: true,
      autoVacuum: false,
      ...config,
    }

    const connection = await createConnection(testConfig)
    await migrateDatabase(connection)
    return connection
  },

  /**
   * Backup database to a file
   */
  async backupDatabase(backupPath: string): Promise<void> {
    const connection = getDatabase()
    
    // Use SQLite backup functionality
    connection.run(`VACUUM INTO '${backupPath}'`)
    console.log(`Database backed up to: ${backupPath}`)
  },

  /**
   * Optimize database performance
   */
  async optimizeDatabase(): Promise<void> {
    const connection = getDatabase()
    
    console.log('Optimizing database...')
    
    // Update table statistics
    connection.run('ANALYZE')
    
    // Optimize query planner
    try {
      connection.run('PRAGMA optimize')
    } catch (error) {
      console.warn('PRAGMA optimize not supported:', error)
    }
    
    // Incremental vacuum if needed
    const config = getDatabaseConfiguration()
    if (config.autoVacuum) {
      connection.run('PRAGMA incremental_vacuum')
    }
    
    console.log('Database optimization completed')
  },

  /**
   * Get database size and statistics
   */
  getDatabaseStats(): {
    totalSize: number
    pageCount: number
    pageSize: number
    freePages: number
    tables: Record<string, number>
  } {
    const connection = getDatabase()
    
    // Get database size info
    const [sizeInfo] = connection.query('PRAGMA page_count, page_size, freelist_count')
    
    // Get table row counts
    const tables = connection.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `)
    
    const tableCounts: Record<string, number> = {}
    for (const table of tables as { name: string }[]) {
      const [result] = connection.query(`SELECT COUNT(*) as count FROM ${table.name}`)
      tableCounts[table.name] = (result as { count: number }).count
    }
    
    return {
      totalSize: sizeInfo.page_count * sizeInfo.page_size,
      pageCount: sizeInfo.page_count,
      pageSize: sizeInfo.page_size,
      freePages: sizeInfo.freelist_count,
      tables: tableCounts,
    }
  },

  /**
   * Execute raw SQL with proper error handling
   */
  async executeRaw(sql: string, params?: any[]): Promise<any> {
    const connection = getDatabase()
    
    try {
      if (sql.trim().toLowerCase().startsWith('select')) {
        return connection.query(sql, params)
      } else {
        return connection.run(sql, params)
      }
    } catch (error) {
      console.error('Raw SQL execution failed:', { sql, params, error })
      throw error
    }
  },
}

/**
 * Database event logging for development and debugging
 */
export function enableDatabaseLogging(): void {
  const connection = getDatabase()
  
  if ('addEventListener' in connection) {
    (connection as any).addEventListener((event: any) => {
      if (event.duration > 100) { // Log slow queries
        console.log(`[DB] Slow ${event.type} on ${event.table}: ${event.duration}ms (${event.affectedRows} rows)`)
      }
    })
  }
}

/**
 * Express middleware to ensure database is initialized
 */
export function ensureDatabaseMiddleware() {
  return async (_req: any, res: any, next: any) => {
    try {
      if (!isDatabaseReady()) {
        await initializeDatabase()
      }
      next()
    } catch (error) {
      console.error('Database initialization failed in middleware:', error)
      res.status(500).json({ error: 'Database initialization failed' })
    }
  }
}

// Export the database manager instance for advanced use cases
export { DatabaseManager }

// Default export for convenience
export default {
  initialize: initializeDatabase,
  getConnection: getDatabase,
  getConfig: getDatabaseConfiguration,
  isReady: isDatabaseReady,
  close: closeDatabase,
  health: getDatabaseHealth,
  utils: dbUtils,
  enableLogging: enableDatabaseLogging,
}