/**
 * Hierarchy and edge operations for Tana graph database
 * 
 * This module manages parent-child relationships and hierarchical structures
 * with optimized operations for large graph traversals and reordering.
 */

import type { 
  DatabaseConnection, 
  DatabaseTransaction,
  NodeRecord,
  NodeHierarchyRecord,
  HierarchyInsert,
  NodeHierarchyPath,
  FilterOptions
} from '../types/index.js'
import { DatabaseError, ConstraintViolationError } from '../types/database-types.js'
import { QUERY_PATTERNS, DB_CONSTRAINTS } from '../types/schema.js'

/**
 * Edge operations for managing hierarchical relationships
 */
export class EdgeOperations {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create a parent-child relationship
   */
  async createEdge(parentId: string, childId: string, position?: number): Promise<NodeHierarchyRecord> {
    if (!parentId || !childId) {
      throw new ConstraintViolationError('Both parent and child IDs are required')
    }

    if (parentId === childId) {
      throw new ConstraintViolationError('Node cannot be its own parent')
    }

    // Check for circular references
    if (await this.wouldCreateCircularReference(parentId, childId)) {
      throw new ConstraintViolationError('Operation would create circular reference')
    }

    return this.db.transaction((tx) => {
      // Check if relationship already exists
      const [existing] = tx.query<NodeHierarchyRecord>(`
        SELECT * FROM node_hierarchy 
        WHERE parent_id = ? AND child_id = ?
      `, [parentId, childId])

      if (existing) {
        throw new ConstraintViolationError('Relationship already exists')
      }

      // Determine position
      let finalPosition = position
      if (finalPosition === undefined) {
        // Get max position for this parent
        const [maxPos] = tx.query<{ max_pos: number | null }>(`
          SELECT MAX(position) as max_pos 
          FROM node_hierarchy 
          WHERE parent_id = ?
        `, [parentId])
        finalPosition = (maxPos.max_pos ?? -1) + 1
      } else {
        // Shift existing positions if needed
        tx.run(`
          UPDATE node_hierarchy 
          SET position = position + 1 
          WHERE parent_id = ? AND position >= ?
        `, [parentId, finalPosition])
      }

      // Create the relationship
      const edgeData: HierarchyInsert = {
        parent_id: parentId,
        child_id: childId,
        position: finalPosition,
      }

      const result = tx.run(`
        INSERT INTO node_hierarchy (id, parent_id, child_id, position, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [
        `edge_${parentId}_${childId}_${Date.now()}`,
        edgeData.parent_id,
        edgeData.child_id,
        edgeData.position,
        new Date().toISOString(),
      ])

      if (result.changes === 0) {
        throw new DatabaseError('Failed to create edge')
      }

      // Return the created relationship
      const [created] = tx.query<NodeHierarchyRecord>(`
        SELECT * FROM node_hierarchy 
        WHERE parent_id = ? AND child_id = ?
      `, [parentId, childId])

      return created
    })
  }

  /**
   * Create multiple edges in batch
   */
  async createEdges(edges: Array<{ parentId: string; childId: string; position?: number }>): Promise<NodeHierarchyRecord[]> {
    if (edges.length === 0) return []

    return this.db.transaction((tx) => {
      const created: NodeHierarchyRecord[] = []

      for (const edge of edges) {
        try {
          // Validate
          if (!edge.parentId || !edge.childId) {
            continue
          }

          if (edge.parentId === edge.childId) {
            continue
          }

          // Check if relationship already exists
          const [existing] = tx.query<NodeHierarchyRecord>(`
            SELECT * FROM node_hierarchy 
            WHERE parent_id = ? AND child_id = ?
          `, [edge.parentId, edge.childId])

          if (existing) {
            continue
          }

          // Determine position
          let position = edge.position
          if (position === undefined) {
            const [maxPos] = tx.query<{ max_pos: number | null }>(`
              SELECT MAX(position) as max_pos 
              FROM node_hierarchy 
              WHERE parent_id = ?
            `, [edge.parentId])
            position = (maxPos.max_pos ?? -1) + 1
          }

          // Create the relationship
          const result = tx.run(`
            INSERT INTO node_hierarchy (id, parent_id, child_id, position, created_at)
            VALUES (?, ?, ?, ?, ?)
          `, [
            `edge_${edge.parentId}_${edge.childId}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            edge.parentId,
            edge.childId,
            position,
            new Date().toISOString(),
          ])

          if (result.changes > 0) {
            const [newEdge] = tx.query<NodeHierarchyRecord>(`
              SELECT * FROM node_hierarchy 
              WHERE parent_id = ? AND child_id = ?
            `, [edge.parentId, edge.childId])
            
            if (newEdge) {
              created.push(newEdge)
            }
          }
        } catch (error) {
          // Skip invalid edges in batch operations
          continue
        }
      }

