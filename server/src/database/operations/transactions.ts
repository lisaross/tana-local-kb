/**
 * Transaction management for Tana graph database
 * 
 * This module provides sophisticated transaction management with support for
 * nested transactions, savepoints, deadlock handling, and performance monitoring.
 */

import type { 
  DatabaseConnection, 
  DatabaseTransaction,
  DatabaseEvent,
  DatabaseEventHandler
} from '../types/index.js'
import { DatabaseError } from '../types/database-types.js'

/**
 * Transaction options and configuration
 */
export interface TransactionOptions {
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE'
  timeout?: number                    // Transaction timeout in milliseconds
  retryAttempts?: number             // Number of retry attempts on failure
  retryDelay?: number                // Delay between retries in milliseconds
  enableLogging?: boolean            // Enable transaction logging
  enableEvents?: boolean             // Enable transaction events
  savepointName?: string            // Custom savepoint name
}

/**
 * Transaction statistics and monitoring
 */
export interface TransactionStats {
  id: string
  startTime: number
  endTime?: number
  duration?: number
  operationCount: number
  affectedRows: number
  status: 'active' | 'committed' | 'rolled_back' | 'failed'
  isolationLevel: string
  operations: Array<{
    type: 'query' | 'run'
    sql: string
    params?: any[]
    duration: number
    affectedRows: number
    timestamp: number
  }>
  error?: string
}

/**
 * Default transaction options
 */
const DEFAULT_TRANSACTION_OPTIONS: Required<TransactionOptions> = {
  isolationLevel: 'READ_COMMITTED',
  timeout: 30000,           // 30 seconds
  retryAttempts: 3,
  retryDelay: 100,          // 100ms
  enableLogging: false,
  enableEvents: false,
  savepointName: '',
}

/**
 * Enhanced transaction manager
 */
export class TransactionManager {
  private activeTransactions = new Map<string, TransactionStats>()
  private eventHandlers: DatabaseEventHandler[] = []
  private nextTransactionId = 1

  constructor(private db: DatabaseConnection) {}

  /**
   * Execute a function within a transaction with comprehensive error handling
   */
  async executeTransaction<T>(
    fn: (tx: DatabaseTransaction) => T | Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const config = { ...DEFAULT_TRANSACTION_OPTIONS, ...options }
    const transactionId = this.generateTransactionId()
    
    const stats: TransactionStats = {
      id: transactionId,
      startTime: Date.now(),
      operationCount: 0,
      affectedRows: 0,
      status: 'active',
      isolationLevel: config.isolationLevel,
      operations: [],
    }

    this.activeTransactions.set(transactionId, stats)

    try {
      // Set isolation level if needed
      if (config.isolationLevel !== 'READ_COMMITTED') {
        this.db.run(`PRAGMA read_uncommitted = ${config.isolationLevel === 'READ_UNCOMMITTED' ? 'ON' : 'OFF'}`)
      }

      // Execute with timeout
      const result = await this.withTimeout(
        () => this.executeWithRetries(fn, config, stats),
        config.timeout
      )

      // Commit successful
      stats.status = 'committed'
      stats.endTime = Date.now()
      stats.duration = stats.endTime - stats.startTime

      if (config.enableLogging) {
        this.logTransaction(stats)
      }

      if (config.enableEvents) {
        this.emitTransactionEvent('commit', stats)
      }

      return result

    } catch (error) {
      stats.status = 'failed'
      stats.endTime = Date.now()
      stats.duration = stats.endTime - stats.startTime
      stats.error = error instanceof Error ? error.message : String(error)

      if (config.enableLogging) {
        this.logTransaction(stats)
      }

      if (config.enableEvents) {
        this.emitTransactionEvent('rollback', stats)
      }

      throw new DatabaseError(
        `Transaction ${transactionId} failed: ${stats.error}`,
        'TRANSACTION_FAILED',
        undefined,
        undefined
      )

    } finally {
      this.activeTransactions.delete(transactionId)
    }
  }

  /**
   * Execute transaction with automatic retries
   */
  private async executeWithRetries<T>(
    fn: (tx: DatabaseTransaction) => T | Promise<T>,
    config: Required<TransactionOptions>,
    stats: TransactionStats
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= config.retryAttempts; attempt++) {
      try {
        return await this.executeTransactionCore(fn, config, stats, attempt)
      } catch (error) {
        lastError = error as Error

        // Don't retry on certain types of errors
        if (this.isNonRetryableError(error)) {
          throw error
        }

        // Don't retry on the last attempt
        if (attempt === config.retryAttempts) {
          throw error
        }

        // Wait before retrying
        if (config.retryDelay > 0) {
          await this.sleep(config.retryDelay * Math.pow(2, attempt)) // Exponential backoff
        }
      }
    }

