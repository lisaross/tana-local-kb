/**
 * Reference operations for Tana graph database
 * 
 * This module manages node-to-node references (citations, mentions, links)
 * separate from hierarchical relationships, enabling rich cross-referencing.
 */

import type { 
  DatabaseConnection, 
  DatabaseTransaction,
  NodeRecord,
  NodeReferenceRecord,
  ReferenceInsert,
  FilterOptions
} from '../types/index.js'
import { DatabaseError, ConstraintViolationError } from '../types/database-types.js'
import { QUERY_PATTERNS, DB_CONSTRAINTS } from '../types/schema.js'

/**
 * Reference types commonly used in Tana
 */
export const REFERENCE_TYPES = {
  MENTION: 'mention',      // General reference/mention
  CITATION: 'citation',    // Academic or formal citation
  LINK: 'link',           // Explicit link
  TAG: 'tag',             // Tag reference
  FIELD: 'field',         // Field reference
  BACKLINK: 'backlink',   // Automatic backlink
  ALIAS: 'alias',         // Alternative name reference
  EMBED: 'embed',         // Embedded content reference
} as const

export type ReferenceType = typeof REFERENCE_TYPES[keyof typeof REFERENCE_TYPES]

/**
 * Reference analysis result
 */
export interface ReferenceAnalysis {
  nodeId: string
  incomingCount: number
  outgoingCount: number
  totalConnections: number
  referenceScore: number  // Calculated importance based on connections
  topReferencedBy: Array<{ nodeId: string; name: string; count: number }>
  topReferencesTo: Array<{ nodeId: string; name: string; count: number }>
}

/**
 * Reference operations class
 */
