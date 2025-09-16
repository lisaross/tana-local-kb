/**
 * Batch operations for Tana graph database
 * 
 * This module provides high-performance batch operations optimized for
 * importing large datasets (1000+ nodes/second) with memory efficiency,
 * progress tracking, and comprehensive error handling.
 */

import type { 
  DatabaseConnection, 
  DatabaseTransaction,
  NodeRecord,
  NodeInsert,
  NodeUpdate,
  HierarchyInsert,
  ReferenceInsert,
  BatchOperation,
  BatchResult
} from '../types/index.js'
import type { TanaNode, ProgressCallback } from '../../parser/types/index.js'
import { DatabaseError } from '../types/database-types.js'
import { DB_CONSTRAINTS } from '../types/schema.js'
import { transformTanaNodeToRecord } from './nodes.js'

/**
 * Batch configuration options
 */
export interface BatchConfig {
  batchSize: number              // Number of items per batch (default: 1000)
  maxConcurrent: number          // Maximum concurrent operations (default: 1)
  continueOnError: boolean       // Continue processing if individual items fail
  enableProgress: boolean        // Enable progress reporting
  validateData: boolean          // Validate data before insertion
  optimizeQueries: boolean       // Use optimized query patterns
  memoryLimit: number           // Memory limit in MB (default: 100)
}

/**
 * Default batch configuration
 */
const DEFAULT_BATCH_CONFIG: BatchConfig = {
  batchSize: 1000,
  maxConcurrent: 1,
  continueOnError: true,
  enableProgress: true,
  validateData: true,
  optimizeQueries: true,
  memoryLimit: 100,
}

/**
 * Import progress tracking
 */
export interface ImportProgress {
  phase: 'nodes' | 'hierarchy' | 'references' | 'indexing' | 'complete'
  totalItems: number
  processedItems: number
  successCount: number
  errorCount: number
  currentBatch: number
  totalBatches: number
  memoryUsage: number
  elapsedTime: number
  estimatedTimeRemaining?: number
  errors: Array<{ index: number; error: string; data?: any }>
}

/**
 * Batch operations class
 */
export class BatchOperations {
  private config: BatchConfig
  private startTime: number = 0

