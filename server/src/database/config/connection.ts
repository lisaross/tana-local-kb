/**
 * SQLite connection management using Bun's native Database
 * 
 * Provides connection pooling, transaction management, and performance monitoring
 * optimized for 1M+ node operations with comprehensive error handling.
 */

import { Database } from 'bun:sqlite'
import type { 
  DatabaseConnection, 
  DatabaseTransaction, 
  DatabaseConfig,
  DatabaseEvent,
  DatabaseEventHandler,
  QueryPerformance 
} from '../types/database-types.js'
import { DatabaseError } from '../types/database-types.js'

/**
 * Enhanced Bun SQLite connection wrapper with transaction support
 */
export class BunDatabaseConnection implements DatabaseConnection {
  private db: Database
  private eventHandlers: DatabaseEventHandler[] = []
  private queryHistory: QueryPerformance[] = []
  private isInTransaction = false

  constructor(db: Database, private config: DatabaseConfig) {
    this.db = db
  }

  /**
   * Execute a query and return results
   */
  query<T = any>(sql: string, params: any[] = []): T[] {
    const startTime = performance.now()
    
    try {
      const stmt = this.db.prepare(sql)
      const result = params.length > 0 ? stmt.all(...params) : stmt.all()
      
      const executionTime = performance.now() - startTime
      this.recordQueryPerformance(sql, executionTime, result.length)
      this.emitEvent('query', 'unknown', result.length, executionTime)
      
      return result as T[]
    } catch (error) {
      const executionTime = performance.now() - startTime
      this.recordQueryPerformance(sql, executionTime, 0)
      
      throw new DatabaseError(
        `Query failed: ${error instanceof Error ? error.message : String(error)}`,
        'QUERY_ERROR',
        sql,
        params
      )
    }
  }

  /**
   * Execute a statement and return metadata
   */
  run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
    const startTime = performance.now()
    
    try {
      const stmt = this.db.prepare(sql)
      const result = params.length > 0 ? stmt.run(...params) : stmt.run()
      
      const executionTime = performance.now() - startTime
      const operation = this.getOperationType(sql)
      const tableName = this.extractTableName(sql)
      
      this.recordQueryPerformance(sql, executionTime, result.changes)
      this.emitEvent(operation, tableName, result.changes, executionTime)
      
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid)
      }
    } catch (error) {
      const executionTime = performance.now() - startTime
      this.recordQueryPerformance(sql, executionTime, 0)
      
      throw new DatabaseError(
        `Statement failed: ${error instanceof Error ? error.message : String(error)}`,
        'STATEMENT_ERROR',
        sql,
        params
      )
    }
  }

  /**
   * Execute a function within a transaction
   */
  transaction<T>(fn: (tx: DatabaseTransaction) => T): T {
    if (this.isInTransaction) {
      throw new DatabaseError('Nested transactions are not supported')
    }

    const transaction = new BunDatabaseTransaction(this.db, this)
    this.isInTransaction = true
    
    try {
      transaction.begin()
      const result = fn(transaction)
      transaction.commit()
      return result
    } catch (error) {
      transaction.rollback()
      throw error
    } finally {
      this.isInTransaction = false
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    try {
      this.db.close()
    } catch (error) {
      console.warn('Error closing database:', error)
    }
  }

  /**
   * Get database metrics for monitoring
   */
  getMetrics() {
    const avgQueryTime = this.queryHistory.length > 0
      ? this.queryHistory.reduce((sum, q) => sum + q.executionTime, 0) / this.queryHistory.length
      : 0

    const slowQueries = this.queryHistory
      .filter(q => q.executionTime > 100) // queries slower than 100ms
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, 10)

    return {
      avgQueryTime,
      slowQueries,
      totalQueries: this.queryHistory.length,
      connectionActive: true
    }
  }

  /**
   * Add event handler for database operations
   */
  addEventListener(handler: DatabaseEventHandler): void {
    this.eventHandlers.push(handler)
  }

  /**
   * Remove event handler
   */
  removeEventListener(handler: DatabaseEventHandler): void {
    const index = this.eventHandlers.indexOf(handler)
    if (index > -1) {
      this.eventHandlers.splice(index, 1)
    }
  }

  /**
   * Get the underlying Bun Database instance
   */
  getDatabase(): Database {
    return this.db
  }

  private recordQueryPerformance(sql: string, executionTime: number, rowsReturned: number): void {
    this.queryHistory.push({
      query: sql,
      executionTime,
      rowsReturned,
      indexesUsed: [], // TODO: Implement index usage tracking
      timestamp: new Date()
    })

    // Keep only last 1000 queries to prevent memory bloat
    if (this.queryHistory.length > 1000) {
      this.queryHistory = this.queryHistory.slice(-1000)
    }
  }

  private emitEvent(
    type: DatabaseEvent['type'], 
    table: string, 
    affectedRows: number, 
    duration: number
  ): void {
    const event: DatabaseEvent = {
      type,
      table,
      affectedRows,
      duration,
      timestamp: new Date()
    }

    this.eventHandlers.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        console.warn('Error in database event handler:', error)
      }
    })
  }

  private getOperationType(sql: string): DatabaseEvent['type'] {
    const normalized = sql.trim().toLowerCase()
    if (normalized.startsWith('insert')) return 'insert'
    if (normalized.startsWith('update')) return 'update'
    if (normalized.startsWith('delete')) return 'delete'
    return 'query'
  }

  private extractTableName(sql: string): string {
    const normalized = sql.trim().toLowerCase()
    
    // Extract table name from different SQL operations
    let match = normalized.match(/(?:from|into|update|join)\s+(\w+)/i)
    if (match) return match[1]
    
    // Fallback for CREATE TABLE statements
    match = normalized.match(/create\s+(?:temp\s+)?table\s+(?:if\s+not\s+exists\s+)?(\w+)/i)
    if (match) return match[1]
    
    return 'unknown'
  }
}

