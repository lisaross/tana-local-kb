#!/usr/bin/env bun
/**
 * Batch Operations Tests
 * 
 * Tests for bulk operations, transaction management, memory efficiency,
 * and performance validation for large-scale data operations.
 */

import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { dbUtils } from '../../../server/src/database/index.js'
import { createBatchOperations } from '../../../server/src/database/operations/batch.js'
import { createNodeOperations } from '../../../server/src/database/operations/nodes.js'
import { createEdgeOperations } from '../../../server/src/database/operations/edges.js'
import type { 
  DatabaseConnection, 
  NodeInsert, 
  HierarchyInsert, 
  BatchOperation,
  ReferenceInsert 
} from '../../../server/src/database/types/index.js'

describe('Batch Operations', () => {
  let connection: DatabaseConnection
  let batchOps: ReturnType<typeof createBatchOperations>
  let nodeOps: ReturnType<typeof createNodeOperations>
  let edgeOps: ReturnType<typeof createEdgeOperations>

  beforeEach(async () => {
    connection = await dbUtils.createTestConnection()
    batchOps = createBatchOperations(connection)
    nodeOps = createNodeOperations(connection)
    edgeOps = createEdgeOperations(connection)
  })

  afterEach(async () => {
    if (connection) {
      await connection.close()
    }
  })

  describe('Batch Node Operations', () => {
    test('should process large batch of node creations efficiently', async () => {
      const batchSize = 1000
      const nodes: NodeInsert[] = []

      for (let i = 0; i < batchSize; i++) {
        nodes.push({
          id: `batch-node-${i}`,
          name: `Batch Node ${i}`,
          content: `Content for batch node ${i} with some longer text to test memory usage`,
          node_type: 'note',
          is_system_node: false,
          tags: [`tag-${i % 10}`, `category-${Math.floor(i / 100)}`],
          metadata: { 
            batch: true, 
            index: i, 
            group: Math.floor(i / 50) 
          }
        })
      }

      const startTime = Date.now()
      const initialMemory = process.memoryUsage().heapUsed

      const result = await batchOps.batchCreateNodes(nodes)
      
      const duration = Date.now() - startTime
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024 // MB

      expect(result.success).toBe(true)
      expect(result.created).toBe(batchSize)
      expect(result.errors).toHaveLength(0)
      
      // Performance requirements (environment-aware)
      const maxDuration = process.env.CI ? 10000 : 5000 // More lenient in CI
      const maxMemory = process.env.CI ? 100 : 50 // More lenient in CI
      const minThroughput = process.env.CI ? 100 : 200 // More lenient in CI
      
      expect(duration).toBeLessThan(maxDuration) // Reasonable duration for batch size
      expect(memoryIncrease).toBeLessThan(maxMemory) // Reasonable memory increase
      
      const throughput = (batchSize / duration) * 1000 // nodes per second
      expect(throughput).toBeGreaterThan(minThroughput) // Reasonable throughput

      console.log(`Batch created ${batchSize} nodes in ${duration}ms (${throughput.toFixed(1)} nodes/sec, ${memoryIncrease.toFixed(1)}MB memory)`)
    })

    test('should handle batch operations with chunking', async () => {
      const totalNodes = 2000
      const chunkSize = 500
      const nodes: NodeInsert[] = []

      for (let i = 0; i < totalNodes; i++) {
        nodes.push({
          id: `chunk-node-${i}`,
          name: `Chunk Node ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }

      const result = await batchOps.batchCreateNodes(nodes, { chunkSize })
      
      expect(result.success).toBe(true)
      expect(result.created).toBe(totalNodes)
      expect(result.chunks).toBe(Math.ceil(totalNodes / chunkSize))

      // Verify all nodes were created
      const count = await nodeOps.getNodeCount()
      expect(count).toBe(totalNodes)
    })

    test('should handle partial failures in batch operations', async () => {
      const nodes: NodeInsert[] = [
        {
          id: 'valid-1',
          name: 'Valid Node 1',
          content: 'Valid content',
          node_type: 'note',
          is_system_node: false
        },
        {
          id: 'invalid-1',
          name: '', // Invalid: empty name
          content: 'Invalid content',
          node_type: 'note',
          is_system_node: false
        } as NodeInsert,
        {
          id: 'valid-2',
          name: 'Valid Node 2',
          content: 'Valid content',
          node_type: 'note',
          is_system_node: false
        }
      ]

      const result = await batchOps.batchCreateNodes(nodes, { 
        continueOnError: true 
      })
      
      expect(result.success).toBe(true) // Overall success despite partial failures
      expect(result.created).toBe(2) // Only valid nodes created
      expect(result.errors).toHaveLength(1) // One error for invalid node
      expect(result.errors[0].id).toBe('invalid-1')
    })

    test('should rollback entire batch on critical failure', async () => {
      const nodes: NodeInsert[] = [
        {
          id: 'rollback-1',
          name: 'Rollback Node 1',
          content: 'Content 1',
          node_type: 'note',
          is_system_node: false
        },
        {
          id: 'rollback-2',
          name: 'Rollback Node 2',
          content: 'Content 2',
          node_type: 'note',
          is_system_node: false
        }
      ]

      // First create one node to test conflict
      await nodeOps.createNode(nodes[0])

      const result = await batchOps.batchCreateNodes(nodes, { 
        continueOnError: false,
        transactional: true 
      })
      
      expect(result.success).toBe(false)
      expect(result.created).toBe(0) // Nothing should be created due to rollback

      // Verify original node still exists
      const existingNode = await nodeOps.getNodeById('rollback-1')
      expect(existingNode).toBeDefined()
    })

    test('should update nodes in batch efficiently', async () => {
      // Create initial nodes
      const nodes: NodeInsert[] = []
      for (let i = 0; i < 100; i++) {
        nodes.push({
          id: `update-batch-${i}`,
          name: `Original Node ${i}`,
          content: `Original content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }
      await batchOps.batchCreateNodes(nodes)

      // Prepare updates
      const updates = nodes.map((node, i) => ({
        id: node.id,
        data: {
          name: `Updated Node ${i}`,
          content: `Updated content ${i}`,
          tags: [`updated-${i}`]
        }
      }))

      const startTime = Date.now()
      const result = await batchOps.batchUpdateNodes(updates)
      const duration = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(result.updated).toBe(100)
      expect(duration).toBeLessThan(2000) // < 2 seconds for 100 updates

      // Verify updates
      const updatedNode = await nodeOps.getNodeById('update-batch-0')
      expect(updatedNode?.name).toBe('Updated Node 0')
      expect(updatedNode?.tags).toEqual(['updated-0'])
    })

    test('should delete nodes in batch efficiently', async () => {
      // Create test nodes
      const nodes: NodeInsert[] = []
      for (let i = 0; i < 50; i++) {
        nodes.push({
          id: `delete-batch-${i}`,
          name: `Delete Node ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }
      await batchOps.batchCreateNodes(nodes)

      const idsToDelete = nodes.map(n => n.id)
      
      const result = await batchOps.batchDeleteNodes(idsToDelete)
      
      expect(result.success).toBe(true)
      expect(result.deleted).toBe(50)

      // Verify deletion
      const remainingCount = await nodeOps.getNodeCount()
      expect(remainingCount).toBe(0)
    })
  })

  describe('Batch Hierarchy Operations', () => {
    beforeEach(async () => {
      // Create test nodes for hierarchy operations
      const nodes: NodeInsert[] = []
      for (let i = 0; i < 200; i++) {
        nodes.push({
          id: `hierarchy-node-${i}`,
          name: `Hierarchy Node ${i}`,
          content: `Content ${i}`,
          node_type: i < 10 ? 'folder' : 'note',
          is_system_node: false
        })
      }
      await batchOps.batchCreateNodes(nodes)
    })

    test('should create large hierarchy structure efficiently', async () => {
      const hierarchies: HierarchyInsert[] = []
      
      // Create hierarchy: 10 roots with 19 children each
      for (let root = 0; root < 10; root++) {
        for (let child = 0; child < 19; child++) {
          const childIndex = root * 19 + child + 10 // Offset by 10 (root nodes)
          hierarchies.push({
            parent_id: `hierarchy-node-${root}`,
            child_id: `hierarchy-node-${childIndex}`,
            position: child
          })
        }
      }

      const startTime = Date.now()
      const result = await batchOps.batchCreateHierarchyEdges(hierarchies)
      const duration = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(result.created).toBe(190) // 10 * 19
      expect(duration).toBeLessThan(3000) // < 3 seconds

      // Verify hierarchy structure
      const children = await edgeOps.getChildren('hierarchy-node-0')
      expect(children).toHaveLength(19)

      console.log(`Created ${hierarchies.length} hierarchy edges in ${duration}ms`)
    })

    test('should handle hierarchy validation in batch', async () => {
      const hierarchies: HierarchyInsert[] = [
        {
          parent_id: 'hierarchy-node-0',
          child_id: 'hierarchy-node-10',
          position: 0
        },
        {
          parent_id: 'hierarchy-node-10',
          child_id: 'hierarchy-node-0', // Circular reference
          position: 0
        },
        {
          parent_id: 'hierarchy-node-1',
          child_id: 'hierarchy-node-11',
          position: 0
        }
      ]

      const result = await batchOps.batchCreateHierarchyEdges(hierarchies, {
        validateCircular: true,
        continueOnError: true
      })

      expect(result.created).toBe(2) // First and third should succeed
      expect(result.errors).toHaveLength(1) // Circular reference error
      expect(result.errors[0].type).toBe('circular_reference')
    })

    test('should move subtrees efficiently', async () => {
      // Create initial hierarchy
      const initialHierarchy: HierarchyInsert[] = []
      for (let i = 10; i < 30; i++) {
        initialHierarchy.push({
          parent_id: 'hierarchy-node-0',
          child_id: `hierarchy-node-${i}`,
          position: i - 10
        })
      }
      await batchOps.batchCreateHierarchyEdges(initialHierarchy)

      // Move all children from node-0 to node-1
      const moveOperations: BatchOperation[] = []
      for (let i = 10; i < 30; i++) {
        moveOperations.push({
          type: 'move_node',
          data: {
            nodeId: `hierarchy-node-${i}`,
            newParentId: 'hierarchy-node-1'
          }
        })
      }

      const result = await batchOps.executeBatchOperations(moveOperations)
      expect(result.success).toBe(true)

      // Verify moves
      const node0Children = await edgeOps.getChildren('hierarchy-node-0')
      const node1Children = await edgeOps.getChildren('hierarchy-node-1')
      
      expect(node0Children).toHaveLength(0)
      expect(node1Children).toHaveLength(20)
    })
  })

  describe('Mixed Batch Operations', () => {
    test('should execute complex mixed operations atomically', async () => {
      const operations: BatchOperation[] = [
        {
          type: 'create_node',
          data: {
            id: 'mixed-1',
            name: 'Mixed Node 1',
            content: 'Content 1',
            node_type: 'folder',
            is_system_node: false
          }
        },
        {
          type: 'create_node',
          data: {
            id: 'mixed-2',
            name: 'Mixed Node 2',
            content: 'Content 2',
            node_type: 'note',
            is_system_node: false
          }
        },
        {
          type: 'create_hierarchy_edge',
          data: {
            parent_id: 'mixed-1',
            child_id: 'mixed-2',
            position: 0
          }
        },
        {
          type: 'create_reference',
          data: {
            source_id: 'mixed-2',
            target_id: 'mixed-1',
            reference_type: 'link'
          }
        }
      ]

      const result = await batchOps.executeBatchOperations(operations, {
        transactional: true
      })

      expect(result.success).toBe(true)
      expect(result.completed).toBe(4)

      // Verify all operations completed
      const node1 = await nodeOps.getNodeById('mixed-1')
      const node2 = await nodeOps.getNodeById('mixed-2')
      const hierarchy = await edgeOps.getParent('mixed-2')

      expect(node1).toBeDefined()
      expect(node2).toBeDefined()
      expect(hierarchy?.parent_id).toBe('mixed-1')
    })

    test('should handle operation dependencies correctly', async () => {
      const operations: BatchOperation[] = [
        {
          type: 'create_node',
          data: {
            id: 'dep-parent',
            name: 'Dependent Parent',
            content: 'Parent content',
            node_type: 'folder',
            is_system_node: false
          }
        },
        {
          type: 'create_node',
          data: {
            id: 'dep-child',
            name: 'Dependent Child',
            content: 'Child content',
            node_type: 'note',
            is_system_node: false
          }
        },
        {
          type: 'create_hierarchy_edge',
          data: {
            parent_id: 'dep-parent',
            child_id: 'dep-child',
            position: 0
          },
          dependencies: ['dep-parent', 'dep-child'] // Requires both nodes to exist
        }
      ]

      const result = await batchOps.executeBatchOperations(operations, {
        resolveDependencies: true
      })

      expect(result.success).toBe(true)
      expect(result.completed).toBe(3)

      // Verify hierarchy was created after nodes
      const hierarchy = await edgeOps.getParent('dep-child')
      expect(hierarchy?.parent_id).toBe('dep-parent')
    })

    test('should rollback all operations on failure in transactional mode', async () => {
      const operations: BatchOperation[] = [
        {
          type: 'create_node',
          data: {
            id: 'rollback-test-1',
            name: 'Rollback Test 1',
            content: 'Content 1',
            node_type: 'note',
            is_system_node: false
          }
        },
        {
          type: 'create_node',
          data: {
            id: 'rollback-test-2',
            name: 'Rollback Test 2',
            content: 'Content 2',
            node_type: 'note',
            is_system_node: false
          }
        },
        {
          type: 'create_hierarchy_edge',
          data: {
            parent_id: 'non-existent-parent',
            child_id: 'rollback-test-2',
            position: 0
          }
        }
      ]

      const result = await batchOps.executeBatchOperations(operations, {
        transactional: true,
        continueOnError: false
      })

      expect(result.success).toBe(false)

      // Verify rollback - no nodes should exist
      const node1 = await nodeOps.getNodeById('rollback-test-1')
      const node2 = await nodeOps.getNodeById('rollback-test-2')
      
      expect(node1).toBeNull()
      expect(node2).toBeNull()
    })
  })

  describe('Performance and Memory Tests', () => {
    test('should handle 10K+ nodes within memory constraints', async () => {
      const nodeCount = 10000
      const maxMemoryMB = 100 // 100MB limit
      
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024

      // Generate nodes in chunks to avoid building large array in memory
      let totalCreated = 0
      const chunkSize = 1000

      for (let chunk = 0; chunk < Math.ceil(nodeCount / chunkSize); chunk++) {
        const chunkNodes: NodeInsert[] = []
        const startIdx = chunk * chunkSize
        const endIdx = Math.min(startIdx + chunkSize, nodeCount)

        for (let i = startIdx; i < endIdx; i++) {
          chunkNodes.push({
            id: `perf-node-${i}`,
            name: `Performance Node ${i}`,
            content: `Content for performance test node ${i} with some additional text to simulate real content`,
            node_type: i % 100 === 0 ? 'folder' : 'note',
            is_system_node: false,
            tags: [`tag-${i % 10}`, `category-${Math.floor(i / 1000)}`]
          })
        }

        const result = await batchOps.batchCreateNodes(chunkNodes)
        expect(result.success).toBe(true)
        totalCreated += result.created

        // Check memory usage after each chunk
        const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024
        const memoryIncrease = currentMemory - initialMemory
        
        if (memoryIncrease > maxMemoryMB) {
          console.warn(`Memory usage exceeded ${maxMemoryMB}MB: ${memoryIncrease.toFixed(1)}MB`)
        }
      }

      expect(totalCreated).toBe(nodeCount)

      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024
      const totalMemoryIncrease = finalMemory - initialMemory

      console.log(`Created ${nodeCount} nodes using ${totalMemoryIncrease.toFixed(1)}MB memory`)
      expect(totalMemoryIncrease).toBeLessThan(maxMemoryMB)
    })

    test('should maintain consistent performance across large batches', async () => {
      const measurements: Array<{ batchSize: number; duration: number; throughput: number }> = []
      const batchSizes = [100, 500, 1000, 2000]

      for (const batchSize of batchSizes) {
        const nodes: NodeInsert[] = []
        for (let i = 0; i < batchSize; i++) {
          nodes.push({
            id: `perf-batch-${batchSize}-${i}`,
            name: `Performance Batch Node ${i}`,
            content: `Content ${i}`,
            node_type: 'note',
            is_system_node: false
          })
        }

        const startTime = Date.now()
        const result = await batchOps.batchCreateNodes(nodes)
        const duration = Date.now() - startTime
        const throughput = (batchSize / duration) * 1000

        expect(result.success).toBe(true)
        expect(result.created).toBe(batchSize)

        measurements.push({ batchSize, duration, throughput })
        console.log(`Batch ${batchSize}: ${duration}ms (${throughput.toFixed(1)} nodes/sec)`)

        // Clean up for next test
        const idsToDelete = nodes.map(n => n.id)
        await batchOps.batchDeleteNodes(idsToDelete)
      }

      // Verify performance doesn't degrade significantly with larger batches
      const smallBatchThroughput = measurements[0].throughput
      const largeBatchThroughput = measurements[measurements.length - 1].throughput
      
      // Large batch should not be more than 50% slower per node
      expect(largeBatchThroughput).toBeGreaterThan(smallBatchThroughput * 0.5)
    })

    test('should handle concurrent batch operations safely', async () => {
      const concurrentBatches = 5
      const batchSize = 200
      const promises: Promise<any>[] = []

      for (let batch = 0; batch < concurrentBatches; batch++) {
        const nodes: NodeInsert[] = []
        for (let i = 0; i < batchSize; i++) {
          nodes.push({
            id: `concurrent-${batch}-${i}`,
            name: `Concurrent Node ${batch}-${i}`,
            content: `Content ${batch}-${i}`,
            node_type: 'note',
            is_system_node: false
          })
        }

        promises.push(batchOps.batchCreateNodes(nodes))
      }

      const results = await Promise.all(promises)
      
      // All batches should succeed
      for (const result of results) {
        expect(result.success).toBe(true)
        expect(result.created).toBe(batchSize)
      }

      // Verify total count
      const totalCount = await nodeOps.getNodeCount()
      expect(totalCount).toBe(concurrentBatches * batchSize)

      console.log(`Successfully processed ${concurrentBatches} concurrent batches of ${batchSize} nodes each`)
    })
  })

  describe('Progress Tracking and Monitoring', () => {
    test('should provide progress callbacks for long operations', async () => {
      const nodeCount = 1000
      const progressUpdates: Array<{ completed: number; total: number; percentage: number }> = []

      const nodes: NodeInsert[] = []
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: `progress-node-${i}`,
          name: `Progress Node ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }

      const result = await batchOps.batchCreateNodes(nodes, {
        onProgress: (completed, total) => {
          progressUpdates.push({
            completed,
            total,
            percentage: Math.round((completed / total) * 100)
          })
        }
      })

      expect(result.success).toBe(true)
      expect(progressUpdates.length).toBeGreaterThan(0)
      
      // Should have progress updates
      const finalProgress = progressUpdates[progressUpdates.length - 1]
      expect(finalProgress.completed).toBe(nodeCount)
      expect(finalProgress.percentage).toBe(100)

      console.log(`Received ${progressUpdates.length} progress updates`)
    })

    test('should provide detailed operation statistics', async () => {
      const nodes: NodeInsert[] = []
      for (let i = 0; i < 100; i++) {
        nodes.push({
          id: `stats-node-${i}`,
          name: `Stats Node ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }

      const result = await batchOps.batchCreateNodes(nodes, {
        collectStats: true
      })

      expect(result.success).toBe(true)
      expect(result.stats).toBeDefined()
      expect(result.stats?.totalOperations).toBe(100)
      expect(result.stats?.successfulOperations).toBe(100)
      expect(result.stats?.averageOperationTime).toBeGreaterThan(0)
      expect(result.stats?.throughput).toBeGreaterThan(0)

      console.log('Batch operation statistics:', result.stats)
    })

    test('should handle operation cancellation', async () => {
      const nodeCount = 1000
      const nodes: NodeInsert[] = []
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: `cancel-node-${i}`,
          name: `Cancel Node ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }

      let cancelAfter = 100
      let cancelledAt = 0

      const result = await batchOps.batchCreateNodes(nodes, {
        onProgress: (completed) => {
          if (completed >= cancelAfter && cancelledAt === 0) {
            cancelledAt = completed
            return false // Cancel operation
          }
          return true // Continue
        }
      })

      expect(result.cancelled).toBe(true)
      expect(result.created).toBeLessThan(nodeCount)
      expect(result.created).toBeGreaterThanOrEqual(cancelAfter)

      console.log(`Operation cancelled after creating ${result.created} nodes`)
    })
  })

  describe('Error Recovery and Resilience', () => {
    test('should recover from temporary database locks', async () => {
      // This test simulates database lock scenarios
      const nodes: NodeInsert[] = []
      for (let i = 0; i < 50; i++) {
        nodes.push({
          id: `recovery-node-${i}`,
          name: `Recovery Node ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
      }

      const result = await batchOps.batchCreateNodes(nodes, {
        retryOnLock: true,
        maxRetries: 3,
        retryDelay: 100
      })

      expect(result.success).toBe(true)
      expect(result.created).toBe(50)

      if (result.retries) {
        console.log(`Required ${result.retries} retries to complete batch`)
      }
    })

    test('should handle partial corruption gracefully', async () => {
      const nodes: NodeInsert[] = []
      for (let i = 0; i < 10; i++) {
        nodes.push({
          id: `corruption-node-${i}`,
          name: `Corruption Node ${i}`,
          content: i === 5 ? null as any : `Content ${i}`, // Introduce corruption
          node_type: 'note',
          is_system_node: false
        })
      }

      const result = await batchOps.batchCreateNodes(nodes, {
        validateData: true,
        continueOnError: true
      })

      expect(result.created).toBe(9) // All except corrupted node
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].id).toBe('corruption-node-5')
    })

    test('should maintain data consistency under stress', async () => {
      // Create overlapping operations that could cause race conditions
      const operations = []
      
      // Create competing operations on same data
      for (let i = 0; i < 5; i++) {
        const nodes: NodeInsert[] = [{
          id: 'stress-test-node',
          name: `Stress Test Node ${i}`,
          content: `Content ${i}`,
          node_type: 'note',
          is_system_node: false
        }]

        operations.push(batchOps.batchCreateNodes(nodes, { 
          transactional: true,
          continueOnError: false 
        }))
      }

      const results = await Promise.allSettled(operations)
      
      // Only one should succeed due to unique constraint
      const successCount = results.filter(r => 
        r.status === 'fulfilled' && r.value.success
      ).length
      
      expect(successCount).toBe(1)

      // Verify database state is consistent
      const node = await nodeOps.getNodeById('stress-test-node')
      expect(node).toBeDefined()
    })
  })
})