export class ReferenceOperations {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create a reference between two nodes
   */
  async createReference(
    sourceId: string, 
    targetId: string, 
    referenceType: string = REFERENCE_TYPES.MENTION,
    context?: string
  ): Promise<NodeReferenceRecord> {
    if (!sourceId || !targetId) {
      throw new ConstraintViolationError('Both source and target IDs are required')
    }

    if (sourceId === targetId) {
      throw new ConstraintViolationError('Node cannot reference itself')
    }

    // Validate that both nodes exist
    const sourceExists = await this.nodeExists(sourceId)
    const targetExists = await this.nodeExists(targetId)

    if (!sourceExists) {
      throw new DatabaseError(`Source node not found: ${sourceId}`, 'NODE_NOT_FOUND')
    }
    if (!targetExists) {
      throw new DatabaseError(`Target node not found: ${targetId}`, 'NODE_NOT_FOUND')
    }

    return this.db.transaction((tx) => {
      // Check if reference already exists with same type
      const [existing] = tx.query<NodeReferenceRecord>(`
        SELECT * FROM node_references 
        WHERE source_id = ? AND target_id = ? AND reference_type = ?
      `, [sourceId, targetId, referenceType])

      if (existing) {
        // Update context if provided
        if (context) {
          const result = tx.run(`
            UPDATE node_references 
            SET context = ? 
            WHERE id = ?
          `, [context, existing.id])

          if (result.changes > 0) {
            const [updated] = tx.query<NodeReferenceRecord>(`
              SELECT * FROM node_references WHERE id = ?
            `, [existing.id])
            return updated
          }
        }
        return existing
      }

      // Create new reference
      const refId = `ref_${sourceId}_${targetId}_${referenceType}_${Date.now()}`
      const result = tx.run(`
        INSERT INTO node_references (id, source_id, target_id, reference_type, context, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        refId,
        sourceId,
        targetId,
        referenceType,
        context || null,
        new Date().toISOString(),
      ])

      if (result.changes === 0) {
        throw new DatabaseError('Failed to create reference')
      }

      const [created] = tx.query<NodeReferenceRecord>(`
        SELECT * FROM node_references WHERE id = ?
      `, [refId])

      return created
    })
  }

  /**
   * Create multiple references in batch
   */
  async createReferences(references: Array<{
    sourceId: string
    targetId: string
    referenceType?: string
    context?: string
  }>): Promise<NodeReferenceRecord[]> {
    if (references.length === 0) return []

    return this.db.transaction((tx) => {
      const created: NodeReferenceRecord[] = []
      const now = new Date().toISOString()

      for (const ref of references) {
        try {
          if (!ref.sourceId || !ref.targetId || ref.sourceId === ref.targetId) {
            continue
          }

          const referenceType = ref.referenceType || REFERENCE_TYPES.MENTION

          // Check if reference already exists
          const [existing] = tx.query<NodeReferenceRecord>(`
            SELECT * FROM node_references 
            WHERE source_id = ? AND target_id = ? AND reference_type = ?
          `, [ref.sourceId, ref.targetId, referenceType])

          if (existing) {
            continue
          }

          // Create new reference
          const refId = `ref_${ref.sourceId}_${ref.targetId}_${referenceType}_${Date.now()}_${Math.random().toString(36).slice(2)}`
          const result = tx.run(`
            INSERT INTO node_references (id, source_id, target_id, reference_type, context, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            refId,
            ref.sourceId,
            ref.targetId,
            referenceType,
            ref.context || null,
            now,
          ])

          if (result.changes > 0) {
            const [newRef] = tx.query<NodeReferenceRecord>(`
              SELECT * FROM node_references WHERE id = ?
            `, [refId])
            
            if (newRef) {
              created.push(newRef)
            }
          }
        } catch (error) {
          // Skip invalid references in batch operations
          continue
        }
      }

      return created
    })
  }

  /**
   * Remove a reference
   */
  async removeReference(sourceId: string, targetId: string, referenceType?: string): Promise<number> {
    if (!sourceId || !targetId) {
      throw new ConstraintViolationError('Both source and target IDs are required')
    }

    let sql = 'DELETE FROM node_references WHERE source_id = ? AND target_id = ?'
    const params = [sourceId, targetId]

    if (referenceType) {
      sql += ' AND reference_type = ?'
      params.push(referenceType)
    }

    const result = this.db.run(sql, params)
    return result.changes
  }

  /**
   * Remove all references for a node
   */
  async removeAllReferences(nodeId: string): Promise<{ removedAsSource: number; removedAsTarget: number }> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    const removedAsSource = this.db.run('DELETE FROM node_references WHERE source_id = ?', [nodeId])
    const removedAsTarget = this.db.run('DELETE FROM node_references WHERE target_id = ?', [nodeId])

    return {
      removedAsSource: removedAsSource.changes,
      removedAsTarget: removedAsTarget.changes,
    }
  }

  /**
   * Get all references from a node (outgoing)
   */
  async getReferencesFrom(nodeId: string, referenceType?: string): Promise<NodeRecord[]> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    let sql = QUERY_PATTERNS.GET_REFERENCES_FROM
    const params = [nodeId]

    if (referenceType) {
      sql = sql.replace('WHERE r.source_id = ?', 'WHERE r.source_id = ? AND r.reference_type = ?')
      params.push(referenceType)
    }

    return this.db.query<NodeRecord>(sql, params)
  }

  /**
   * Get all references to a node (incoming)
   */
  async getReferencesTo(nodeId: string, referenceType?: string): Promise<NodeRecord[]> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    let sql = QUERY_PATTERNS.GET_REFERENCES_TO
    const params = [nodeId]

    if (referenceType) {
      sql = sql.replace('WHERE r.target_id = ?', 'WHERE r.target_id = ? AND r.reference_type = ?')
      params.push(referenceType)
    }

    return this.db.query<NodeRecord>(sql, params)
  }

  /**
   * Get all references with metadata (including type and context)
   */
  async getReferencesWithMetadata(nodeId: string, direction: 'outgoing' | 'incoming' | 'both' = 'both'): Promise<Array<{
    reference: NodeReferenceRecord
    node: NodeRecord
    direction: 'outgoing' | 'incoming'
  }>> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    const results: Array<{ reference: NodeReferenceRecord; node: NodeRecord; direction: 'outgoing' | 'incoming' }> = []

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = this.db.query<{ reference: NodeReferenceRecord; node: NodeRecord }>(`
        SELECT 
          r.id as 'reference.id',
          r.source_id as 'reference.source_id',
          r.target_id as 'reference.target_id',
          r.reference_type as 'reference.reference_type',
          r.context as 'reference.context',
          r.created_at as 'reference.created_at',
          n.id as 'node.id',
          n.name as 'node.name',
          n.content as 'node.content',
          n.doc_type as 'node.doc_type',
          n.owner_id as 'node.owner_id',
          n.created_at as 'node.created_at',
          n.updated_at as 'node.updated_at',
          n.node_type as 'node.node_type',
          n.is_system_node as 'node.is_system_node',
          n.fields_json as 'node.fields_json',
          n.metadata_json as 'node.metadata_json'
        FROM node_references r
        JOIN nodes n ON r.target_id = n.id
        WHERE r.source_id = ?
      `, [nodeId])

      for (const row of outgoing) {
        const reference: NodeReferenceRecord = {
          id: row['reference.id'],
          source_id: row['reference.source_id'],
          target_id: row['reference.target_id'],
          reference_type: row['reference.reference_type'],
          context: row['reference.context'],
          created_at: row['reference.created_at'],
        }
        
        const node: NodeRecord = {
          id: row['node.id'],
          name: row['node.name'],
          content: row['node.content'],
          doc_type: row['node.doc_type'],
          owner_id: row['node.owner_id'],
          created_at: row['node.created_at'],
          updated_at: row['node.updated_at'],
          node_type: row['node.node_type'],
          is_system_node: Boolean(row['node.is_system_node']),
          fields_json: row['node.fields_json'],
          metadata_json: row['node.metadata_json'],
        }

        results.push({ reference, node, direction: 'outgoing' })
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      const incoming = this.db.query<any>(`
        SELECT 
          r.id as 'reference.id',
          r.source_id as 'reference.source_id',
          r.target_id as 'reference.target_id',
          r.reference_type as 'reference.reference_type',
          r.context as 'reference.context',
          r.created_at as 'reference.created_at',
          n.id as 'node.id',
          n.name as 'node.name',
          n.content as 'node.content',
          n.doc_type as 'node.doc_type',
          n.owner_id as 'node.owner_id',
          n.created_at as 'node.created_at',
          n.updated_at as 'node.updated_at',
          n.node_type as 'node.node_type',
          n.is_system_node as 'node.is_system_node',
          n.fields_json as 'node.fields_json',
          n.metadata_json as 'node.metadata_json'
        FROM node_references r
        JOIN nodes n ON r.source_id = n.id
        WHERE r.target_id = ?
      `, [nodeId])

      for (const row of incoming) {
        const reference: NodeReferenceRecord = {
          id: row['reference.id'],
          source_id: row['reference.source_id'],
          target_id: row['reference.target_id'],
          reference_type: row['reference.reference_type'],
          context: row['reference.context'],
          created_at: row['reference.created_at'],
        }
        
        const node: NodeRecord = {
          id: row['node.id'],
          name: row['node.name'],
          content: row['node.content'],
          doc_type: row['node.doc_type'],
          owner_id: row['node.owner_id'],
          created_at: row['node.created_at'],
          updated_at: row['node.updated_at'],
          node_type: row['node.node_type'],
          is_system_node: Boolean(row['node.is_system_node']),
          fields_json: row['node.fields_json'],
          metadata_json: row['node.metadata_json'],
        }

        results.push({ reference, node, direction: 'incoming' })
      }
    }

    return results
  }

  /**
   * Get reference counts for a node
   */
  async getReferenceCounts(nodeId: string): Promise<{
    incoming: number
    outgoing: number
    byType: Record<string, { incoming: number; outgoing: number }>
  }> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    const [incoming] = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM node_references WHERE target_id = ?
    `, [nodeId])

    const [outgoing] = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM node_references WHERE source_id = ?
    `, [nodeId])

    const incomingByType = this.db.query<{ reference_type: string; count: number }>(`
      SELECT reference_type, COUNT(*) as count 
      FROM node_references 
      WHERE target_id = ? 
      GROUP BY reference_type
    `, [nodeId])

    const outgoingByType = this.db.query<{ reference_type: string; count: number }>(`
      SELECT reference_type, COUNT(*) as count 
      FROM node_references 
      WHERE source_id = ? 
      GROUP BY reference_type
    `, [nodeId])

    const byType: Record<string, { incoming: number; outgoing: number }> = {}

    for (const item of incomingByType) {
      if (!byType[item.reference_type]) {
        byType[item.reference_type] = { incoming: 0, outgoing: 0 }
      }
      byType[item.reference_type].incoming = item.count
    }

    for (const item of outgoingByType) {
      if (!byType[item.reference_type]) {
        byType[item.reference_type] = { incoming: 0, outgoing: 0 }
      }
      byType[item.reference_type].outgoing = item.count
    }

    return {
      incoming: incoming.count,
      outgoing: outgoing.count,
      byType,
    }
  }

  /**
   * Find mutual references (nodes that reference each other)
   */
  async findMutualReferences(nodeId: string): Promise<Array<{
    nodeId: string
    name: string
    mutualTypes: string[]
  }>> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    const mutuals = this.db.query<{ 
      node_id: string
      name: string
      reference_type: string 
    }>(`
      SELECT DISTINCT 
        CASE 
          WHEN r1.source_id = ? THEN r1.target_id 
          ELSE r1.source_id 
        END as node_id,
        n.name,
        r1.reference_type
      FROM node_references r1
      JOIN node_references r2 ON (
        (r1.source_id = ? AND r2.target_id = ? AND r1.target_id = r2.source_id) OR
        (r1.target_id = ? AND r2.source_id = ? AND r1.source_id = r2.target_id)
      )
      JOIN nodes n ON n.id = CASE 
        WHEN r1.source_id = ? THEN r1.target_id 
        ELSE r1.source_id 
      END
      WHERE r1.source_id = ? OR r1.target_id = ?
    `, [nodeId, nodeId, nodeId, nodeId, nodeId, nodeId, nodeId, nodeId])

    // Group by node ID
    const grouped = new Map<string, { name: string; types: Set<string> }>()
    
    for (const mutual of mutuals) {
      if (!grouped.has(mutual.node_id)) {
        grouped.set(mutual.node_id, { name: mutual.name, types: new Set() })
      }
      grouped.get(mutual.node_id)!.types.add(mutual.reference_type)
    }

    return Array.from(grouped.entries()).map(([nodeId, data]) => ({
      nodeId,
      name: data.name,
      mutualTypes: Array.from(data.types),
    }))
  }

  /**
   * Get most referenced nodes
   */
  async getMostReferencedNodes(limit: number = 10, referenceType?: string): Promise<Array<{
    node: NodeRecord
    referenceCount: number
  }>> {
    let sql = `
      SELECT n.*, COUNT(r.id) as reference_count
      FROM nodes n
      JOIN node_references r ON n.id = r.target_id
    `
    const params: any[] = []

    if (referenceType) {
      sql += ' WHERE r.reference_type = ?'
      params.push(referenceType)
    }

    sql += `
      GROUP BY n.id
      ORDER BY reference_count DESC
      LIMIT ?
    `
    params.push(limit)

    const results = this.db.query<NodeRecord & { reference_count: number }>(sql, params)

    return results.map(result => {
      const { reference_count, ...node } = result
      return {
        node,
        referenceCount: reference_count,
      }
    })
  }

  /**
   * Analyze reference patterns for a node
   */
  async analyzeNodeReferences(nodeId: string): Promise<ReferenceAnalysis> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    const counts = await this.getReferenceCounts(nodeId)
    
    // Get top nodes that reference this node
    const topReferencedBy = this.db.query<{ nodeId: string; name: string; count: number }>(`
      SELECT n.id as nodeId, n.name, COUNT(*) as count
      FROM node_references r
      JOIN nodes n ON r.source_id = n.id
      WHERE r.target_id = ?
      GROUP BY n.id, n.name
      ORDER BY count DESC
      LIMIT 5
    `, [nodeId])

    // Get top nodes this node references
    const topReferencesTo = this.db.query<{ nodeId: string; name: string; count: number }>(`
      SELECT n.id as nodeId, n.name, COUNT(*) as count
      FROM node_references r
      JOIN nodes n ON r.target_id = n.id
      WHERE r.source_id = ?
      GROUP BY n.id, n.name
      ORDER BY count DESC
      LIMIT 5
    `, [nodeId])

    // Calculate reference score (weighted importance)
    const referenceScore = counts.incoming * 2 + counts.outgoing // Incoming references weighted higher

    return {
      nodeId,
      incomingCount: counts.incoming,
      outgoingCount: counts.outgoing,
      totalConnections: counts.incoming + counts.outgoing,
      referenceScore,
      topReferencedBy,
      topReferencesTo,
    }
  }

  /**
   * Get reference statistics
   */
  async getReferenceStats(): Promise<{
    totalReferences: number
    referencesByType: Record<string, number>
    avgReferencesPerNode: number
    mostConnectedNodes: Array<{ nodeId: string; name: string; totalConnections: number }>
    orphanedNodes: number
  }> {
    const [totalRefs] = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM node_references')
    
    const byType = this.db.query<{ reference_type: string; count: number }>(`
      SELECT reference_type, COUNT(*) as count 
      FROM node_references 
      GROUP BY reference_type
    `)

    const [totalNodes] = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM nodes')
    
    const mostConnected = this.db.query<{ nodeId: string; name: string; totalConnections: number }>(`
      SELECT 
        n.id as nodeId,
        n.name,
        (COALESCE(incoming.count, 0) + COALESCE(outgoing.count, 0)) as totalConnections
      FROM nodes n
      LEFT JOIN (
        SELECT target_id, COUNT(*) as count 
        FROM node_references 
        GROUP BY target_id
      ) incoming ON n.id = incoming.target_id
      LEFT JOIN (
        SELECT source_id, COUNT(*) as count 
        FROM node_references 
        GROUP BY source_id
      ) outgoing ON n.id = outgoing.source_id
      WHERE (COALESCE(incoming.count, 0) + COALESCE(outgoing.count, 0)) > 0
      ORDER BY totalConnections DESC
      LIMIT 10
    `)

    const [orphaned] = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM nodes
      WHERE id NOT IN (SELECT DISTINCT source_id FROM node_references)
      AND id NOT IN (SELECT DISTINCT target_id FROM node_references)
    `)

    const referencesByType: Record<string, number> = {}
    for (const item of byType) {
      referencesByType[item.reference_type] = item.count
    }

    return {
      totalReferences: totalRefs.count,
      referencesByType,
      avgReferencesPerNode: totalNodes.count > 0 ? totalRefs.count / totalNodes.count : 0,
      mostConnectedNodes: mostConnected,
      orphanedNodes: orphaned.count,
    }
  }

  /**
   * Validate and clean orphaned references
   */
  async validateAndCleanReferences(): Promise<{
    orphanedReferences: number
    invalidTypes: number
    duplicates: number
    cleaned: number
  }> {
    return this.db.transaction((tx) => {
      // Find orphaned references (pointing to non-existent nodes)
      const orphaned = tx.query<{ id: string }>(`
        SELECT r.id
        FROM node_references r
        LEFT JOIN nodes s ON r.source_id = s.id
        LEFT JOIN nodes t ON r.target_id = t.id
        WHERE s.id IS NULL OR t.id IS NULL
      `)

      // Find self-references
      const selfRefs = tx.query<{ id: string }>(`
        SELECT id FROM node_references WHERE source_id = target_id
      `)

      // Find exact duplicates
      const duplicates = tx.query<{ id: string; keep_id: string }>(`
        SELECT r1.id, MIN(r2.id) as keep_id
        FROM node_references r1
        JOIN node_references r2 ON (
          r1.source_id = r2.source_id AND 
          r1.target_id = r2.target_id AND 
          r1.reference_type = r2.reference_type AND
          r1.id != r2.id
        )
        GROUP BY r1.id
        HAVING r1.id > keep_id
      `)

      let cleaned = 0

      // Clean orphaned references
      for (const ref of orphaned) {
        tx.run('DELETE FROM node_references WHERE id = ?', [ref.id])
        cleaned++
      }

      // Clean self-references
      for (const ref of selfRefs) {
        tx.run('DELETE FROM node_references WHERE id = ?', [ref.id])
        cleaned++
      }

      // Clean duplicates
      for (const ref of duplicates) {
        tx.run('DELETE FROM node_references WHERE id = ?', [ref.id])
        cleaned++
      }

      return {
        orphanedReferences: orphaned.length,
        invalidTypes: selfRefs.length,
        duplicates: duplicates.length,
        cleaned,
      }
    })
  }

  /**
   * Check if a node exists (helper method)
   */
  private async nodeExists(nodeId: string): Promise<boolean> {
    const [result] = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM nodes WHERE id = ?', [nodeId])
    return result.count > 0
  }
}

/**
 * Create reference operations instance
 */
export function createReferenceOperations(db: DatabaseConnection): ReferenceOperations {
  return new ReferenceOperations(db)
}

/**
 * Utility functions for reference operations
 */
export const referenceUtils = {
  /**
   * Extract references from text content
   */
  extractReferencesFromText(content: string): Array<{ match: string; type: ReferenceType }> {
    const references: Array<{ match: string; type: ReferenceType }> = []

    // [[Node Name]] syntax
    const wikiLinkPattern = /\[\[([^\]]+)\]\]/g
    let match = wikiLinkPattern.exec(content)
    while (match) {
      references.push({ match: match[1], type: REFERENCE_TYPES.LINK })
      match = wikiLinkPattern.exec(content)
    }

    // #tag syntax
    const tagPattern = /#([a-zA-Z0-9_-]+)/g
    match = tagPattern.exec(content)
    while (match) {
      references.push({ match: match[1], type: REFERENCE_TYPES.TAG })
      match = tagPattern.exec(content)
    }

    // @mention syntax
    const mentionPattern = /@([a-zA-Z0-9_-]+)/g
    match = mentionPattern.exec(content)
    while (match) {
      references.push({ match: match[1], type: REFERENCE_TYPES.MENTION })
      match = mentionPattern.exec(content)
    }

    return references
  },

  /**
   * Calculate reference strength between two nodes
   */
  calculateReferenceStrength(
    references: NodeReferenceRecord[],
    sourceId: string,
    targetId: string
  ): number {
    const directRefs = references.filter(
      r => (r.source_id === sourceId && r.target_id === targetId) ||
           (r.source_id === targetId && r.target_id === sourceId)
    )

    // Weight different reference types
    const weights: Record<string, number> = {
      [REFERENCE_TYPES.CITATION]: 3,
      [REFERENCE_TYPES.LINK]: 2,
      [REFERENCE_TYPES.MENTION]: 1,
      [REFERENCE_TYPES.TAG]: 1,
      [REFERENCE_TYPES.FIELD]: 2,
      [REFERENCE_TYPES.EMBED]: 2,
    }

    return directRefs.reduce((strength, ref) => {
      return strength + (weights[ref.reference_type] || 1)
    }, 0)
  },

  /**
   * Build reference graph for visualization
   */
  buildReferenceGraph(
    nodes: NodeRecord[],
    references: NodeReferenceRecord[]
  ): {
    nodes: Array<{ id: string; name: string; type: string; connections: number }>
    edges: Array<{ source: string; target: string; type: string; weight: number }>
  } {
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const connectionCounts = new Map<string, number>()

    // Count connections for each node
    for (const ref of references) {
      connectionCounts.set(ref.source_id, (connectionCounts.get(ref.source_id) || 0) + 1)
      connectionCounts.set(ref.target_id, (connectionCounts.get(ref.target_id) || 0) + 1)
    }

    // Build node list
    const graphNodes = nodes.map(node => ({
      id: node.id,
      name: node.name,
      type: node.node_type,
      connections: connectionCounts.get(node.id) || 0,
    }))

    // Build edge list with weights
    const edgeWeights = new Map<string, { type: string; count: number }>()
    
    for (const ref of references) {
      const key = `${ref.source_id}-${ref.target_id}`
      const existing = edgeWeights.get(key)
      
      if (existing) {
        existing.count++
      } else {
        edgeWeights.set(key, { type: ref.reference_type, count: 1 })
      }
    }

    const graphEdges = Array.from(edgeWeights.entries()).map(([key, data]) => {
      const [source, target] = key.split('-')
      return {
        source,
        target,
        type: data.type,
        weight: data.count,
      }
    })

    return { nodes: graphNodes, edges: graphEdges }
  },
}