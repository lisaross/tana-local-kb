/**
 * Node CRUD operations for Tana graph database
 * 
 * This module provides all basic CRUD operations for nodes with optimized
 * performance for large datasets and comprehensive error handling.
 */

import type { 
  DatabaseConnection, 
  DatabaseTransaction,
  NodeRecord, 
  NodeInsert, 
  NodeUpdate, 
  NodeWithRelations,
  FilterOptions,
  PaginationOptions,
  PaginatedResult,
  ValidationRule
} from '../types/index.js'

// Extended interface for test convenience - allows passing tags and metadata as properties
interface NodeInsertWithExtras extends NodeInsert {
  tags?: string[]
  metadata?: Record<string, any>
}
import type { TanaNode } from '../../parser/types/index.js'
import { DatabaseError, ConstraintViolationError } from '../types/database-types.js'
import { QUERY_PATTERNS, DB_CONSTRAINTS } from '../types/schema.js'

/**
 * Validation rules for node operations
 */
const NODE_VALIDATION_RULES: ValidationRule[] = [
  { field: 'id', rule: 'required', message: 'Node ID is required' },
  { field: 'id', rule: 'pattern', value: /^[a-zA-Z0-9_-]+$/, message: 'Node ID contains invalid characters' },
  { field: 'name', rule: 'required', message: 'Node name is required' },
  { field: 'name', rule: 'maxLength', value: DB_CONSTRAINTS.MAX_NAME_LENGTH, message: 'Node name too long' },
  { field: 'content', rule: 'maxLength', value: DB_CONSTRAINTS.MAX_CONTENT_LENGTH, message: 'Content too long' },
  { field: 'node_type', rule: 'pattern', value: /^(node|field|reference)$/, message: 'Invalid node type' },
]

/**
 * Validate node data against constraints
 */
function validateNode(node: Partial<NodeRecord>): void {
  for (const rule of NODE_VALIDATION_RULES) {
    const value = (node as any)[rule.field]
    
    switch (rule.rule) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          throw new ConstraintViolationError(rule.message, value)
        }
        break
      case 'maxLength':
        if (typeof value === 'string' && value.length > rule.value) {
          throw new ConstraintViolationError(rule.message, `${value.length}/${rule.value}`)
        }
        break
      case 'pattern':
        if (typeof value === 'string' && !rule.value.test(value)) {
          throw new ConstraintViolationError(rule.message, value)
        }
        break
    }
  }
}

/**
 * Transform TanaNode from parser to database NodeInsert format
 */
export function transformTanaNodeToRecord(tanaNode: TanaNode): NodeInsert {
  const now = new Date().toISOString()
  
  const nodeRecord: NodeInsert = {
    id: tanaNode.id,
    name: tanaNode.name,
    content: tanaNode.content,
    doc_type: tanaNode.docType,
    owner_id: tanaNode.ownerId,
    created_at: tanaNode.created.toISOString(),
    node_type: tanaNode.type,
    is_system_node: tanaNode.isSystemNode,
    fields_json: JSON.stringify(tanaNode.fields),
    metadata_json: JSON.stringify({
      children: tanaNode.children,
      references: tanaNode.references,
      parsedAt: now,
    }),
  }
  
  validateNode(nodeRecord)
  return nodeRecord
}

/**
 * Transform database NodeRecord to rich NodeWithRelations format
 */
export function enrichNodeRecord(
  node: NodeRecord, 
  children?: NodeRecord[], 
  parents?: NodeRecord[],
  references?: NodeRecord[],
  referencedBy?: NodeRecord[]
): NodeWithRelations {
  return {
    ...node,
    children,
    parents,
    references,
    referenced_by: referencedBy,
  }
}

/**
 * Core node operations class
 */