/**
 * Transaction wrapper for Bun SQLite
 */
export class BunDatabaseTransaction implements DatabaseTransaction {
  private db: Database
  private connection: BunDatabaseConnection
  private hasBegun = false
  private isRolledBack = false

  constructor(db: Database, connection: BunDatabaseConnection) {
    this.db = db
    this.connection = connection
  }

  begin(): void {
    if (this.hasBegun) {
      throw new DatabaseError('Transaction already begun')
    }
    
    this.db.run('BEGIN IMMEDIATE')
    this.hasBegun = true
  }

  commit(): void {
    if (!this.hasBegun || this.isRolledBack) {
      throw new DatabaseError('Cannot commit: transaction not active')
    }
    
    this.db.run('COMMIT')
  }

  rollback(): void {
    if (!this.hasBegun) {
      throw new DatabaseError('Cannot rollback: transaction not begun')
    }
    
    if (!this.isRolledBack) {
      this.db.run('ROLLBACK')
      this.isRolledBack = true
    }
  }

  query<T = any>(sql: string, params: any[] = []): T[] {
    if (!this.hasBegun || this.isRolledBack) {
      throw new DatabaseError('Cannot query: transaction not active')
    }
    
    return this.connection.query<T>(sql, params)
  }

  run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
    if (!this.hasBegun || this.isRolledBack) {
      throw new DatabaseError('Cannot run statement: transaction not active')
    }
    
    return this.connection.run(sql, params)
  }
}

/**
 * Connection pool manager for SQLite connections
 */
export class ConnectionPool {
  private connections: BunDatabaseConnection[] = []
  private config: DatabaseConfig
  private activeConnections = 0
  private maxConnections: number

  constructor(config: DatabaseConfig) {
    this.config = config
    this.maxConnections = config.maxConnections || 5
  }

  /**
   * Get a connection from the pool or create a new one
   */
  async getConnection(): Promise<BunDatabaseConnection> {
    // For SQLite, we typically use a single connection due to file locking
    // But we can support multiple read-only connections for read operations
    
    if (this.connections.length > 0) {
      return this.connections.pop()!
    }

    if (this.activeConnections >= this.maxConnections) {
      throw new DatabaseError(`Connection pool exhausted (max: ${this.maxConnections})`)
    }

    return this.createConnection()
  }

  /**
   * Return a connection to the pool
   */
  async releaseConnection(connection: BunDatabaseConnection): Promise<void> {
    if (this.connections.length < this.maxConnections) {
      this.connections.push(connection)
    } else {
      connection.close()
      this.activeConnections--
    }
  }

  /**
   * Close all connections in the pool
   */
  async closeAll(): Promise<void> {
    for (const connection of this.connections) {
      connection.close()
    }
    this.connections = []
    this.activeConnections = 0
  }

  private createConnection(): BunDatabaseConnection {
    const db = new Database(this.config.path, {
      readonly: this.config.readOnly,
      create: !this.config.readOnly
    })

    // Apply PRAGMA settings (outside any transaction)
    Object.entries(this.config.pragmas || {}).forEach(([pragma, value]) => {
      try {
        const formattedValue = typeof value === 'string' && !value.startsWith("'") ? `'${value}'` : value
        db.run(`PRAGMA ${pragma} = ${formattedValue}`)
      } catch (error) {
        console.warn(`Failed to set PRAGMA ${pragma}:`, error)
      }
    })

    this.activeConnections++
    return new BunDatabaseConnection(db, this.config)
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      availableConnections: this.connections.length,
      activeConnections: this.activeConnections,
      maxConnections: this.maxConnections
    }
  }
}

/**
 * Create a database connection with the provided configuration
 */
export async function createConnection(config: DatabaseConfig): Promise<BunDatabaseConnection> {
  try {
    const db = new Database(config.path, {
      readonly: config.readOnly,
      create: !config.readOnly
    })

    // Apply PRAGMA settings for performance optimization (outside any transaction)
    Object.entries(config.pragmas || {}).forEach(([pragma, value]) => {
      try {
        const formattedValue = typeof value === 'string' && !value.startsWith("'") ? `'${value}'` : value
        db.run(`PRAGMA ${pragma} = ${formattedValue}`)
      } catch (error) {
        console.warn(`Failed to set PRAGMA ${pragma}:`, error)
      }
    })

    const connection = new BunDatabaseConnection(db, config)
    
    // Test the connection
    connection.query('SELECT 1 as test')
    
    return connection
  } catch (error) {
    throw new DatabaseError(
      `Failed to create database connection: ${error instanceof Error ? error.message : String(error)}`,
      'CONNECTION_ERROR'
    )
  }
}

/**
 * Create a connection pool with the provided configuration
 */
export async function createConnectionPool(config: DatabaseConfig): Promise<ConnectionPool> {
  const pool = new ConnectionPool(config)
  
  // Test that we can create at least one connection
  const testConnection = await pool.getConnection()
  await pool.releaseConnection(testConnection)
  
  return pool
}