/**
 * Database operations export index
 * 
 * Central export point for all database operation modules providing
 * CRUD operations, batch processing, and transaction management.
 */

// Core operations
export * from './nodes.js'
export * from './edges.js'
export * from './references.js'
export * from './batch.js'
export * from './transactions.js'

// Re-export types for convenience
export type {
  DatabaseConnection,
  DatabaseTransaction,
  NodeRecord,
  NodeInsert,
  NodeUpdate,
  NodeWithRelations,
  NodeHierarchyRecord,
  HierarchyInsert,
  NodeReferenceRecord,
  ReferenceInsert,
  BatchOperation,
  BatchResult,
  TransactionOptions,
  TransactionStats,
  FilterOptions,
  PaginationOptions,
  PaginatedResult,
} from '../types/index.js'

import type { DatabaseConnection } from '../types/index.js'
import { NodeOperations, createNodeOperations } from './nodes.js'
import { EdgeOperations, createEdgeOperations } from './edges.js'
import { ReferenceOperations, createReferenceOperations } from './references.js'
import { BatchOperations, createBatchOperations } from './batch.js'
import { TransactionManager, createTransactionManager } from './transactions.js'

/**
 * Combined operations manager providing all database functionality
 */
export class DatabaseOperations {
  public readonly nodes: NodeOperations
  public readonly edges: EdgeOperations
  public readonly references: ReferenceOperations
  public readonly batch: BatchOperations
  public readonly transactions: TransactionManager

  constructor(db: DatabaseConnection) {
    this.nodes = createNodeOperations(db)
    this.edges = createEdgeOperations(db)
    this.references = createReferenceOperations(db)
    this.batch = createBatchOperations(db)
    this.transactions = createTransactionManager(db)
  }

  /**
   * Get comprehensive database statistics
   */
  async getDatabaseStats(): Promise<{
    nodes: {
      total: number
      byType: Record<string, number>
      systemNodes: number
      rootNodes: number
      leafNodes: number
    }
    hierarchy: {
      totalEdges: number
      maxDepth: number
      avgChildrenPerNode: number
      orphanedNodes: number
    }
    references: {
      total: number
      byType: Record<string, number>
      avgReferencesPerNode: number
      mostConnectedNodes: Array<{ nodeId: string; name: string; connections: number }>
    }
    performance: {
      avgQueryTime: number
      activeTransactions: number
      memoryUsage: number
    }
  }> {
    // Get node statistics
    const totalNodes = await this.nodes.getNodeCount()
    const systemNodes = await this.nodes.getNodeCount({ isSystemNode: true })
    const rootNodes = (await this.edges.getRootNodes()).length
    const leafNodes = (await this.edges.getLeafNodes()).length

    // Get node types
    const nodeTypes = await this.nodes.db.query<{ node_type: string; count: number }>(`
      SELECT node_type, COUNT(*) as count 
      FROM nodes 
      GROUP BY node_type
    `)
    const byType = Object.fromEntries(nodeTypes.map(nt => [nt.node_type, nt.count]))

    // Get hierarchy statistics
    const hierarchyStats = await this.edges.getHierarchyStats()

    // Get reference statistics  
    const referenceStats = await this.references.getReferenceStats()

    // Get performance metrics
    const performanceMetrics = this.transactions.getPerformanceMetrics()
    const activeTransactions = this.transactions.getActiveTransactions().length

    return {
      nodes: {
        total: totalNodes,
        byType,
        systemNodes,
        rootNodes,
        leafNodes,
      },
      hierarchy: hierarchyStats,
      references: {
        total: referenceStats.totalReferences,
        byType: referenceStats.referencesByType,
        avgReferencesPerNode: referenceStats.avgReferencesPerNode,
        mostConnectedNodes: referenceStats.mostConnectedNodes,
      },
      performance: {
        avgQueryTime: performanceMetrics.averageTransactionTime,
        activeTransactions,
        memoryUsage: this.getCurrentMemoryUsage(),
      },
    }
  }

  /**
   * Validate database integrity
   */
  async validateIntegrity(): Promise<{
    valid: boolean
    issues: Array<{
      type: 'error' | 'warning'
      category: 'nodes' | 'hierarchy' | 'references' | 'indexes'
      message: string
      count?: number
    }>
    fixedIssues: number
  }> {
    const issues: Array<{
      type: 'error' | 'warning'
      category: 'nodes' | 'hierarchy' | 'references' | 'indexes'
      message: string
      count?: number
    }> = []
    let fixedIssues = 0

    // Validate and fix hierarchy issues
    const hierarchyValidation = await this.edges.validateAndFixHierarchy()
    if (hierarchyValidation.orphanedEdges.length > 0) {
      issues.push({
        type: 'error',
        category: 'hierarchy',
        message: 'Orphaned hierarchy edges detected and removed',
        count: hierarchyValidation.orphanedEdges.length,
      })
    }
    if (hierarchyValidation.duplicateEdges.length > 0) {
      issues.push({
        type: 'warning',
        category: 'hierarchy',
        message: 'Duplicate hierarchy edges detected and removed',
        count: hierarchyValidation.duplicateEdges.length,
      })
    }
    fixedIssues += hierarchyValidation.fixedCount

    // Validate and fix reference issues
    const referenceValidation = await this.references.validateAndCleanReferences()
    if (referenceValidation.orphanedReferences > 0) {
      issues.push({
        type: 'error',
        category: 'references',
        message: 'Orphaned references detected and removed',
        count: referenceValidation.orphanedReferences,
      })
    }
    if (referenceValidation.duplicates > 0) {
      issues.push({
        type: 'warning',
        category: 'references',
        message: 'Duplicate references detected and removed',
        count: referenceValidation.duplicates,
      })
    }
    fixedIssues += referenceValidation.cleaned

    // Check for database consistency
    const [nodeCount] = await this.nodes.db.query<{ count: number }>('SELECT COUNT(*) as count FROM nodes')
    const [hierarchyCount] = await this.nodes.db.query<{ count: number }>('SELECT COUNT(*) as count FROM node_hierarchy')
    const [referenceCount] = await this.nodes.db.query<{ count: number }>('SELECT COUNT(*) as count FROM node_references')

    if (nodeCount.count === 0 && (hierarchyCount.count > 0 || referenceCount.count > 0)) {
      issues.push({
        type: 'error',
        category: 'nodes',
        message: 'No nodes found but relationships exist',
      })
    }

    const valid = issues.filter(i => i.type === 'error').length === 0

    return {
      valid,
      issues,
      fixedIssues,
    }
  }