      return created
    })
  }

  /**
   * Remove a parent-child relationship
   */
  async removeEdge(parentId: string, childId: string): Promise<boolean> {
    if (!parentId || !childId) {
      throw new ConstraintViolationError('Both parent and child IDs are required')
    }

    return this.db.transaction((tx) => {
      // Get the edge to be removed
      const [edge] = tx.query<NodeHierarchyRecord>(`
        SELECT * FROM node_hierarchy 
        WHERE parent_id = ? AND child_id = ?
      `, [parentId, childId])

      if (!edge) {
        return false
      }

      // Remove the edge
      const result = tx.run(`
        DELETE FROM node_hierarchy 
        WHERE parent_id = ? AND child_id = ?
      `, [parentId, childId])

      if (result.changes > 0) {
        // Reorder remaining children to fill the gap
        tx.run(`
          UPDATE node_hierarchy 
          SET position = position - 1 
          WHERE parent_id = ? AND position > ?
        `, [parentId, edge.position])
        
        return true
      }

      return false
    })
  }

  /**
   * Remove all edges for a node (as parent or child)
   */
  async removeAllEdges(nodeId: string): Promise<{ removedAsParent: number; removedAsChild: number }> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    return this.db.transaction((tx) => {
      const removedAsParent = tx.run('DELETE FROM node_hierarchy WHERE parent_id = ?', [nodeId])
      const removedAsChild = tx.run('DELETE FROM node_hierarchy WHERE child_id = ?', [nodeId])

      return {
        removedAsParent: removedAsParent.changes,
        removedAsChild: removedAsChild.changes,
      }
    })
  }

  /**
   * Reorder children of a parent
   */
  async reorderChildren(parentId: string, childOrder: string[]): Promise<NodeHierarchyRecord[]> {
    if (!parentId) {
      throw new ConstraintViolationError('Parent ID is required')
    }

    return this.db.transaction((tx) => {
      // Verify all children belong to this parent
      const existingChildren = tx.query<NodeHierarchyRecord>(`
        SELECT * FROM node_hierarchy 
        WHERE parent_id = ?
        ORDER BY position
      `, [parentId])

      const existingIds = new Set(existingChildren.map(c => c.child_id))
      const providedIds = new Set(childOrder)

      // Check for mismatches
      for (const id of childOrder) {
        if (!existingIds.has(id)) {
          throw new ConstraintViolationError(`Child ${id} does not belong to parent ${parentId}`)
        }
      }

      // Update positions
      const updated: NodeHierarchyRecord[] = []
      for (let i = 0; i < childOrder.length; i++) {
        const childId = childOrder[i]
        const result = tx.run(`
          UPDATE node_hierarchy 
          SET position = ? 
          WHERE parent_id = ? AND child_id = ?
        `, [i, parentId, childId])

        if (result.changes > 0) {
          const [updated_edge] = tx.query<NodeHierarchyRecord>(`
            SELECT * FROM node_hierarchy 
            WHERE parent_id = ? AND child_id = ?
          `, [parentId, childId])
          
          if (updated_edge) {
            updated.push(updated_edge)
          }
        }
      }

      return updated.sort((a, b) => a.position - b.position)
    })
  }

  /**
   * Move a node to a new parent with optional position
   */
  async moveNode(childId: string, newParentId: string, position?: number): Promise<NodeHierarchyRecord> {
    if (!childId || !newParentId) {
      throw new ConstraintViolationError('Both child and new parent IDs are required')
    }

    if (childId === newParentId) {
      throw new ConstraintViolationError('Node cannot be its own parent')
    }

    // Check for circular references
    if (await this.wouldCreateCircularReference(newParentId, childId)) {
      throw new ConstraintViolationError('Move would create circular reference')
    }

    return this.db.transaction((tx) => {
      // Remove from old parent(s)
      const oldParents = tx.query<NodeHierarchyRecord>(`
        SELECT * FROM node_hierarchy WHERE child_id = ?
      `, [childId])

      for (const oldParent of oldParents) {
        tx.run('DELETE FROM node_hierarchy WHERE parent_id = ? AND child_id = ?', [oldParent.parent_id, childId])
        
        // Reorder siblings
        tx.run(`
          UPDATE node_hierarchy 
          SET position = position - 1 
          WHERE parent_id = ? AND position > ?
        `, [oldParent.parent_id, oldParent.position])
      }

      // Add to new parent
      let finalPosition = position
      if (finalPosition === undefined) {
        const [maxPos] = tx.query<{ max_pos: number | null }>(`
          SELECT MAX(position) as max_pos 
          FROM node_hierarchy 
          WHERE parent_id = ?
        `, [newParentId])
        finalPosition = (maxPos.max_pos ?? -1) + 1
      } else {
        // Shift existing children
        tx.run(`
          UPDATE node_hierarchy 
          SET position = position + 1 
          WHERE parent_id = ? AND position >= ?
        `, [newParentId, finalPosition])
      }

      // Create new relationship
      const result = tx.run(`
        INSERT INTO node_hierarchy (id, parent_id, child_id, position, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [
        `edge_${newParentId}_${childId}_${Date.now()}`,
        newParentId,
        childId,
        finalPosition,
        new Date().toISOString(),
      ])

      if (result.changes === 0) {
        throw new DatabaseError('Failed to move node')
      }

      const [newEdge] = tx.query<NodeHierarchyRecord>(`
        SELECT * FROM node_hierarchy 
        WHERE parent_id = ? AND child_id = ?
      `, [newParentId, childId])

      return newEdge
    })
  }

  /**
   * Get children of a node with optional filtering
   */
  async getChildren(parentId: string, includeSystemNodes: boolean = false): Promise<NodeRecord[]> {
    if (!parentId) {
      throw new ConstraintViolationError('Parent ID is required')
    }

    const systemFilter = includeSystemNodes ? '' : 'AND n.is_system_node = 0'
    
    return this.db.query<NodeRecord>(`
      SELECT n.* FROM nodes n 
      JOIN node_hierarchy h ON n.id = h.child_id 
      WHERE h.parent_id = ? ${systemFilter}
      ORDER BY h.position ASC
    `, [parentId])
  }

  /**
   * Get parents of a node
   */
  async getParents(childId: string): Promise<NodeRecord[]> {
    if (!childId) {
      throw new ConstraintViolationError('Child ID is required')
    }

    return this.db.query<NodeRecord>(QUERY_PATTERNS.GET_PARENTS, [childId])
  }

  /**
   * Get all root nodes (nodes with no parents)
   */
  async getRootNodes(includeSystemNodes: boolean = false): Promise<NodeRecord[]> {
    const systemFilter = includeSystemNodes ? '' : 'WHERE is_system_node = 0'
    
    return this.db.query<NodeRecord>(`
      SELECT * FROM nodes 
      WHERE id NOT IN (SELECT DISTINCT child_id FROM node_hierarchy)
      ${systemFilter}
      ORDER BY created_at DESC
    `)
  }

  /**
   * Get all leaf nodes (nodes with no children)
   */
  async getLeafNodes(includeSystemNodes: boolean = false): Promise<NodeRecord[]> {
    const systemFilter = includeSystemNodes ? '' : 'WHERE is_system_node = 0'
    
    return this.db.query<NodeRecord>(`
      SELECT * FROM nodes 
      WHERE id NOT IN (SELECT DISTINCT parent_id FROM node_hierarchy)
      ${systemFilter}
      ORDER BY created_at DESC
    `)
  }

  /**
   * Get node depth (distance from root)
   */
  async getNodeDepth(nodeId: string): Promise<number> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    const [result] = this.db.query<{ depth: number }>(`
      WITH RECURSIVE ancestors(id, parent_id, depth) AS (
        SELECT child_id, parent_id, 0 FROM node_hierarchy WHERE child_id = ?
        UNION ALL
        SELECT h.child_id, h.parent_id, depth + 1 
        FROM node_hierarchy h
        JOIN ancestors a ON h.child_id = a.parent_id
        WHERE depth < 100
      )
      SELECT MAX(depth) as depth FROM ancestors
    `, [nodeId])

    return result?.depth ?? 0
  }

  /**
   * Get path from root to node
   */
  async getNodePath(nodeId: string): Promise<NodeHierarchyPath | null> {
    if (!nodeId) {
      throw new ConstraintViolationError('Node ID is required')
    }

    const ancestors = this.db.query<{ id: string; parent_id: string | null; depth: number }>(`
      WITH RECURSIVE ancestors(id, parent_id, depth) AS (
        SELECT child_id, parent_id, 0 FROM node_hierarchy WHERE child_id = ?
        UNION ALL
        SELECT h.child_id, h.parent_id, depth + 1 
        FROM node_hierarchy h
        JOIN ancestors a ON h.child_id = a.parent_id
        WHERE depth < 100
      )
      SELECT id, parent_id, depth FROM ancestors
      ORDER BY depth DESC
    `, [nodeId])

    if (ancestors.length === 0) {
      return null
    }

    const path = ancestors
      .filter(a => a.parent_id !== null)
      .map(a => a.parent_id!)
      .reverse()

    return {
      node_id: nodeId,
      path,
      depth: ancestors[0]?.depth ?? 0,
    }
  }

  /**
   * Check if creating an edge would create a circular reference
   */
  async wouldCreateCircularReference(parentId: string, childId: string): Promise<boolean> {
    if (parentId === childId) return true

    // Check if parentId is already a descendant of childId
    const descendants = this.db.query<{ id: string }>(`
      WITH RECURSIVE descendants(id) AS (
        SELECT child_id FROM node_hierarchy WHERE parent_id = ?
        UNION ALL
        SELECT h.child_id 
        FROM node_hierarchy h
        JOIN descendants d ON h.parent_id = d.id
      )
      SELECT id FROM descendants
    `, [childId])

    return descendants.some(d => d.id === parentId)
  }

  /**
   * Get hierarchy statistics
   */
  async getHierarchyStats(): Promise<{
    totalEdges: number
    maxDepth: number
    rootNodes: number
    leafNodes: number
    avgChildrenPerNode: number
    orphanedNodes: number
  }> {
    const [totalEdges] = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM node_hierarchy')
    
    const [maxDepthResult] = this.db.query<{ max_depth: number | null }>(`
      WITH RECURSIVE depths(id, depth) AS (
        SELECT parent_id, 0 FROM node_hierarchy WHERE parent_id NOT IN (SELECT child_id FROM node_hierarchy)
        UNION ALL
        SELECT h.child_id, depth + 1 
        FROM node_hierarchy h
        JOIN depths d ON h.parent_id = d.id
        WHERE depth < 100
      )
      SELECT MAX(depth) as max_depth FROM depths
    `)

    const [rootNodes] = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM nodes 
      WHERE id NOT IN (SELECT DISTINCT child_id FROM node_hierarchy)
    `)

    const [leafNodes] = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM nodes 
      WHERE id NOT IN (SELECT DISTINCT parent_id FROM node_hierarchy)
    `)

    const [avgChildren] = this.db.query<{ avg: number | null }>(`
      SELECT AVG(child_count) as avg FROM (
        SELECT COUNT(*) as child_count 
        FROM node_hierarchy 
        GROUP BY parent_id
      )
    `)

    const [totalNodes] = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM nodes')
    const nodesWithEdges = this.db.query<{ id: string }>(`
      SELECT DISTINCT id FROM nodes 
      WHERE id IN (SELECT parent_id FROM node_hierarchy) 
      OR id IN (SELECT child_id FROM node_hierarchy)
    `)

    return {
      totalEdges: totalEdges.count,
      maxDepth: maxDepthResult.max_depth ?? 0,
      rootNodes: rootNodes.count,
      leafNodes: leafNodes.count,
      avgChildrenPerNode: avgChildren.avg ?? 0,
      orphanedNodes: totalNodes.count - nodesWithEdges.length,
    }
  }

  /**
   * Detect and fix hierarchy inconsistencies
   */
  async validateAndFixHierarchy(): Promise<{
    circularReferences: string[]
    orphanedEdges: string[]
    duplicateEdges: string[]
    fixedCount: number
  }> {
    return this.db.transaction((tx) => {
      const issues = {
        circularReferences: [] as string[],
        orphanedEdges: [] as string[],
        duplicateEdges: [] as string[],
        fixedCount: 0,
      }

      // Find orphaned edges (pointing to non-existent nodes)
      const orphanedEdges = tx.query<{ id: string; parent_id: string; child_id: string }>(`
        SELECT h.id, h.parent_id, h.child_id
        FROM node_hierarchy h
        LEFT JOIN nodes p ON h.parent_id = p.id
        LEFT JOIN nodes c ON h.child_id = c.id
        WHERE p.id IS NULL OR c.id IS NULL
      `)

      for (const edge of orphanedEdges) {
        issues.orphanedEdges.push(`${edge.parent_id} -> ${edge.child_id}`)
        tx.run('DELETE FROM node_hierarchy WHERE id = ?', [edge.id])
        issues.fixedCount++
      }

      // Find duplicate edges
      const duplicateEdges = tx.query<{ parent_id: string; child_id: string; count: number }>(`
        SELECT parent_id, child_id, COUNT(*) as count
        FROM node_hierarchy
        GROUP BY parent_id, child_id
        HAVING COUNT(*) > 1
      `)

      for (const dup of duplicateEdges) {
        issues.duplicateEdges.push(`${dup.parent_id} -> ${dup.child_id}`)
        
        // Keep the first one, delete the rest
        const edges = tx.query<{ id: string }>(`
          SELECT id FROM node_hierarchy 
          WHERE parent_id = ? AND child_id = ?
          ORDER BY created_at
        `, [dup.parent_id, dup.child_id])

        for (let i = 1; i < edges.length; i++) {
          tx.run('DELETE FROM node_hierarchy WHERE id = ?', [edges[i].id])
          issues.fixedCount++
        }
      }

      // TODO: Detect circular references (more complex - would need recursive checking)
      // For now, we rely on the wouldCreateCircularReference check during creation

      return issues
    })
  }
}

/**
 * Create edge operations instance
 */
export function createEdgeOperations(db: DatabaseConnection): EdgeOperations {
  return new EdgeOperations(db)
}

/**
 * Utility functions for hierarchy operations
 */
export const hierarchyUtils = {
  /**
   * Build tree structure from flat node list
   */
  buildTree(nodes: NodeRecord[], edges: NodeHierarchyRecord[]): Array<NodeRecord & { children: any[] }> {
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n, children: [] }]))
    const rootNodes: Array<NodeRecord & { children: any[] }> = []

    // Build parent-child relationships
    for (const edge of edges.sort((a, b) => a.position - b.position)) {
      const parent = nodeMap.get(edge.parent_id)
      const child = nodeMap.get(edge.child_id)
      
      if (parent && child) {
        parent.children.push(child)
      }
    }

    // Find root nodes
    const childIds = new Set(edges.map(e => e.child_id))
    for (const node of nodeMap.values()) {
      if (!childIds.has(node.id)) {
        rootNodes.push(node)
      }
    }

    return rootNodes
  },

  /**
   * Flatten tree structure back to nodes and edges
   */
  flattenTree(tree: Array<NodeRecord & { children: any[] }>): { nodes: NodeRecord[]; edges: HierarchyInsert[] } {
    const nodes: NodeRecord[] = []
    const edges: HierarchyInsert[] = []

    function traverse(nodeWithChildren: NodeRecord & { children: any[] }, parentId?: string, position?: number) {
      const { children, ...node } = nodeWithChildren
      nodes.push(node)

      if (parentId) {
        edges.push({
          parent_id: parentId,
          child_id: node.id,
          position: position ?? 0,
        })
      }

      children.forEach((child, index) => {
        traverse(child, node.id, index)
      })
    }

    tree.forEach(root => traverse(root))
    return { nodes, edges }
  },

  /**
   * Calculate hierarchy metrics for a subtree
   */
  calculateSubtreeMetrics(rootId: string, edges: NodeHierarchyRecord[]): {
    totalNodes: number
    maxDepth: number
    avgBranching: number
  } {
    const childMap = new Map<string, string[]>()
    
    // Build children map
    for (const edge of edges) {
      if (!childMap.has(edge.parent_id)) {
        childMap.set(edge.parent_id, [])
      }
      childMap.get(edge.parent_id)!.push(edge.child_id)
    }

    let totalNodes = 0
    let maxDepth = 0
    const branchingFactors: number[] = []

    function traverse(nodeId: string, depth: number) {
      totalNodes++
      maxDepth = Math.max(maxDepth, depth)
      
      const children = childMap.get(nodeId) || []
      if (children.length > 0) {
        branchingFactors.push(children.length)
        children.forEach(childId => traverse(childId, depth + 1))
      }
    }

    traverse(rootId, 0)

    const avgBranching = branchingFactors.length > 0 
      ? branchingFactors.reduce((a, b) => a + b, 0) / branchingFactors.length 
      : 0

    return { totalNodes, maxDepth, avgBranching }
  },
}