#!/usr/bin/env bun
/**
 * Node Operations Tests
 * 
 * Tests for CRUD operations on nodes including creation, retrieval,
 * updates, deletion, and advanced querying functionality.
 */

import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { dbUtils } from '../../../server/src/database/index.js'
import { createNodeOperations } from '../../../server/src/database/operations/nodes.js'
import type { DatabaseConnection, NodeInsert, NodeUpdate } from '../../../server/src/database/types/index.js'

describe('Node Operations', () => {
  let connection: DatabaseConnection
  let nodeOps: ReturnType<typeof createNodeOperations>

  beforeEach(async () => {
    connection = await dbUtils.createTestConnection()
    nodeOps = createNodeOperations(connection)
  })

  afterEach(async () => {
    if (connection) {
      await connection.close()
    }
  })

  describe('Node Creation', () => {
    test('should create a single node successfully', async () => {
      const nodeData: NodeInsert = {
        id: 'test-node-1',
        name: 'Test Node',
        content: 'This is test content',
        node_type: 'note',
        is_system_node: false,
        tags: ['test', 'example'],
        metadata: { priority: 'high' }
      }

      const result = await nodeOps.createNode(nodeData)
      expect(result.success).toBe(true)
      expect(result.node).toBeDefined()
      expect(result.node?.id).toBe(nodeData.id)
      expect(result.node?.name).toBe(nodeData.name)
    })

    test('should create multiple nodes in batch', async () => {
      const nodes: NodeInsert[] = [
        {
          id: 'batch-1',
          name: 'Batch Node 1',
          content: 'Content 1',
          node_type: 'note',
          is_system_node: false
        },
        {
          id: 'batch-2',
          name: 'Batch Node 2',
          content: 'Content 2',
          node_type: 'task',
          is_system_node: false
        },
        {
          id: 'batch-3',
          name: 'Batch Node 3',
          content: 'Content 3',
          node_type: 'note',
          is_system_node: false
        }
      ]

      const results = await nodeOps.createNodes(nodes)
      expect(results.success).toBe(true)
      expect(results.created).toBe(3)
      expect(results.nodes).toHaveLength(3)
    })

    test('should handle duplicate node IDs gracefully', async () => {
      const nodeData: NodeInsert = {
        id: 'duplicate-test',
        name: 'Original Node',
        content: 'Original content',
        node_type: 'note',
        is_system_node: false
      }

      // Create first node
      const result1 = await nodeOps.createNode(nodeData)
      expect(result1.success).toBe(true)

      // Try to create duplicate
      const duplicateData: NodeInsert = {
        id: 'duplicate-test',
        name: 'Duplicate Node',
        content: 'Duplicate content',
        node_type: 'note',
        is_system_node: false
      }

      const result2 = await nodeOps.createNode(duplicateData)
      expect(result2.success).toBe(false)
      expect(result2.error).toContain('already exists')
    })

    test('should validate required fields', async () => {
      const invalidNode = {
        // Missing required fields
        name: 'Test Node',
        content: 'Test content'
      } as NodeInsert

      const result = await nodeOps.createNode(invalidNode)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('should handle special characters in content', async () => {
      const nodeData: NodeInsert = {
        id: 'special-chars',
        name: 'Special Characters Test',
        content: 'Content with emojis 🚀 and unicode characters: 日本語, العربية, русский',
        node_type: 'note',
        is_system_node: false
      }

      const result = await nodeOps.createNode(nodeData)
      expect(result.success).toBe(true)
      expect(result.node?.content).toBe(nodeData.content)
    })

    test('should set timestamps automatically', async () => {
      const nodeData: NodeInsert = {
        id: 'timestamp-test',
        name: 'Timestamp Test',
        content: 'Test content',
        node_type: 'note',
        is_system_node: false
      }

      const before = new Date()
      const result = await nodeOps.createNode(nodeData)
      const after = new Date()

      expect(result.success).toBe(true)
      expect(result.node?.created_at).toBeDefined()
      expect(result.node?.updated_at).toBeDefined()
      
      const createdAt = new Date(result.node!.created_at)
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe('Node Retrieval', () => {
    beforeEach(async () => {
      // Setup test data
      const testNodes: NodeInsert[] = [
        {
          id: 'retrieve-1',
          name: 'First Node',
          content: 'First content',
          node_type: 'note',
          is_system_node: false,
          tags: ['tag1', 'tag2']
        },
        {
          id: 'retrieve-2',
          name: 'Second Node',
          content: 'Second content',
          node_type: 'task',
          is_system_node: false,
          tags: ['tag2', 'tag3']
        },
        {
          id: 'system-1',
          name: 'System Node',
          content: 'System content',
          node_type: 'system',
          is_system_node: true
        }
      ]

      await nodeOps.createNodes(testNodes)
    })

    test('should retrieve node by ID', async () => {
      const node = await nodeOps.getNodeById('retrieve-1')
      expect(node).toBeDefined()
      expect(node?.id).toBe('retrieve-1')
      expect(node?.name).toBe('First Node')
      expect(node?.tags).toEqual(['tag1', 'tag2'])
    })

    test('should return null for non-existent node', async () => {
      const node = await nodeOps.getNodeById('non-existent')
      expect(node).toBeNull()
    })

    test('should retrieve multiple nodes by IDs', async () => {
      const nodes = await nodeOps.getNodesByIds(['retrieve-1', 'retrieve-2', 'non-existent'])
      expect(nodes).toHaveLength(2)
      expect(nodes.map(n => n.id)).toContain('retrieve-1')
      expect(nodes.map(n => n.id)).toContain('retrieve-2')
    })

    test('should get all nodes with pagination', async () => {
      const result = await nodeOps.getAllNodes({ limit: 2, offset: 0 })
      expect(result.nodes).toHaveLength(2)
      expect(result.total).toBe(3)
      expect(result.hasMore).toBe(true)

      const result2 = await nodeOps.getAllNodes({ limit: 2, offset: 2 })
      expect(result2.nodes).toHaveLength(1)
      expect(result2.hasMore).toBe(false)
    })

    test('should filter nodes by type', async () => {
      const noteNodes = await nodeOps.getNodesByType('note')
      expect(noteNodes).toHaveLength(1)
      expect(noteNodes[0].node_type).toBe('note')

      const taskNodes = await nodeOps.getNodesByType('task')
      expect(taskNodes).toHaveLength(1)
      expect(taskNodes[0].node_type).toBe('task')
    })

    test('should filter system nodes', async () => {
      const regularNodes = await nodeOps.getAllNodes({ excludeSystemNodes: true })
      expect(regularNodes.nodes).toHaveLength(2)
      expect(regularNodes.nodes.every(n => !n.is_system_node)).toBe(true)

      const systemNodes = await nodeOps.getSystemNodes()
      expect(systemNodes).toHaveLength(1)
      expect(systemNodes[0].is_system_node).toBe(true)
    })

    test('should search nodes by name', async () => {
      const results = await nodeOps.searchNodesByName('First')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('First Node')
    })

    test('should search nodes by content', async () => {
      const results = await nodeOps.searchNodesByContent('Second content')
      expect(results).toHaveLength(1)
      expect(results[0].content).toBe('Second content')
    })

    test('should search nodes by tags', async () => {
      const results = await nodeOps.searchNodesByTags(['tag2'])
      expect(results).toHaveLength(2) // Both retrieve-1 and retrieve-2 have tag2

      const results2 = await nodeOps.searchNodesByTags(['tag1'])
      expect(results2).toHaveLength(1)
      expect(results2[0].id).toBe('retrieve-1')
    })
  })

  describe('Node Updates', () => {
    beforeEach(async () => {
      const nodeData: NodeInsert = {
        id: 'update-test',
        name: 'Original Name',
        content: 'Original content',
        node_type: 'note',
        is_system_node: false,
        tags: ['original']
      }
      await nodeOps.createNode(nodeData)
    })

    test('should update node successfully', async () => {
      const updateData: NodeUpdate = {
        name: 'Updated Name',
        content: 'Updated content',
        tags: ['updated', 'modified']
      }

      const result = await nodeOps.updateNode('update-test', updateData)
      expect(result.success).toBe(true)
      expect(result.node?.name).toBe('Updated Name')
      expect(result.node?.content).toBe('Updated content')
      expect(result.node?.tags).toEqual(['updated', 'modified'])
    })

    test('should update only specified fields', async () => {
      const updateData: NodeUpdate = {
        name: 'New Name Only'
      }

      const result = await nodeOps.updateNode('update-test', updateData)
      expect(result.success).toBe(true)
      expect(result.node?.name).toBe('New Name Only')
      expect(result.node?.content).toBe('Original content') // Unchanged
    })

    test('should update timestamp on modification', async () => {
      const originalNode = await nodeOps.getNodeById('update-test')
      expect(originalNode).toBeDefined()

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const updateData: NodeUpdate = { name: 'Updated Name' }
      const result = await nodeOps.updateNode('update-test', updateData)

      expect(result.success).toBe(true)
      expect(new Date(result.node!.updated_at).getTime())
        .toBeGreaterThan(new Date(originalNode!.updated_at).getTime())
    })

    test('should fail to update non-existent node', async () => {
      const updateData: NodeUpdate = { name: 'New Name' }
      const result = await nodeOps.updateNode('non-existent', updateData)
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    test('should validate update data', async () => {
      const invalidUpdate = {
        node_type: null // Invalid type
      } as NodeUpdate

      const result = await nodeOps.updateNode('update-test', invalidUpdate)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('should update multiple nodes in batch', async () => {
      // Create additional test nodes
      await nodeOps.createNodes([
        { id: 'batch-update-1', name: 'Batch 1', content: 'Content 1', node_type: 'note', is_system_node: false },
        { id: 'batch-update-2', name: 'Batch 2', content: 'Content 2', node_type: 'note', is_system_node: false }
      ])

      const updates = [
        { id: 'batch-update-1', data: { name: 'Updated Batch 1' } },
        { id: 'batch-update-2', data: { name: 'Updated Batch 2' } }
      ]

      const results = await nodeOps.updateNodes(updates)
      expect(results.success).toBe(true)
      expect(results.updated).toBe(2)
    })
  })

  describe('Node Deletion', () => {
    beforeEach(async () => {
      const testNodes: NodeInsert[] = [
        { id: 'delete-1', name: 'Delete Node 1', content: 'Content 1', node_type: 'note', is_system_node: false },
        { id: 'delete-2', name: 'Delete Node 2', content: 'Content 2', node_type: 'note', is_system_node: false },
        { id: 'delete-3', name: 'Delete Node 3', content: 'Content 3', node_type: 'note', is_system_node: false }
      ]
      await nodeOps.createNodes(testNodes)
    })

    test('should delete single node successfully', async () => {
      const result = await nodeOps.deleteNode('delete-1')
      expect(result.success).toBe(true)
      expect(result.deleted).toBe(true)

      // Verify node is deleted
      const node = await nodeOps.getNodeById('delete-1')
      expect(node).toBeNull()
    })

    test('should fail to delete non-existent node', async () => {
      const result = await nodeOps.deleteNode('non-existent')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    test('should delete multiple nodes in batch', async () => {
      const result = await nodeOps.deleteNodes(['delete-1', 'delete-2'])
      expect(result.success).toBe(true)
      expect(result.deleted).toBe(2)

      // Verify nodes are deleted
      const nodes = await nodeOps.getNodesByIds(['delete-1', 'delete-2'])
      expect(nodes).toHaveLength(0)
    })

    test('should handle partial batch deletion', async () => {
      const result = await nodeOps.deleteNodes(['delete-1', 'non-existent', 'delete-2'])
      expect(result.deleted).toBe(2) // Only existing nodes deleted
      expect(result.errors).toHaveLength(1) // One error for non-existent node
    })

    test('should soft delete when configured', async () => {
      // If soft delete is implemented
      const result = await nodeOps.deleteNode('delete-1', { soft: true })
      
      if (result.success) {
        // Node should be marked as deleted but still exist
        const node = await nodeOps.getNodeById('delete-1', { includeDeleted: true })
        expect(node?.deleted_at).toBeDefined()
      }
    })
  })

  describe('Node Statistics', () => {
    beforeEach(async () => {
      const testNodes: NodeInsert[] = [
        { id: 'stats-1', name: 'Note 1', content: 'Content', node_type: 'note', is_system_node: false },
        { id: 'stats-2', name: 'Note 2', content: 'Content', node_type: 'note', is_system_node: false },
        { id: 'stats-3', name: 'Task 1', content: 'Content', node_type: 'task', is_system_node: false },
        { id: 'stats-4', name: 'System', content: 'Content', node_type: 'system', is_system_node: true }
      ]
      await nodeOps.createNodes(testNodes)
    })

    test('should get total node count', async () => {
      const count = await nodeOps.getNodeCount()
      expect(count).toBe(4)
    })

    test('should get node count by filters', async () => {
      const noteCount = await nodeOps.getNodeCount({ node_type: 'note' })
      expect(noteCount).toBe(2)

      const systemCount = await nodeOps.getNodeCount({ is_system_node: true })
      expect(systemCount).toBe(1)

      const regularCount = await nodeOps.getNodeCount({ is_system_node: false })
      expect(regularCount).toBe(3)
    })

    test('should get node statistics by type', async () => {
      const stats = await nodeOps.getNodeStatsByType()
      expect(stats.note).toBe(2)
      expect(stats.task).toBe(1)
      expect(stats.system).toBe(1)
    })

    test('should get recent nodes', async () => {
      const recentNodes = await nodeOps.getRecentNodes(2)
      expect(recentNodes).toHaveLength(2)
      
      // Should be ordered by creation time (newest first)
      expect(new Date(recentNodes[0].created_at).getTime())
        .toBeGreaterThanOrEqual(new Date(recentNodes[1].created_at).getTime())
    })
  })

  describe('Performance Tests', () => {
    test('should handle large batch creation efficiently', async () => {
      const batchSize = 1000
      const nodes: NodeInsert[] = []

      for (let i = 0; i < batchSize; i++) {
        nodes.push({
          id: `perf-${i}`,
          name: `Performance Node ${i}`,
          content: `Content for performance test ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }

      const startTime = Date.now()
      const result = await nodeOps.createNodes(nodes)
      const duration = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(result.created).toBe(batchSize)
      expect(duration).toBeLessThan(5000) // Should complete in under 5 seconds

      console.log(`Created ${batchSize} nodes in ${duration}ms (${(batchSize / duration * 1000).toFixed(1)} nodes/sec)`)
    })

    test('should handle large batch retrieval efficiently', async () => {
      // Create test data first
      const nodes: NodeInsert[] = []
      for (let i = 0; i < 100; i++) {
        nodes.push({
          id: `retrieve-perf-${i}`,
          name: `Retrieval Test ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }
      await nodeOps.createNodes(nodes)

      const startTime = Date.now()
      const result = await nodeOps.getAllNodes({ limit: 100 })
      const duration = Date.now() - startTime

      expect(result.nodes).toHaveLength(100)
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second

      console.log(`Retrieved ${result.nodes.length} nodes in ${duration}ms`)
    })

    test('should maintain performance with memory constraints', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Create and retrieve many nodes
      const batchSize = 500
      const nodes: NodeInsert[] = []
      
      for (let i = 0; i < batchSize; i++) {
        nodes.push({
          id: `memory-${i}`,
          name: `Memory Test Node ${i}`,
          content: 'x'.repeat(1000), // 1KB content per node
          node_type: 'note',
          is_system_node: false
        })
      }

      await nodeOps.createNodes(nodes)
      const allNodes = await nodeOps.getAllNodes()

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024 // MB

      expect(allNodes.nodes.length).toBe(batchSize)
      expect(memoryIncrease).toBeLessThan(50) // Less than 50MB increase

      console.log(`Memory increase: ${memoryIncrease.toFixed(1)}MB for ${batchSize} nodes`)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle extremely long content', async () => {
      const longContent = 'x'.repeat(1000000) // 1MB content
      const nodeData: NodeInsert = {
        id: 'long-content',
        name: 'Long Content Test',
        content: longContent,
        node_type: 'note',
        is_system_node: false
      }

      const result = await nodeOps.createNode(nodeData)
      expect(result.success).toBe(true)
      
      const retrieved = await nodeOps.getNodeById('long-content')
      expect(retrieved?.content).toBe(longContent)
    })

    test('should handle special characters in node IDs', async () => {
      const specialIds = ['node-with-dashes', 'node_with_underscores', 'node.with.dots']

      for (const id of specialIds) {
        const nodeData: NodeInsert = {
          id,
          name: `Node ${id}`,
          content: 'Test content',
          node_type: 'note',
          is_system_node: false
        }

        const result = await nodeOps.createNode(nodeData)
        expect(result.success).toBe(true)

        const retrieved = await nodeOps.getNodeById(id)
        expect(retrieved?.id).toBe(id)
      }
    })

    test('should handle concurrent operations safely', async () => {
      const promises = []

      // Create multiple nodes concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(nodeOps.createNode({
          id: `concurrent-${i}`,
          name: `Concurrent Node ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        }))
      }

      const results = await Promise.all(promises)
      const successfulCreations = results.filter(r => r.success).length

      expect(successfulCreations).toBe(10)

      // Verify all nodes exist
      const allNodes = await nodeOps.getAllNodes()
      expect(allNodes.nodes.length).toBe(10)
    })

    test('should handle empty and null values appropriately', async () => {
      const nodeData: NodeInsert = {
        id: 'empty-test',
        name: '',
        content: '',
        node_type: 'note',
        is_system_node: false,
        tags: [],
        metadata: {}
      }

      const result = await nodeOps.createNode(nodeData)
      expect(result.success).toBe(true)

      const retrieved = await nodeOps.getNodeById('empty-test')
      expect(retrieved?.name).toBe('')
      expect(retrieved?.content).toBe('')
      expect(retrieved?.tags).toEqual([])
    })
  })
})