export class NodeOperations {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create a new node
   */
  async createNode(nodeData: NodeInsertWithExtras): Promise<NodeRecord> {
    validateNode(nodeData)

    const now = new Date().toISOString()
    const node: NodeInsert = {
      ...nodeData,
      created_at: nodeData.created_at || now,
      updated_at: now,
      fields_json: nodeData.fields_json || JSON.stringify(nodeData.tags ? { tags: nodeData.tags } : {}),
      metadata_json: nodeData.metadata_json || JSON.stringify(nodeData.metadata || {}),
    }

    try {
      const result = this.db.run(`
        INSERT INTO nodes (
          id, name, content, doc_type, owner_id, created_at, updated_at,
          node_type, is_system_node, fields_json, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        node.id,
        node.name,
        node.content,
        node.doc_type,
        node.owner_id,
        node.created_at,
        node.updated_at,
        node.node_type,
        node.is_system_node ? 1 : 0,
        node.fields_json,
        node.metadata_json,
      ])

      if (result.changes === 0) {
        throw new DatabaseError('Failed to create node', 'NO_CHANGES')
      }

      return await this.getNodeById(node.id)
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        throw new ConstraintViolationError('Node ID already exists', node.id)
      }
      throw new DatabaseError(`Failed to create node: ${error.message}`, error.code, undefined, [node.id])
    }
  }

  /**
   * Create multiple nodes in a transaction
   */
  async createNodes(nodesData: NodeInsertWithExtras[]): Promise<NodeRecord[]> {
    if (nodesData.length === 0) return []

    return this.db.transaction((tx) => {
      const createdNodes: NodeRecord[] = []
      const now = new Date().toISOString()

      for (const nodeData of nodesData) {
        validateNode(nodeData)

        const node: NodeInsert = {
          ...nodeData,
          created_at: nodeData.created_at || now,
          updated_at: now,
          fields_json: nodeData.fields_json || JSON.stringify(nodeData.tags ? { tags: nodeData.tags } : {}),
          metadata_json: nodeData.metadata_json || JSON.stringify(nodeData.metadata || {}),
        }

        try {
          const result = tx.run(`
            INSERT INTO nodes (
              id, name, content, doc_type, owner_id, created_at, updated_at,
              node_type, is_system_node, fields_json, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            node.id,
            node.name,
            node.content,
            node.doc_type,
            node.owner_id,
            node.created_at,
            node.updated_at,
            node.node_type,
            node.is_system_node ? 1 : 0,
            node.fields_json,
            node.metadata_json,
          ])

          if (result.changes > 0) {
            const [created] = tx.query<NodeRecord>(QUERY_PATTERNS.GET_NODE_BY_ID, [node.id])
            if (created) {
              createdNodes.push(created)
            }
          }
        } catch (error: any) {
          if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            // Skip duplicate nodes in batch operations
            continue
          }
          throw new DatabaseError(`Failed to create node ${node.id}: ${error.message}`, error.code)
        }
      }

      return createdNodes
    })
  }

  /**
   * Get node by ID
   */
  async getNodeById(id: string): Promise<NodeRecord> {
    if (!id) {
      throw new ConstraintViolationError('Node ID is required')
    }

    const [node] = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_NODE_BY_ID, [id])
    
    if (!node) {
      throw new DatabaseError(`Node not found: ${id}`, 'NODE_NOT_FOUND')
    }

    return node
  }

  /**
   * Get multiple nodes by IDs (optimized batch query)
   */
  async getNodesByIds(ids: string[]): Promise<NodeRecord[]> {
    if (ids.length === 0) return []

    const placeholders = ids.map(() => '?').join(', ')
    const nodes = this.db.query<NodeRecord>(`
      SELECT * FROM nodes 
      WHERE id IN (${placeholders})
    `, ids)

    return nodes
  }

  /**
   * Get node with all relations (children, parents, references)
   */
  async getNodeWithRelations(id: string): Promise<NodeWithRelations> {
    const node = await this.getNodeById(id)

    // Get children
    const children = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_CHILDREN, [id])

    // Get parents  
    const parents = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_PARENTS, [id])

    // Get outgoing references
    const references = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_REFERENCES_FROM, [id])

    // Get incoming references
    const referencedBy = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_REFERENCES_TO, [id])

    return enrichNodeRecord(node, children, parents, references, referencedBy)
  }

  /**
   * Update node by ID
   */
  async updateNode(id: string, updates: NodeUpdate): Promise<NodeRecord> {
    if (!id) {
      throw new ConstraintViolationError('Node ID is required')
    }

    // Validate update data
    validateNode(updates)

    const updateFields = []
    const updateValues = []

    // Build dynamic update query
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at') {
        updateFields.push(`${key} = ?`)
        updateValues.push(value)
      }
    }

    if (updateFields.length === 0) {
      throw new ConstraintViolationError('No valid fields to update')
    }

    // Always update the updated_at timestamp
    updateFields.push('updated_at = ?')
    updateValues.push(new Date().toISOString())
    updateValues.push(id)

    try {
      const result = this.db.run(`
        UPDATE nodes 
        SET ${updateFields.join(', ')} 
        WHERE id = ?
      `, updateValues)

      if (result.changes === 0) {
        throw new DatabaseError(`Node not found for update: ${id}`, 'NODE_NOT_FOUND')
      }

      return await this.getNodeById(id)
    } catch (error: any) {
      throw new DatabaseError(`Failed to update node: ${error.message}`, error.code, undefined, [id])
    }
  }

  /**
   * Update multiple nodes (batch operation)
   */
  async updateNodes(updates: Array<{ id: string; data: NodeUpdate }>): Promise<NodeRecord[]> {
    if (updates.length === 0) return []

    return this.db.transaction((tx) => {
      const updatedNodes: NodeRecord[] = []
      const now = new Date().toISOString()

      for (const { id, data } of updates) {
        validateNode(data)

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

          try {
            const result = tx.run(`
              UPDATE nodes 
              SET ${updateFields.join(', ')} 
              WHERE id = ?
            `, updateValues)

            if (result.changes > 0) {
              const [updated] = tx.query<NodeRecord>(QUERY_PATTERNS.GET_NODE_BY_ID, [id])
              if (updated) {
                updatedNodes.push(updated)
              }
            }
          } catch (error: any) {
            throw new DatabaseError(`Failed to update node ${id}: ${error.message}`, error.code)
          }
        }
      }

      return updatedNodes
    })
  }

  /**
   * Delete node by ID (with cascade options)
   */
  async deleteNode(id: string, cascade: boolean = false): Promise<boolean> {
    if (!id) {
      throw new ConstraintViolationError('Node ID is required')
    }

    return this.db.transaction((tx) => {
      // Check if node exists
      const [node] = tx.query<NodeRecord>(QUERY_PATTERNS.GET_NODE_BY_ID, [id])
      if (!node) {
        throw new DatabaseError(`Node not found: ${id}`, 'NODE_NOT_FOUND')
      }

      if (cascade) {
        // Delete hierarchy relationships
        tx.run('DELETE FROM node_hierarchy WHERE parent_id = ? OR child_id = ?', [id, id])
        
        // Delete reference relationships
        tx.run('DELETE FROM node_references WHERE source_id = ? OR target_id = ?', [id, id])
        
        // Delete node stats
        tx.run('DELETE FROM node_stats WHERE node_id = ?', [id])
        
        // Delete from search index
        tx.run('DELETE FROM node_search WHERE id = ?', [id])
      } else {
        // Check for dependencies
        const [childCount] = tx.query<{ count: number }>('SELECT COUNT(*) as count FROM node_hierarchy WHERE parent_id = ?', [id])
        const [refCount] = tx.query<{ count: number }>('SELECT COUNT(*) as count FROM node_references WHERE target_id = ?', [id])
        
        if (childCount.count > 0 || refCount.count > 0) {
          throw new ConstraintViolationError(`Cannot delete node with dependencies. Use cascade=true to force deletion`, `children: ${childCount.count}, references: ${refCount.count}`)
        }
      }

      // Delete the node
      const result = tx.run('DELETE FROM nodes WHERE id = ?', [id])
      return result.changes > 0
    })
  }

  /**
   * Delete multiple nodes (batch operation)
   */
  async deleteNodes(ids: string[], cascade: boolean = false): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
    if (ids.length === 0) return { deleted: [], failed: [] }

    return this.db.transaction((tx) => {
      const deleted: string[] = []
      const failed: Array<{ id: string; error: string }> = []

      for (const id of ids) {
        try {
          // Check if node exists
          const [node] = tx.query<NodeRecord>(QUERY_PATTERNS.GET_NODE_BY_ID, [id])
          if (!node) {
            failed.push({ id, error: 'Node not found' })
            continue
          }

          if (cascade) {
            // Delete relationships
            tx.run('DELETE FROM node_hierarchy WHERE parent_id = ? OR child_id = ?', [id, id])
            tx.run('DELETE FROM node_references WHERE source_id = ? OR target_id = ?', [id, id])
            tx.run('DELETE FROM node_stats WHERE node_id = ?', [id])
            tx.run('DELETE FROM node_search WHERE id = ?', [id])
          }

          // Delete the node
          const result = tx.run('DELETE FROM nodes WHERE id = ?', [id])
          if (result.changes > 0) {
            deleted.push(id)
          } else {
            failed.push({ id, error: 'Delete failed' })
          }
        } catch (error: any) {
          failed.push({ id, error: error.message })
        }
      }

      return { deleted, failed }
    })
  }

  /**
   * List nodes with filtering and pagination
   */
  async listNodes(
    filter?: FilterOptions,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<NodeRecord>> {
    const conditions: string[] = []
    const params: any[] = []

    // Build WHERE conditions
    if (filter) {
      if (filter.nodeType) {
        if (Array.isArray(filter.nodeType)) {
          const placeholders = filter.nodeType.map(() => '?').join(', ')
          conditions.push(`node_type IN (${placeholders})`)
          params.push(...filter.nodeType)
        } else {
          conditions.push('node_type = ?')
          params.push(filter.nodeType)
        }
      }

      if (filter.ownerIds) {
        const placeholders = filter.ownerIds.map(() => '?').join(', ')
        conditions.push(`owner_id IN (${placeholders})`)
        params.push(...filter.ownerIds)
      }

      if (filter.createdAfter) {
        conditions.push('created_at >= ?')
        params.push(filter.createdAfter.toISOString())
      }

      if (filter.createdBefore) {
        conditions.push('created_at <= ?')
        params.push(filter.createdBefore.toISOString())
      }

      if (filter.isSystemNode !== undefined) {
        conditions.push('is_system_node = ?')
        params.push(filter.isSystemNode ? 1 : 0)
      }

      if (filter.hasChildren !== undefined) {
        if (filter.hasChildren) {
          conditions.push('id IN (SELECT DISTINCT parent_id FROM node_hierarchy)')
        } else {
          conditions.push('id NOT IN (SELECT DISTINCT parent_id FROM node_hierarchy)')
        }
      }

      if (filter.hasReferences !== undefined) {
        if (filter.hasReferences) {
          conditions.push('id IN (SELECT DISTINCT source_id FROM node_references)')
        } else {
          conditions.push('id NOT IN (SELECT DISTINCT source_id FROM node_references)')
        }
      }
    }

    // Count total items
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const [countResult] = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM nodes ${whereClause}
    `, params)
    const totalItems = countResult.count

    // Build main query with pagination
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? 50
    const sortBy = pagination?.sortBy ?? 'created_at'
    const sortDirection = pagination?.sortDirection ?? 'DESC'
    
    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ['id', 'name', 'content', 'created_at', 'updated_at', 'node_type']
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at'
    
    // Validate sortDirection to prevent SQL injection
    const safeSortDirection = sortDirection === 'ASC' ? 'ASC' : 'DESC'
    
    const offset = (page - 1) * pageSize
    const orderBy = `ORDER BY ${safeSortBy} ${safeSortDirection}`
    const limitClause = `LIMIT ${pageSize} OFFSET ${offset}`

    const data = this.db.query<NodeRecord>(`
      SELECT * FROM nodes 
      ${whereClause} 
      ${orderBy} 
      ${limitClause}
    `, params)

    const totalPages = Math.ceil(totalItems / pageSize)

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    }
  }

  /**
   * Check if node exists
   */
  async nodeExists(id: string): Promise<boolean> {
    const [result] = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM nodes WHERE id = ?', [id])
    return result.count > 0
  }

  /**
   * Get node count with optional filtering
   */
  async getNodeCount(filter?: FilterOptions): Promise<number> {
    const conditions: string[] = []
    const params: any[] = []

    if (filter) {
      if (filter.nodeType) {
        conditions.push('node_type = ?')
        params.push(filter.nodeType)
      }
      if (filter.isSystemNode !== undefined) {
        conditions.push('is_system_node = ?')
        params.push(filter.isSystemNode ? 1 : 0)
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const [result] = this.db.query<{ count: number }>(`SELECT COUNT(*) as count FROM nodes ${whereClause}`, params)
    
    return result.count
  }

  /**
   * Get nodes by name pattern (for autocomplete/search)
   */
  async findNodesByName(pattern: string, limit: number = 10): Promise<NodeRecord[]> {
    return this.db.query<NodeRecord>(`
      SELECT * FROM nodes 
      WHERE name LIKE ? 
      AND is_system_node = 0
      ORDER BY 
        CASE WHEN name = ? THEN 0 ELSE 1 END,
        LENGTH(name),
        name
      LIMIT ?
    `, [`%${pattern}%`, pattern, limit])
  }
}

/**
 * Create node operations instance
 */
export function createNodeOperations(db: DatabaseConnection): NodeOperations {
  return new NodeOperations(db)
}

/**
 * Convenience function for common node operations
 */
export const nodeUtils = {
  /**
   * Clone node with new ID
   */
  async cloneNode(
    operations: NodeOperations, 
    sourceId: string, 
    newId: string, 
    modifications?: Partial<NodeUpdate>
  ): Promise<NodeRecord> {
    const source = await operations.getNodeById(sourceId)
    
    const clonedData: NodeInsert = {
      ...source,
      id: newId,
      name: modifications?.name ?? `${source.name} (Copy)`,
      ...modifications,
    }
    
    return operations.createNode(clonedData)
  },

  /**
   * Archive node (mark as archived without deletion)
   */
  async archiveNode(operations: NodeOperations, id: string): Promise<NodeRecord> {
    const metadata = JSON.parse((await operations.getNodeById(id)).metadata_json)
    metadata.archived = true
    metadata.archivedAt = new Date().toISOString()
    
    return operations.updateNode(id, {
      metadata_json: JSON.stringify(metadata)
    })
  },

  /**
   * Restore archived node
   */
  async restoreNode(operations: NodeOperations, id: string): Promise<NodeRecord> {
    const metadata = JSON.parse((await operations.getNodeById(id)).metadata_json)
    delete metadata.archived
    delete metadata.archivedAt
    
    return operations.updateNode(id, {
      metadata_json: JSON.stringify(metadata)
    })
  },
}