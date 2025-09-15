#!/usr/bin/env bun
/**
 * Edge Operations Tests
 * 
 * Tests for hierarchy edge operations including parent-child relationships,
 * tree traversal, validation, and integrity maintenance.
 */

import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { dbUtils } from '../../../server/src/database/index.js'
import { createNodeOperations } from '../../../server/src/database/operations/nodes.js'
import { createEdgeOperations } from '../../../server/src/database/operations/edges.js'
import type { DatabaseConnection, NodeInsert, HierarchyInsert } from '../../../server/src/database/types/index.js'

describe('Edge Operations', () => {
  let connection: DatabaseConnection
  let nodeOps: ReturnType<typeof createNodeOperations>
  let edgeOps: ReturnType<typeof createEdgeOperations>

  beforeEach(async () => {
    connection = await dbUtils.createTestConnection()
    nodeOps = createNodeOperations(connection)
    edgeOps = createEdgeOperations(connection)

    // Create test nodes for hierarchy tests
    const testNodes: NodeInsert[] = [
      { id: 'root-1', name: 'Root Node 1', content: 'Root content', node_type: 'folder', is_system_node: false },
      { id: 'root-2', name: 'Root Node 2', content: 'Root content', node_type: 'folder', is_system_node: false },
      { id: 'child-1', name: 'Child Node 1', content: 'Child content', node_type: 'note', is_system_node: false },
      { id: 'child-2', name: 'Child Node 2', content: 'Child content', node_type: 'note', is_system_node: false },
      { id: 'child-3', name: 'Child Node 3', content: 'Child content', node_type: 'note', is_system_node: false },
      { id: 'grandchild-1', name: 'Grandchild Node 1', content: 'Grandchild content', node_type: 'note', is_system_node: false },
      { id: 'grandchild-2', name: 'Grandchild Node 2', content: 'Grandchild content', node_type: 'note', is_system_node: false }
    ]

    await nodeOps.createNodes(testNodes)
  })

  afterEach(async () => {
    if (connection) {
      await connection.close()
    }
  })

  describe('Hierarchy Creation', () => {
    test('should create parent-child relationship successfully', async () => {
      const hierarchyData: HierarchyInsert = {
        parent_id: 'root-1',
        child_id: 'child-1',
        position: 0
      }

      const result = await edgeOps.createHierarchyEdge(hierarchyData)
      expect(result.success).toBe(true)
      expect(result.edge).toBeDefined()
      expect(result.edge?.parent_id).toBe('root-1')
      expect(result.edge?.child_id).toBe('child-1')
      expect(result.edge?.position).toBe(0)
    })

    test('should create multiple hierarchy edges in batch', async () => {
      const hierarchies: HierarchyInsert[] = [
        { parent_id: 'root-1', child_id: 'child-1', position: 0 },
        { parent_id: 'root-1', child_id: 'child-2', position: 1 },
        { parent_id: 'child-1', child_id: 'grandchild-1', position: 0 }
      ]

      const result = await edgeOps.createHierarchyEdges(hierarchies)
      expect(result.success).toBe(true)
      expect(result.created).toBe(3)
      expect(result.edges).toHaveLength(3)
    })

    test('should handle duplicate hierarchy edges gracefully', async () => {
      const hierarchyData: HierarchyInsert = {
        parent_id: 'root-1',
        child_id: 'child-1',
        position: 0
      }

      // Create first edge
      const result1 = await edgeOps.createHierarchyEdge(hierarchyData)
      expect(result1.success).toBe(true)

      // Try to create duplicate
      const result2 = await edgeOps.createHierarchyEdge(hierarchyData)
      expect(result2.success).toBe(false)
      expect(result2.error).toContain('already exists')
    })

    test('should prevent circular references', async () => {
      // Create initial hierarchy
      await edgeOps.createHierarchyEdge({ parent_id: 'root-1', child_id: 'child-1', position: 0 })
      await edgeOps.createHierarchyEdge({ parent_id: 'child-1', child_id: 'grandchild-1', position: 0 })

      // Try to create circular reference
      const result = await edgeOps.createHierarchyEdge({ parent_id: 'grandchild-1', child_id: 'root-1', position: 0 })
      expect(result.success).toBe(false)
      expect(result.error).toContain('circular')
    })

    test('should prevent self-referencing edges', async () => {
      const result = await edgeOps.createHierarchyEdge({ parent_id: 'root-1', child_id: 'root-1', position: 0 })
      expect(result.success).toBe(false)
      expect(result.error).toContain('self-reference')
    })

    test('should auto-assign positions when not specified', async () => {
      // Create edges without explicit positions
      await edgeOps.createHierarchyEdge({ parent_id: 'root-1', child_id: 'child-1' })
      await edgeOps.createHierarchyEdge({ parent_id: 'root-1', child_id: 'child-2' })
      await edgeOps.createHierarchyEdge({ parent_id: 'root-1', child_id: 'child-3' })

      const children = await edgeOps.getChildren('root-1')
      expect(children).toHaveLength(3)
      
      // Should have sequential positions
      const positions = children.map(c => c.position).sort()
      expect(positions).toEqual([0, 1, 2])
    })
  })

  describe('Hierarchy Retrieval', () => {
    beforeEach(async () => {
      // Setup test hierarchy
      const hierarchies: HierarchyInsert[] = [
        { parent_id: 'root-1', child_id: 'child-1', position: 0 },
        { parent_id: 'root-1', child_id: 'child-2', position: 1 },
        { parent_id: 'root-2', child_id: 'child-3', position: 0 },
        { parent_id: 'child-1', child_id: 'grandchild-1', position: 0 },
        { parent_id: 'child-1', child_id: 'grandchild-2', position: 1 }
      ]
      await edgeOps.createHierarchyEdges(hierarchies)
    })

    test('should get children of a parent node', async () => {
      const children = await edgeOps.getChildren('root-1')
      expect(children).toHaveLength(2)
      expect(children.map(c => c.child_id)).toContain('child-1')
      expect(children.map(c => c.child_id)).toContain('child-2')
      
      // Should be ordered by position
      expect(children[0].position).toBeLessThan(children[1].position)
    })

    test('should get parent of a child node', async () => {
      const parent = await edgeOps.getParent('child-1')
      expect(parent).toBeDefined()
      expect(parent?.parent_id).toBe('root-1')
    })

    test('should get all descendants of a node', async () => {
      const descendants = await edgeOps.getDescendants('root-1')
      expect(descendants.length).toBeGreaterThanOrEqual(4) // child-1, child-2, grandchild-1, grandchild-2

      const descendantIds = descendants.map(d => d.id)
      expect(descendantIds).toContain('child-1')
      expect(descendantIds).toContain('child-2')
      expect(descendantIds).toContain('grandchild-1')
      expect(descendantIds).toContain('grandchild-2')
    })

    test('should get all ancestors of a node', async () => {
      const ancestors = await edgeOps.getAncestors('grandchild-1')
      expect(ancestors.length).toBeGreaterThanOrEqual(2) // child-1, root-1

      const ancestorIds = ancestors.map(a => a.id)
      expect(ancestorIds).toContain('child-1')
      expect(ancestorIds).toContain('root-1')
    })

    test('should get root nodes (nodes with no parents)', async () => {
      const roots = await edgeOps.getRootNodes()
      expect(roots.length).toBeGreaterThanOrEqual(2)
      
      const rootIds = roots.map(r => r.id)
      expect(rootIds).toContain('root-1')
      expect(rootIds).toContain('root-2')
    })

    test('should get leaf nodes (nodes with no children)', async () => {
      const leaves = await edgeOps.getLeafNodes()
      expect(leaves.length).toBeGreaterThanOrEqual(3)
      
      const leafIds = leaves.map(l => l.id)
      expect(leafIds).toContain('child-2')
      expect(leafIds).toContain('child-3')
      expect(leafIds).toContain('grandchild-1')
      expect(leafIds).toContain('grandchild-2')
    })

    test('should get siblings of a node', async () => {
      const siblings = await edgeOps.getSiblings('child-1')
      expect(siblings).toHaveLength(1)
      expect(siblings[0].id).toBe('child-2')

      const grandchildSiblings = await edgeOps.getSiblings('grandchild-1')
      expect(grandchildSiblings).toHaveLength(1)
      expect(grandchildSiblings[0].id).toBe('grandchild-2')
    })

    test('should calculate node depth in hierarchy', async () => {
      const rootDepth = await edgeOps.getNodeDepth('root-1')
      expect(rootDepth).toBe(0)

      const childDepth = await edgeOps.getNodeDepth('child-1')
      expect(childDepth).toBe(1)

      const grandchildDepth = await edgeOps.getNodeDepth('grandchild-1')
      expect(grandchildDepth).toBe(2)
    })

    test('should get subtree starting from a node', async () => {
      const subtree = await edgeOps.getSubtree('root-1')
      expect(subtree.nodes.length).toBeGreaterThanOrEqual(5) // root-1 + 4 descendants
      expect(subtree.edges.length).toBeGreaterThanOrEqual(4) // 4 hierarchy edges

      // Root should be included
      expect(subtree.nodes.map(n => n.id)).toContain('root-1')
    })
  })

  describe('Hierarchy Updates', () => {
    beforeEach(async () => {
      const hierarchies: HierarchyInsert[] = [
        { parent_id: 'root-1', child_id: 'child-1', position: 0 },
        { parent_id: 'root-1', child_id: 'child-2', position: 1 },
        { parent_id: 'child-1', child_id: 'grandchild-1', position: 0 }
      ]
      await edgeOps.createHierarchyEdges(hierarchies)
    })

    test('should move node to different parent', async () => {
      const result = await edgeOps.moveNode('child-1', 'root-2')
      expect(result.success).toBe(true)

      // Verify new parent
      const parent = await edgeOps.getParent('child-1')
      expect(parent?.parent_id).toBe('root-2')

      // Verify grandchild moved with parent
      const grandchildParent = await edgeOps.getParent('grandchild-1')
      expect(grandchildParent?.parent_id).toBe('child-1')
    })

    test('should reorder children positions', async () => {
      const result = await edgeOps.reorderChildren('root-1', ['child-2', 'child-1'])
      expect(result.success).toBe(true)

      const children = await edgeOps.getChildren('root-1')
      expect(children[0].child_id).toBe('child-2')
      expect(children[1].child_id).toBe('child-1')
      expect(children[0].position).toBe(0)
      expect(children[1].position).toBe(1)
    })

    test('should update hierarchy edge position', async () => {
      const edge = await edgeOps.getHierarchyEdge('root-1', 'child-1')
      expect(edge).toBeDefined()

      const result = await edgeOps.updateHierarchyEdge(edge!.id, { position: 5 })
      expect(result.success).toBe(true)
      expect(result.edge?.position).toBe(5)
    })

    test('should prevent moving node to create circular reference', async () => {
      const result = await edgeOps.moveNode('root-1', 'child-1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('circular')
    })

    test('should handle moving to same parent gracefully', async () => {
      const result = await edgeOps.moveNode('child-1', 'root-1')
      expect(result.success).toBe(true) // Should succeed but not change anything

      const parent = await edgeOps.getParent('child-1')
      expect(parent?.parent_id).toBe('root-1')
    })
  })

  describe('Hierarchy Deletion', () => {
    beforeEach(async () => {
      const hierarchies: HierarchyInsert[] = [
        { parent_id: 'root-1', child_id: 'child-1', position: 0 },
        { parent_id: 'root-1', child_id: 'child-2', position: 1 },
        { parent_id: 'child-1', child_id: 'grandchild-1', position: 0 },
        { parent_id: 'child-1', child_id: 'grandchild-2', position: 1 }
      ]
      await edgeOps.createHierarchyEdges(hierarchies)
    })

    test('should delete single hierarchy edge', async () => {
      const edge = await edgeOps.getHierarchyEdge('root-1', 'child-1')
      expect(edge).toBeDefined()

      const result = await edgeOps.deleteHierarchyEdge(edge!.id)
      expect(result.success).toBe(true)

      // Verify edge is deleted
      const deletedEdge = await edgeOps.getHierarchyEdge('root-1', 'child-1')
      expect(deletedEdge).toBeNull()

      // Child should become root node
      const parent = await edgeOps.getParent('child-1')
      expect(parent).toBeNull()
    })

    test('should delete all edges for a node', async () => {
      const result = await edgeOps.deleteNodeFromHierarchy('child-1')
      expect(result.success).toBe(true)

      // Verify all edges involving child-1 are deleted
      const parent = await edgeOps.getParent('child-1')
      expect(parent).toBeNull()

      const children = await edgeOps.getChildren('child-1')
      expect(children).toHaveLength(0)

      // Grandchildren should become orphaned or root nodes
      const grandchildren = await edgeOps.getChildren('child-1')
      expect(grandchildren).toHaveLength(0)
    })

    test('should handle cascade deletion options', async () => {
      const result = await edgeOps.deleteNodeFromHierarchy('child-1', { cascade: true })
      expect(result.success).toBe(true)

      if (result.cascade) {
        // If cascade is implemented, grandchildren should also be removed from hierarchy
        const orphanedNodes = await edgeOps.getRootNodes()
        expect(orphanedNodes.map(n => n.id)).not.toContain('grandchild-1')
        expect(orphanedNodes.map(n => n.id)).not.toContain('grandchild-2')
      }
    })

    test('should re-parent orphaned children when specified', async () => {
      const result = await edgeOps.deleteNodeFromHierarchy('child-1', { 
        reparentTo: 'root-1' 
      })
      expect(result.success).toBe(true)

      // Grandchildren should now be children of root-1
      const rootChildren = await edgeOps.getChildren('root-1')
      const childIds = rootChildren.map(c => c.child_id)
      expect(childIds).toContain('grandchild-1')
      expect(childIds).toContain('grandchild-2')
    })
  })

  describe('Hierarchy Validation', () => {
    beforeEach(async () => {
      const hierarchies: HierarchyInsert[] = [
        { parent_id: 'root-1', child_id: 'child-1', position: 0 },
        { parent_id: 'root-1', child_id: 'child-2', position: 1 },
        { parent_id: 'child-1', child_id: 'grandchild-1', position: 0 }
      ]
      await edgeOps.createHierarchyEdges(hierarchies)
    })

    test('should validate hierarchy integrity', async () => {
      const validation = await edgeOps.validateHierarchyIntegrity()
      expect(validation.valid).toBe(true)
      expect(validation.issues).toHaveLength(0)
    })

    test('should detect orphaned edges', async () => {
      // Create orphaned edge by deleting a node
      await nodeOps.deleteNode('child-1')

      const validation = await edgeOps.validateHierarchyIntegrity()
      expect(validation.valid).toBe(false)
      expect(validation.issues.some(i => i.type === 'orphaned_edge')).toBe(true)
    })

    test('should detect and fix duplicate edges', async () => {
      // Force create duplicate edge (bypassing normal validation)
      await connection.run(
        'INSERT INTO node_hierarchy (parent_id, child_id, position) VALUES (?, ?, ?)',
        ['root-1', 'child-1', 2]
      )

      const validation = await edgeOps.validateAndFixHierarchy()
      expect(validation.duplicateEdges.length).toBeGreaterThan(0)
      expect(validation.fixedCount).toBeGreaterThan(0)
    })

    test('should detect circular references in existing data', async () => {
      // Force create circular reference (bypassing normal validation)
      await connection.run(
        'INSERT INTO node_hierarchy (parent_id, child_id, position) VALUES (?, ?, ?)',
        ['grandchild-1', 'root-1', 0]
      )

      const validation = await edgeOps.validateHierarchyIntegrity()
      expect(validation.valid).toBe(false)
      expect(validation.issues.some(i => i.type === 'circular_reference')).toBe(true)
    })

    test('should validate position sequences', async () => {
      // Force create gap in positions
      await connection.run(
        'UPDATE node_hierarchy SET position = 5 WHERE parent_id = ? AND child_id = ?',
        ['root-1', 'child-2']
      )

      const validation = await edgeOps.validateHierarchyIntegrity()
      if (validation.issues.some(i => i.type === 'position_gap')) {
        expect(validation.valid).toBe(false)
      }
    })
  })

  describe('Hierarchy Statistics', () => {
    beforeEach(async () => {
      // Create a more complex hierarchy for statistics
      const hierarchies: HierarchyInsert[] = [
        { parent_id: 'root-1', child_id: 'child-1', position: 0 },
        { parent_id: 'root-1', child_id: 'child-2', position: 1 },
        { parent_id: 'root-2', child_id: 'child-3', position: 0 },
        { parent_id: 'child-1', child_id: 'grandchild-1', position: 0 },
        { parent_id: 'child-1', child_id: 'grandchild-2', position: 1 }
      ]
      await edgeOps.createHierarchyEdges(hierarchies)
    })

    test('should get hierarchy statistics', async () => {
      const stats = await edgeOps.getHierarchyStats()
      
      expect(stats.totalEdges).toBe(5)
      expect(stats.maxDepth).toBe(2)
      expect(stats.avgChildrenPerNode).toBeGreaterThan(0)
      expect(stats.orphanedNodes).toBe(0)
    })

    test('should calculate tree depth correctly', async () => {
      const maxDepth = await edgeOps.getMaxDepth()
      expect(maxDepth).toBe(2) // root -> child -> grandchild
    })

    test('should count nodes at each level', async () => {
      const levelCounts = await edgeOps.getNodeCountByLevel()
      expect(levelCounts[0]).toBe(2) // 2 root nodes
      expect(levelCounts[1]).toBe(3) // 3 child nodes
      expect(levelCounts[2]).toBe(2) // 2 grandchild nodes
    })

    test('should identify most connected nodes', async () => {
      const connected = await edgeOps.getMostConnectedNodes(3)
      expect(connected).toHaveLength(3)
      expect(connected[0].connections).toBeGreaterThanOrEqual(connected[1].connections)
    })
  })

  describe('Performance Tests', () => {
    test('should handle large hierarchy creation efficiently', async () => {
      const hierarchies: HierarchyInsert[] = []
      
      // Create a wide hierarchy (100 children per root)
      for (let i = 0; i < 100; i++) {
        hierarchies.push({
          parent_id: 'root-1',
          child_id: `perf-child-${i}`,
          position: i
        })
      }

      // Create nodes first
      const nodes: NodeInsert[] = hierarchies.map((h, i) => ({
        id: h.child_id,
        name: `Performance Child ${i}`,
        content: 'Performance test content',
        node_type: 'note',
        is_system_node: false
      }))
      await nodeOps.createNodes(nodes)

      const startTime = Date.now()
      const result = await edgeOps.createHierarchyEdges(hierarchies)
      const duration = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(result.created).toBe(100)
      expect(duration).toBeLessThan(2000) // Should complete in under 2 seconds

      console.log(`Created ${hierarchies.length} hierarchy edges in ${duration}ms`)
    })

    test('should handle deep hierarchy traversal efficiently', async () => {
      // Create a deep hierarchy (50 levels)
      const hierarchies: HierarchyInsert[] = []
      const nodes: NodeInsert[] = []

      for (let i = 0; i < 50; i++) {
        const nodeId = `deep-${i}`
        const parentId = i === 0 ? 'root-1' : `deep-${i - 1}`
        
        nodes.push({
          id: nodeId,
          name: `Deep Node ${i}`,
          content: 'Deep hierarchy content',
          node_type: 'note',
          is_system_node: false
        })

        hierarchies.push({
          parent_id: parentId,
          child_id: nodeId,
          position: 0
        })
      }

      await nodeOps.createNodes(nodes)
      await edgeOps.createHierarchyEdges(hierarchies)

      // Test descendant retrieval performance
      const startTime = Date.now()
      const descendants = await edgeOps.getDescendants('root-1')
      const duration = Date.now() - startTime

      expect(descendants.length).toBe(50)
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second

      console.log(`Retrieved ${descendants.length} descendants in ${duration}ms`)
    })

    test('should maintain performance with memory constraints', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Create moderate hierarchy
      const hierarchies: HierarchyInsert[] = []
      const nodes: NodeInsert[] = []

      // 10 roots with 10 children each
      for (let root = 0; root < 10; root++) {
        const rootId = `perf-root-${root}`
        nodes.push({
          id: rootId,
          name: `Performance Root ${root}`,
          content: 'Performance test content',
          node_type: 'folder',
          is_system_node: false
        })

        for (let child = 0; child < 10; child++) {
          const childId = `perf-child-${root}-${child}`
          nodes.push({
            id: childId,
            name: `Performance Child ${root}-${child}`,
            content: 'Performance test content',
            node_type: 'note',
            is_system_node: false
          })

          hierarchies.push({
            parent_id: rootId,
            child_id: childId,
            position: child
          })
        }
      }

      await nodeOps.createNodes(nodes)
      await edgeOps.createHierarchyEdges(hierarchies)

      // Perform various operations
      for (let i = 0; i < 10; i++) {
        await edgeOps.getChildren(`perf-root-${i}`)
        await edgeOps.getDescendants(`perf-root-${i}`)
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024 // MB

      expect(memoryIncrease).toBeLessThan(20) // Less than 20MB increase

      console.log(`Memory increase: ${memoryIncrease.toFixed(1)}MB for hierarchy operations`)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle operations on non-existent nodes', async () => {
      const result = await edgeOps.getChildren('non-existent')
      expect(result).toHaveLength(0)

      const parent = await edgeOps.getParent('non-existent')
      expect(parent).toBeNull()
    })

    test('should handle invalid hierarchy data gracefully', async () => {
      const invalidHierarchy = {
        parent_id: '',
        child_id: 'child-1',
        position: 0
      } as HierarchyInsert

      const result = await edgeOps.createHierarchyEdge(invalidHierarchy)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('should handle concurrent hierarchy modifications', async () => {
      const promises = []

      // Create multiple edges concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(edgeOps.createHierarchyEdge({
          parent_id: 'root-1',
          child_id: `concurrent-${i}`,
          position: i
        }))
      }

      // Create nodes first
      const nodes: NodeInsert[] = []
      for (let i = 0; i < 10; i++) {
        nodes.push({
          id: `concurrent-${i}`,
          name: `Concurrent Node ${i}`,
          content: 'Concurrent test',
          node_type: 'note',
          is_system_node: false
        })
      }
      await nodeOps.createNodes(nodes)

      const results = await Promise.all(promises)
      const successfulCreations = results.filter(r => r.success).length

      expect(successfulCreations).toBe(10)

      // Verify hierarchy integrity
      const children = await edgeOps.getChildren('root-1')
      expect(children).toHaveLength(10)
    })

    test('should handle very large position values', async () => {
      const largePosition = 999999999
      const result = await edgeOps.createHierarchyEdge({
        parent_id: 'root-1',
        child_id: 'child-1',
        position: largePosition
      })

      expect(result.success).toBe(true)
      expect(result.edge?.position).toBe(largePosition)
    })

    test('should handle negative position values', async () => {
      const result = await edgeOps.createHierarchyEdge({
        parent_id: 'root-1',
        child_id: 'child-1',
        position: -1
      })

      // Should either reject negative positions or handle them gracefully
      if (result.success) {
        expect(result.edge?.position).toBeGreaterThanOrEqual(0)
      } else {
        expect(result.error).toBeDefined()
      }
    })
  })
})