  constructor(
    private db: DatabaseConnection,
    config?: Partial<BatchConfig>
  ) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config }
  }

  /**
   * Import complete Tana dataset with optimal performance
   */
  async importTanaNodes(
    tanaNodes: TanaNode[],
    progressCallback?: ProgressCallback
  ): Promise<{
    imported: {
      nodes: number
      hierarchy: number
      references: number
    }
    errors: {
      nodes: number
      hierarchy: number
      references: number
    }
    duration: number
    memoryPeak: number
  }> {
    this.startTime = Date.now()
    let memoryPeak = 0

    const result = {
      imported: { nodes: 0, hierarchy: 0, references: 0 },
      errors: { nodes: 0, hierarchy: 0, references: 0 },
      duration: 0,
      memoryPeak: 0,
    }

    try {
      // Phase 1: Import nodes
      if (progressCallback) {
        progressCallback({
          totalNodes: tanaNodes.length,
          processedNodes: 0,
          skippedNodes: 0,
          currentNode: 'Starting import...',
          memoryUsage: this.getCurrentMemoryUsage(),
          elapsedTime: 0,
        })
      }

      const nodeResult = await this.batchInsertNodes(tanaNodes, progressCallback)
      result.imported.nodes = nodeResult.processedCount
      result.errors.nodes = nodeResult.errorCount
      memoryPeak = Math.max(memoryPeak, this.getCurrentMemoryUsage())

      // Phase 2: Import hierarchy relationships
      const hierarchyData = this.extractHierarchyData(tanaNodes)
      if (hierarchyData.length > 0) {
        const hierarchyResult = await this.batchInsertHierarchy(hierarchyData)
        result.imported.hierarchy = hierarchyResult.processedCount
        result.errors.hierarchy = hierarchyResult.errorCount
        memoryPeak = Math.max(memoryPeak, this.getCurrentMemoryUsage())
      }

      // Phase 3: Import references
      const referenceData = this.extractReferenceData(tanaNodes)
      if (referenceData.length > 0) {
        const referenceResult = await this.batchInsertReferences(referenceData)
        result.imported.references = referenceResult.processedCount
        result.errors.references = referenceResult.errorCount
        memoryPeak = Math.max(memoryPeak, this.getCurrentMemoryUsage())
      }

      // Phase 4: Update search index
      await this.updateSearchIndex(result.imported.nodes)

      result.duration = Date.now() - this.startTime
      result.memoryPeak = memoryPeak

      if (progressCallback) {
        progressCallback({
          totalNodes: tanaNodes.length,
          processedNodes: tanaNodes.length,
          skippedNodes: 0,
          currentNode: 'Import complete',
          memoryUsage: this.getCurrentMemoryUsage(),
          elapsedTime: result.duration,
        })
      }

      return result

    } catch (error) {
      throw new DatabaseError(`Batch import failed: ${error}`)
    }
  }

  /**
   * Batch insert nodes with optimized performance
   */
  async batchInsertNodes(
    tanaNodes: TanaNode[],
    progressCallback?: ProgressCallback
  ): Promise<BatchResult> {
    const startTime = Date.now()
    let processedCount = 0
    let errorCount = 0
    const errors: Array<{ index: number; error: string; data?: any }> = []

    const totalBatches = Math.ceil(tanaNodes.length / this.config.batchSize)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.config.batchSize
      const batchEnd = Math.min(batchStart + this.config.batchSize, tanaNodes.length)
      const batch = tanaNodes.slice(batchStart, batchEnd)

      try {
        const batchResult = await this.insertNodeBatch(batch, batchStart)
        processedCount += batchResult.success
        errorCount += batchResult.errors
        errors.push(...batchResult.errorDetails)

        // Memory check
        const memoryUsage = this.getCurrentMemoryUsage()
        if (memoryUsage > this.config.memoryLimit) {
          // Force garbage collection if available
          if (global.gc) {
            global.gc()
          }
        }

        // Progress callback
        if (progressCallback && this.config.enableProgress) {
          const elapsedTime = Date.now() - this.startTime
          const estimatedTotal = (elapsedTime / (batchIndex + 1)) * totalBatches
          
          progressCallback({
            totalNodes: tanaNodes.length,
            processedNodes: batchEnd,
            skippedNodes: errorCount,
            currentNode: `Batch ${batchIndex + 1}/${totalBatches}`,
            memoryUsage,
            elapsedTime,
            estimatedTimeRemaining: estimatedTotal - elapsedTime,
          })
        }

      } catch (error) {
        if (!this.config.continueOnError) {
          throw error
        }
        
        errorCount += batch.length
        errors.push({
          index: batchStart,
          error: `Batch ${batchIndex} failed: ${error}`,
          data: { batchSize: batch.length }
        })
      }
    }

    return {
      success: true,
      processedCount,
      errorCount,
      errors,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Insert a single batch of nodes (optimized transaction)
   */
  private async insertNodeBatch(
    tanaNodes: TanaNode[],
    startIndex: number
  ): Promise<{ success: number; errors: number; errorDetails: Array<{ index: number; error: string; data?: any }> }> {
    return this.db.transaction((tx) => {
      let success = 0
      let errors = 0
      const errorDetails: Array<{ index: number; error: string; data?: any }> = []

      // Prepare optimized insert statement
      const insertSQL = `
        INSERT OR IGNORE INTO nodes (
          id, name, content, doc_type, owner_id, created_at, updated_at,
          node_type, is_system_node, fields_json, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      for (let i = 0; i < tanaNodes.length; i++) {
        try {
          const tanaNode = tanaNodes[i]
          const nodeRecord = transformTanaNodeToRecord(tanaNode)

          const result = tx.run(insertSQL, [
            nodeRecord.id,
            nodeRecord.name,
            nodeRecord.content,
            nodeRecord.doc_type,
            nodeRecord.owner_id,
            nodeRecord.created_at,
            new Date().toISOString(), // updated_at
            nodeRecord.node_type,
            nodeRecord.is_system_node ? 1 : 0,
            nodeRecord.fields_json,
            nodeRecord.metadata_json,
          ])

          if (result.changes > 0) {
            success++
          } else {
            // Node already exists, count as success
            success++
          }

        } catch (error) {
          errors++
          if (this.config.continueOnError) {
            errorDetails.push({
              index: startIndex + i,
              error: `Node insert failed: ${error}`,
              data: { nodeId: tanaNodes[i]?.id }
            })
          } else {
            throw error
          }
        }
      }

      return { success, errors, errorDetails }
    })
  }

  /**
   * Batch insert hierarchy relationships
   */
  async batchInsertHierarchy(hierarchyData: HierarchyInsert[]): Promise<BatchResult> {
    const startTime = Date.now()
    let processedCount = 0
    let errorCount = 0
    const errors: Array<{ index: number; error: string; data?: any }> = []

    const totalBatches = Math.ceil(hierarchyData.length / this.config.batchSize)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.config.batchSize
      const batchEnd = Math.min(batchStart + this.config.batchSize, hierarchyData.length)
      const batch = hierarchyData.slice(batchStart, batchEnd)

      try {
        const result = await this.insertHierarchyBatch(batch, batchStart)
        processedCount += result.success
        errorCount += result.errors
        errors.push(...result.errorDetails)

      } catch (error) {
        if (!this.config.continueOnError) {
          throw error
        }
        errorCount += batch.length
        errors.push({
          index: batchStart,
          error: `Hierarchy batch ${batchIndex} failed: ${error}`,
        })
      }
    }

    return {
      success: true,
      processedCount,
      errorCount,
      errors,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Insert a batch of hierarchy relationships
   */
  private async insertHierarchyBatch(
    hierarchyData: HierarchyInsert[],
    startIndex: number
  ): Promise<{ success: number; errors: number; errorDetails: Array<{ index: number; error: string; data?: any }> }> {
    return this.db.transaction((tx) => {
      let success = 0
      let errors = 0
      const errorDetails: Array<{ index: number; error: string; data?: any }> = []

      const insertSQL = `
        INSERT OR IGNORE INTO node_hierarchy (id, parent_id, child_id, position, created_at)
        VALUES (?, ?, ?, ?, ?)
      `

      for (let i = 0; i < hierarchyData.length; i++) {
        try {
          const hierarchy = hierarchyData[i]
          const edgeId = `edge_${hierarchy.parent_id}_${hierarchy.child_id}_${Date.now()}_${i}`

          const result = tx.run(insertSQL, [
            edgeId,
            hierarchy.parent_id,
            hierarchy.child_id,
            hierarchy.position,
            new Date().toISOString(),
          ])

          if (result.changes > 0) {
            success++
          }

        } catch (error) {
          errors++
          if (this.config.continueOnError) {
            errorDetails.push({
              index: startIndex + i,
              error: `Hierarchy insert failed: ${error}`,
              data: hierarchyData[i]
            })
          } else {
            throw error
          }
        }
      }

      return { success, errors, errorDetails }
    })
  }

  /**
   * Batch insert references
   */
  async batchInsertReferences(referenceData: ReferenceInsert[]): Promise<BatchResult> {
    const startTime = Date.now()
    let processedCount = 0
    let errorCount = 0
    const errors: Array<{ index: number; error: string; data?: any }> = []

    const totalBatches = Math.ceil(referenceData.length / this.config.batchSize)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.config.batchSize
      const batchEnd = Math.min(batchStart + this.config.batchSize, referenceData.length)
      const batch = referenceData.slice(batchStart, batchEnd)

      try {
        const result = await this.insertReferenceBatch(batch, batchStart)
        processedCount += result.success
        errorCount += result.errors
        errors.push(...result.errorDetails)

      } catch (error) {
        if (!this.config.continueOnError) {
          throw error
        }
        errorCount += batch.length
        errors.push({
          index: batchStart,
          error: `Reference batch ${batchIndex} failed: ${error}`,
        })
      }
    }

    return {
      success: true,
      processedCount,
      errorCount,
      errors,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Insert a batch of references
   */
  private async insertReferenceBatch(
    referenceData: ReferenceInsert[],
    startIndex: number
  ): Promise<{ success: number; errors: number; errorDetails: Array<{ index: number; error: string; data?: any }> }> {
    return this.db.transaction((tx) => {
      let success = 0
      let errors = 0
      const errorDetails: Array<{ index: number; error: string; data?: any }> = []

      const insertSQL = `
        INSERT OR IGNORE INTO node_references (id, source_id, target_id, reference_type, context, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `

      for (let i = 0; i < referenceData.length; i++) {
        try {
          const reference = referenceData[i]
          const refId = `ref_${reference.source_id}_${reference.target_id}_${reference.reference_type}_${Date.now()}_${i}`

          const result = tx.run(insertSQL, [
            refId,
            reference.source_id,
            reference.target_id,
            reference.reference_type,
            reference.context || null,
            new Date().toISOString(),
          ])

          if (result.changes > 0) {
            success++
          }

        } catch (error) {
          errors++
          if (this.config.continueOnError) {
            errorDetails.push({
              index: startIndex + i,
              error: `Reference insert failed: ${error}`,
              data: referenceData[i]
            })
          } else {
            throw error
          }
        }
      }

      return { success, errors, errorDetails }
    })
  }

  /**
   * Batch update nodes
   */
  async batchUpdateNodes(updates: Array<{ id: string; data: NodeUpdate }>): Promise<BatchResult> {
    const startTime = Date.now()
    let processedCount = 0
    let errorCount = 0
    const errors: Array<{ index: number; error: string; data?: any }> = []

    const totalBatches = Math.ceil(updates.length / this.config.batchSize)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.config.batchSize
      const batchEnd = Math.min(batchStart + this.config.batchSize, updates.length)
      const batch = updates.slice(batchStart, batchEnd)

      try {
        const result = await this.updateNodeBatch(batch, batchStart)
        processedCount += result.success
        errorCount += result.errors
        errors.push(...result.errorDetails)

      } catch (error) {
        if (!this.config.continueOnError) {
          throw error
        }
        errorCount += batch.length
        errors.push({
          index: batchStart,
          error: `Update batch ${batchIndex} failed: ${error}`,
        })
      }
    }

    return {
      success: true,
      processedCount,
      errorCount,
      errors,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Update a batch of nodes
   */
  private async updateNodeBatch(
    updates: Array<{ id: string; data: NodeUpdate }>,
    startIndex: number
  ): Promise<{ success: number; errors: number; errorDetails: Array<{ index: number; error: string; data?: any }> }> {
    return this.db.transaction((tx) => {
      let success = 0
      let errors = 0
      const errorDetails: Array<{ index: number; error: string; data?: any }> = []
      const now = new Date().toISOString()

      for (let i = 0; i < updates.length; i++) {
        try {
          const { id, data } = updates[i]
          
          const updateFields = []
          const updateValues = []

          for (const [key, value] of Object.entries(data)) {
            if (key !== 'id' && key !== 'created_at') {
              updateFields.push(`${key} = ?`)
              updateValues.push(value)
            }
          }

          if (updateFields.length > 0) {
            updateFields.push('updated_at = ?')
            updateValues.push(now)
            updateValues.push(id)

            const result = tx.run(`
              UPDATE nodes 
              SET ${updateFields.join(', ')} 
              WHERE id = ?
            `, updateValues)

            if (result.changes > 0) {
              success++
            }
          }

        } catch (error) {
          errors++
          if (this.config.continueOnError) {
            errorDetails.push({
              index: startIndex + i,
              error: `Node update failed: ${error}`,
              data: updates[i]
            })
          } else {
            throw error
          }
        }
      }

      return { success, errors, errorDetails }
    })
  }

  /**
   * Batch delete operations
   */
  async batchDelete(operation: BatchOperation<{ id: string }>): Promise<BatchResult> {
    const startTime = Date.now()
    let processedCount = 0
    let errorCount = 0
    const errors: Array<{ index: number; error: string; data?: any }> = []

    const totalBatches = Math.ceil(operation.data.length / this.config.batchSize)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.config.batchSize
      const batchEnd = Math.min(batchStart + this.config.batchSize, operation.data.length)
      const batch = operation.data.slice(batchStart, batchEnd)

      try {
        const result = await this.deleteBatch(operation.table, batch, batchStart)
        processedCount += result.success
        errorCount += result.errors
        errors.push(...result.errorDetails)

      } catch (error) {
        if (!this.config.continueOnError) {
          throw error
        }
        errorCount += batch.length
        errors.push({
          index: batchStart,
          error: `Delete batch ${batchIndex} failed: ${error}`,
        })
      }
    }

    return {
      success: true,
      processedCount,
      errorCount,
      errors,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Delete a batch of records
   */
  private async deleteBatch(
    table: string,
    records: Array<{ id: string }>,
    startIndex: number
  ): Promise<{ success: number; errors: number; errorDetails: Array<{ index: number; error: string; data?: any }> }> {
    return this.db.transaction((tx) => {
      let success = 0
      let errors = 0
      const errorDetails: Array<{ index: number; error: string; data?: any }> = []

      // Use batch delete for better performance
      const ids = records.map(r => r.id)
      const placeholders = ids.map(() => '?').join(', ')

      try {
        const result = tx.run(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids)
        success = result.changes

      } catch (error) {
        errors = records.length
        errorDetails.push({
          index: startIndex,
          error: `Batch delete failed: ${error}`,
          data: { table, recordCount: records.length }
        })
      }

      return { success, errors, errorDetails }
    })
  }

  /**
   * Update search index for imported nodes
   */
  private async updateSearchIndex(nodeCount: number): Promise<void> {
    if (nodeCount === 0) return

    try {
      // Rebuild FTS index
      this.db.run('INSERT INTO node_search(node_search) VALUES(\'rebuild\')')
    } catch (error) {
      // FTS rebuild is optional, don't fail the entire import
      console.warn('Failed to rebuild search index:', error)
    }
  }

  /**
   * Extract hierarchy data from Tana nodes
   */
  private extractHierarchyData(tanaNodes: TanaNode[]): HierarchyInsert[] {
    const hierarchyData: HierarchyInsert[] = []

    for (const node of tanaNodes) {
      for (let i = 0; i < node.children.length; i++) {
        hierarchyData.push({
          parent_id: node.id,
          child_id: node.children[i],
          position: i,
        })
      }
    }

    return hierarchyData
  }

  /**
   * Extract reference data from Tana nodes
   */
  private extractReferenceData(tanaNodes: TanaNode[]): ReferenceInsert[] {
    const referenceData: ReferenceInsert[] = []

    for (const node of tanaNodes) {
      for (const referenceId of node.references) {
        referenceData.push({
          source_id: node.id,
          target_id: referenceId,
          reference_type: 'mention',
          context: null,
        })
      }
    }

    return referenceData
  }

  /**
   * Get current memory usage in MB
   */
  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage()
      return Math.round(usage.heapUsed / 1024 / 1024)
    }
    return 0
  }

  /**
   * Optimize database for batch operations
   */
  async optimizeForBatchOperations(): Promise<void> {
    // Temporarily disable synchronous writes for performance
    this.db.run('PRAGMA synchronous = OFF')
    this.db.run('PRAGMA journal_mode = MEMORY')
    this.db.run('PRAGMA cache_size = 10000')
    this.db.run('PRAGMA temp_store = MEMORY')
    
    // Disable foreign key checks during import
    this.db.run('PRAGMA foreign_keys = OFF')
  }

  /**
   * Restore normal database settings after batch operations
   */
  async restoreNormalSettings(): Promise<void> {
    this.db.run('PRAGMA synchronous = NORMAL')
    this.db.run('PRAGMA journal_mode = WAL')
    this.db.run('PRAGMA cache_size = 2000')
    this.db.run('PRAGMA foreign_keys = ON')
    
    // Analyze the database for query optimization
    this.db.run('ANALYZE')
  }
}

/**
 * Create batch operations instance
 */
export function createBatchOperations(
  db: DatabaseConnection,
  config?: Partial<BatchConfig>
): BatchOperations {
  return new BatchOperations(db, config)
}

/**
 * Utility functions for batch operations
 */
export const batchUtils = {
  /**
   * Calculate optimal batch size based on data characteristics
   */
  calculateOptimalBatchSize(
    avgRecordSize: number,
    availableMemory: number,
    targetMemoryUsage: number = 0.5
  ): number {
    const targetMemoryBytes = availableMemory * 1024 * 1024 * targetMemoryUsage
    const optimalBatchSize = Math.floor(targetMemoryBytes / avgRecordSize)
    
    // Ensure batch size is within reasonable bounds
    return Math.max(100, Math.min(10000, optimalBatchSize))
  },

  /**
   * Split large array into optimally sized chunks
   */
  chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  },

  /**
   * Estimate processing time based on current progress
   */
  estimateRemainingTime(
    processed: number,
    total: number,
    elapsedTime: number
  ): number {
    if (processed === 0) return 0
    const rate = processed / elapsedTime
    const remaining = total - processed
    return remaining / rate
  },

  /**
   * Monitor memory usage during batch operations
   */
  createMemoryMonitor(limitMB: number, callback: () => void) {
    const checkMemory = () => {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage()
        const usageMB = usage.heapUsed / 1024 / 1024
        
        if (usageMB > limitMB) {
          callback()
        }
      }
    }

    return setInterval(checkMemory, 1000) // Check every second
  },
}