  /**
   * Optimize database performance
   */
  async optimizeDatabase(): Promise<{
    success: boolean
    optimizations: Array<{
      type: string
      description: string
      improvement?: string
    }>
    duration: number
  }> {
    const startTime = Date.now()
    const optimizations: Array<{ type: string; description: string; improvement?: string }> = []

    try {
      // Update table statistics
      await this.nodes.db.run('ANALYZE')
      optimizations.push({
        type: 'statistics',
        description: 'Updated table statistics for query planner',
      })

      // Optimize query planner
      try {
        this.nodes.db.run('PRAGMA optimize')
      } catch (error) {
        console.warn('PRAGMA optimize not supported:', error)
      }
      optimizations.push({
        type: 'planner',
        description: 'Optimized query planner settings',
      })

      // Incremental vacuum if needed
      const [pageInfo] = await this.nodes.db.query<{ page_count: number; freelist_count: number }>(`
        PRAGMA page_count, freelist_count
      `)
      
      if (pageInfo.freelist_count > pageInfo.page_count * 0.1) {
        await this.nodes.db.run('PRAGMA incremental_vacuum')
        optimizations.push({
          type: 'vacuum',
          description: 'Performed incremental vacuum to reclaim space',
          improvement: `Freed ${pageInfo.freelist_count} pages`,
        })
      }

      // Check and create missing indexes
      const indexesCreated = await this.createMissingIndexes()
      if (indexesCreated > 0) {
        optimizations.push({
          type: 'indexes',
          description: 'Created missing database indexes',
          improvement: `Created ${indexesCreated} indexes`,
        })
      }

      return {
        success: true,
        optimizations,
        duration: Date.now() - startTime,
      }

    } catch (error) {
      return {
        success: false,
        optimizations,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Create missing database indexes
   */
  private async createMissingIndexes(): Promise<number> {
    const existingIndexes = await this.nodes.db.query<{ name: string }>(`
      SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL
    `)
    
    const existingNames = new Set(existingIndexes.map(i => i.name))
    let created = 0

    // List of important indexes that should exist
    const requiredIndexes = [
      'idx_nodes_name',
      'idx_nodes_type',
      'idx_nodes_system',
      'idx_hierarchy_parent',
      'idx_hierarchy_child',
      'idx_references_source',
      'idx_references_target',
    ]

    for (const indexName of requiredIndexes) {
      if (!existingNames.has(indexName)) {
        try {
          // Create the index (the actual SQL would come from INDEX_DEFINITIONS)
          await this.createIndexIfNotExists(indexName)
          created++
        } catch (error) {
          console.warn(`Failed to create index ${indexName}:`, error)
        }
      }
    }

    return created
  }

  /**
   * Create an index if it doesn't exist
   */
  private async createIndexIfNotExists(indexName: string): Promise<void> {
    const indexDefinitions: Record<string, string> = {
      'idx_nodes_name': 'CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)',
      'idx_nodes_type': 'CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type)',
      'idx_nodes_system': 'CREATE INDEX IF NOT EXISTS idx_nodes_system ON nodes(is_system_node)',
      'idx_hierarchy_parent': 'CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON node_hierarchy(parent_id)',
      'idx_hierarchy_child': 'CREATE INDEX IF NOT EXISTS idx_hierarchy_child ON node_hierarchy(child_id)',
      'idx_references_source': 'CREATE INDEX IF NOT EXISTS idx_references_source ON node_references(source_id)',
      'idx_references_target': 'CREATE INDEX IF NOT EXISTS idx_references_target ON node_references(target_id)',
    }

    const sql = indexDefinitions[indexName]
    if (sql) {
      await this.nodes.db.run(sql)
    }
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage()
      return Math.round(usage.heapUsed / 1024 / 1024) // MB
    }
    return 0
  }
}

/**
 * Create combined operations manager
 */
export function createDatabaseOperations(db: DatabaseConnection): DatabaseOperations {
  return new DatabaseOperations(db)
}

/**
 * Convenience function to create all operation managers
 */
export function createOperationManagers(db: DatabaseConnection) {
  return {
    nodes: createNodeOperations(db),
    edges: createEdgeOperations(db),
    references: createReferenceOperations(db),
    batch: createBatchOperations(db),
    transactions: createTransactionManager(db),
    combined: createDatabaseOperations(db),
  }
}

/**
 * Default export for common usage
 */
export default {
  createOperations: createDatabaseOperations,
  createManagers: createOperationManagers,
}