    throw lastError || new DatabaseError('Transaction failed after all retry attempts')
  }

  /**
   * Core transaction execution logic
   */
  private async executeTransactionCore<T>(
    fn: (tx: DatabaseTransaction) => T | Promise<T>,
    config: Required<TransactionOptions>,
    stats: TransactionStats,
    attempt: number
  ): Promise<T> {
    return this.db.transaction((tx) => {
      // Wrap transaction with monitoring
      const monitoredTx = this.createMonitoredTransaction(tx, stats, config)
      
      // Execute the user function
      return fn(monitoredTx)
    })
  }

  /**
   * Create a monitored transaction wrapper
   */
  private createMonitoredTransaction(
    tx: DatabaseTransaction,
    stats: TransactionStats,
    config: Required<TransactionOptions>
  ): DatabaseTransaction {
    return {
      query: <T = any>(sql: string, params?: any[]): T[] => {
        const startTime = Date.now()
        
        try {
          const result = tx.query<T>(sql, params)
          const duration = Date.now() - startTime
          
          stats.operationCount++
          stats.operations.push({
            type: 'query',
            sql,
            params,
            duration,
            affectedRows: result.length,
            timestamp: startTime,
          })

          if (config.enableEvents) {
            this.emitDatabaseEvent({
              type: 'query',
              table: this.extractTableName(sql),
              affectedRows: result.length,
              duration,
              timestamp: new Date(startTime),
            })
          }

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          stats.operations.push({
            type: 'query',
            sql,
            params,
            duration,
            affectedRows: 0,
            timestamp: startTime,
          })
          throw error
        }
      },

      run: (sql: string, params?: any[]) => {
        const startTime = Date.now()
        
        try {
          const result = tx.run(sql, params)
          const duration = Date.now() - startTime
          
          stats.operationCount++
          stats.affectedRows += result.changes
          stats.operations.push({
            type: 'run',
            sql,
            params,
            duration,
            affectedRows: result.changes,
            timestamp: startTime,
          })

          if (config.enableEvents) {
            this.emitDatabaseEvent({
              type: this.getOperationType(sql),
              table: this.extractTableName(sql),
              affectedRows: result.changes,
              duration,
              timestamp: new Date(startTime),
            })
          }

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          stats.operations.push({
            type: 'run',
            sql,
            params,
            duration,
            affectedRows: 0,
            timestamp: startTime,
          })
          throw error
        }
      },

      rollback: () => {
        stats.status = 'rolled_back'
        return tx.rollback()
      },
    }
  }

  /**
   * Execute multiple operations in a single transaction
   */
  async executeBatch(
    operations: Array<{
      sql: string
      params?: any[]
      expectChanges?: number
    }>,
    options?: TransactionOptions
  ): Promise<{
    success: boolean
    results: Array<{ changes: number; lastInsertRowid: number }>
    totalChanges: number
    duration: number
  }> {
    const startTime = Date.now()

    return this.executeTransaction((tx) => {
      const results: Array<{ changes: number; lastInsertRowid: number }> = []
      let totalChanges = 0

      for (const operation of operations) {
        const result = tx.run(operation.sql, operation.params)
        results.push(result)
        totalChanges += result.changes

        // Validate expected changes if specified
        if (operation.expectChanges !== undefined && result.changes !== operation.expectChanges) {
          throw new DatabaseError(
            `Expected ${operation.expectChanges} changes, got ${result.changes}`,
            'UNEXPECTED_CHANGES',
            operation.sql,
            operation.params
          )
        }
      }

      return {
        success: true,
        results,
        totalChanges,
        duration: Date.now() - startTime,
      }
    }, options)
  }

  /**
   * Create a savepoint within an existing transaction
   */
  async createSavepoint(name: string): Promise<void> {
    this.db.run(`SAVEPOINT ${name}`)
  }

  /**
   * Release a savepoint
   */
  async releaseSavepoint(name: string): Promise<void> {
    this.db.run(`RELEASE SAVEPOINT ${name}`)
  }

  /**
   * Rollback to a savepoint
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    this.db.run(`ROLLBACK TO SAVEPOINT ${name}`)
  }

  /**
   * Execute a function with savepoint protection
   */
  async withSavepoint<T>(
    name: string,
    fn: () => T | Promise<T>
  ): Promise<T> {
    await this.createSavepoint(name)
    
    try {
      const result = await fn()
      await this.releaseSavepoint(name)
      return result
    } catch (error) {
      await this.rollbackToSavepoint(name)
      throw error
    }
  }

  /**
   * Get statistics for active transactions
   */
  getActiveTransactions(): TransactionStats[] {
    return Array.from(this.activeTransactions.values())
  }

  /**
   * Get transaction by ID
   */
  getTransaction(id: string): TransactionStats | undefined {
    return this.activeTransactions.get(id)
  }

  /**
   * Cancel a long-running transaction (if possible)
   */
  async cancelTransaction(id: string): Promise<boolean> {
    const transaction = this.activeTransactions.get(id)
    if (!transaction) {
      return false
    }

    // SQLite doesn't support cancellation, but we can mark it as failed
    transaction.status = 'failed'
    transaction.error = 'Transaction cancelled by user'
    transaction.endTime = Date.now()
    transaction.duration = transaction.endTime - transaction.startTime

    return true
  }

  /**
   * Add event handler for database events
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
   * Get transaction performance metrics
   */
  getPerformanceMetrics(): {
    averageTransactionTime: number
    totalTransactions: number
    successRate: number
    slowTransactions: TransactionStats[]
  } {
    const completed = Array.from(this.activeTransactions.values())
      .filter(t => t.status !== 'active')

    if (completed.length === 0) {
      return {
        averageTransactionTime: 0,
        totalTransactions: 0,
        successRate: 0,
        slowTransactions: [],
      }
    }

    const successful = completed.filter(t => t.status === 'committed')
    const totalTime = completed.reduce((sum, t) => sum + (t.duration || 0), 0)
    const slowThreshold = 1000 // 1 second

    return {
      averageTransactionTime: totalTime / completed.length,
      totalTransactions: completed.length,
      successRate: successful.length / completed.length,
      slowTransactions: completed.filter(t => (t.duration || 0) > slowThreshold),
    }
  }

  /**
   * Helper methods
   */
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${this.nextTransactionId++}`
  }

  private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new DatabaseError('Transaction timeout')), timeoutMs)
      })
    ])
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private isNonRetryableError(error: any): boolean {
    const errorMessage = error.message || String(error)
    
    // Don't retry on constraint violations, syntax errors, etc.
    return errorMessage.includes('SQLITE_CONSTRAINT') ||
           errorMessage.includes('SQLITE_SYNTAX') ||
           errorMessage.includes('SQLITE_MISUSE') ||
           errorMessage.includes('Transaction timeout')
  }

  private extractTableName(sql: string): string {
    const match = sql.match(/(?:FROM|INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i)
    return match ? match[1] : 'unknown'
  }

  private getOperationType(sql: string): DatabaseEvent['type'] {
    const sqlUpper = sql.trim().toUpperCase()
    if (sqlUpper.startsWith('SELECT')) return 'query'
    if (sqlUpper.startsWith('INSERT')) return 'insert'
    if (sqlUpper.startsWith('UPDATE')) return 'update'
    if (sqlUpper.startsWith('DELETE')) return 'delete'
    return 'query'
  }

  private logTransaction(stats: TransactionStats): void {
    console.log(`[DB Transaction ${stats.id}] ${stats.status.toUpperCase()}`, {
      duration: stats.duration,
      operations: stats.operationCount,
      affectedRows: stats.affectedRows,
      isolationLevel: stats.isolationLevel,
      error: stats.error,
    })
  }

  private emitTransactionEvent(type: 'commit' | 'rollback', stats: TransactionStats): void {
    // Transaction-level events can be emitted here
    // For now, we'll just log them
    console.log(`[DB Transaction Event] ${type.toUpperCase()}`, {
      id: stats.id,
      duration: stats.duration,
      operations: stats.operationCount,
    })
  }

  private emitDatabaseEvent(event: DatabaseEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event)
      } catch (error) {
        console.error('Database event handler error:', error)
      }
    }
  }
}

/**
 * Create transaction manager instance
 */
export function createTransactionManager(db: DatabaseConnection): TransactionManager {
  return new TransactionManager(db)
}

/**
 * Transaction utility functions
 */
export const transactionUtils = {
  /**
   * Validate transaction configuration
   */
  validateTransactionOptions(options: TransactionOptions): void {
    if (options.timeout && options.timeout <= 0) {
      throw new DatabaseError('Transaction timeout must be positive')
    }
    
    if (options.retryAttempts && options.retryAttempts < 0) {
      throw new DatabaseError('Retry attempts must be non-negative')
    }
    
    if (options.retryDelay && options.retryDelay < 0) {
      throw new DatabaseError('Retry delay must be non-negative')
    }
  },

  /**
   * Calculate transaction priority based on complexity
   */
  calculateTransactionPriority(operationCount: number, affectedRows: number): 'low' | 'medium' | 'high' {
    const score = operationCount + (affectedRows / 100)
    
    if (score < 10) return 'low'
    if (score < 100) return 'medium'
    return 'high'
  },

  /**
   * Estimate transaction duration based on operation types
   */
  estimateTransactionDuration(operations: Array<{ type: string; complexity: number }>): number {
    const baseTimes = {
      'select': 1,    // 1ms base
      'insert': 5,    // 5ms base
      'update': 10,   // 10ms base
      'delete': 15,   // 15ms base
    }

    return operations.reduce((total, op) => {
      const baseTime = baseTimes[op.type as keyof typeof baseTimes] || 5
      return total + (baseTime * op.complexity)
    }, 0)
  },

  /**
   * Check if operations can be safely batched
   */
  canBatchOperations(operations: Array<{ sql: string; table: string }>): boolean {
    // Check if all operations are on the same table
    const tables = new Set(operations.map(op => op.table))
    if (tables.size > 1) return false

    // Check if all operations are of the same type
    const types = new Set(operations.map(op => {
      const sql = op.sql.trim().toUpperCase()
      if (sql.startsWith('INSERT')) return 'insert'
      if (sql.startsWith('UPDATE')) return 'update'
      if (sql.startsWith('DELETE')) return 'delete'
      return 'other'
    }))

    return types.size === 1 && !types.has('other')
  },
}