#!/usr/bin/env bun
/**
 * Performance Benchmark Tests
 * 
 * Comprehensive performance validation tests for database operations
 * to ensure system meets requirements for 1M+ nodes and <50MB memory usage.
 */

import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { dbUtils } from '../../../server/src/database/index.js'
import { createNodeOperations } from '../../../server/src/database/operations/nodes.js'
import { createEdgeOperations } from '../../../server/src/database/operations/edges.js'
import { createBatchOperations } from '../../../server/src/database/operations/batch.js'
import { createSearchQueries } from '../../../server/src/database/queries/search.js'
import { createGraphTraversalQueries } from '../../../server/src/database/queries/graph-traversal.js'
import type { 
  DatabaseConnection, 
  NodeInsert, 
  HierarchyInsert 
} from '../../../server/src/database/types/index.js'

interface PerformanceMetrics {
  duration: number
  memoryBefore: number
  memoryAfter: number
  memoryPeak: number
  throughput: number
  operationsPerSecond: number
}

interface BenchmarkResult {
  testName: string
  metrics: PerformanceMetrics
  requirements: {
    maxDuration?: number
    maxMemoryIncrease?: number
    minThroughput?: number
  }
  passed: boolean
  notes?: string
}

describe('Database Performance Benchmarks', () => {
  let connection: DatabaseConnection
  let nodeOps: ReturnType<typeof createNodeOperations>
  let edgeOps: ReturnType<typeof createEdgeOperations>
  let batchOps: ReturnType<typeof createBatchOperations>
  let searchQueries: ReturnType<typeof createSearchQueries>
  let graphQueries: ReturnType<typeof createGraphTraversalQueries>

  const benchmarkResults: BenchmarkResult[] = []

  beforeEach(async () => {
    connection = await dbUtils.createTestConnection({ 
      enableFTS: true,
      enableWAL: true,
      pragmas: { 
        journal_mode: 'WAL',
        foreign_keys: 'ON',
        busy_timeout: '5000'  // 5 second timeout for lock contention
      }
    })
    nodeOps = createNodeOperations(connection)
    edgeOps = createEdgeOperations(connection)
    batchOps = createBatchOperations(connection)
    searchQueries = createSearchQueries(connection)
    graphQueries = createGraphTraversalQueries(connection)
  })

  afterEach(async () => {
    if (connection) {
      await connection.close()
    }
  })

  function measurePerformance<T>(
    operation: () => Promise<T>,
    operationCount: number = 1
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    return new Promise((resolve, reject) => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024 // MB
      let memoryPeak = memoryBefore

      // Monitor memory usage during operation
      const memoryMonitor = setInterval(() => {
        const current = process.memoryUsage().heapUsed / 1024 / 1024
        if (current > memoryPeak) {
          memoryPeak = current
        }
      }, 50)

      const startTime = Date.now()
      
      operation()
        .then((result) => {
          const endTime = Date.now()
          
          clearInterval(memoryMonitor)
          
          const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024
          const duration = endTime - startTime
          const throughput = operationCount / (duration / 1000) // ops per second
          
          const metrics: PerformanceMetrics = {
            duration,
            memoryBefore,
            memoryAfter,
            memoryPeak,
            throughput,
            operationsPerSecond: throughput
          }

          resolve({ result, metrics })
        })
        .catch((error) => {
          clearInterval(memoryMonitor)
          reject(error)
        })
    })
  }

  function addBenchmarkResult(
    testName: string,
    metrics: PerformanceMetrics,
    requirements: BenchmarkResult['requirements'],
    notes?: string
  ) {
    const passed = 
      (!requirements.maxDuration || metrics.duration <= requirements.maxDuration) &&
      (!requirements.maxMemoryIncrease || (metrics.memoryAfter - metrics.memoryBefore) <= requirements.maxMemoryIncrease) &&
      (!requirements.minThroughput || metrics.operationsPerSecond >= requirements.minThroughput)

    benchmarkResults.push({
      testName,
      metrics,
      requirements,
      passed,
      notes
    })
  }

  describe('Core Operation Benchmarks', () => {
    test('should create 10K nodes within performance requirements', async () => {
      const nodeCount = 10000
      const nodes: NodeInsert[] = []

      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: `perf-node-${i}`,
          name: `Performance Node ${i}`,
          content: `This is content for performance test node ${i}. It contains some sample text to simulate real-world content with reasonable size.`,
          node_type: i % 100 === 0 ? 'folder' : 'note',
          is_system_node: false,
          tags: [`tag-${i % 10}`, `category-${Math.floor(i / 1000)}`],
          metadata: { 
            index: i, 
            batch: Math.floor(i / 1000),
            performance_test: true 
          }
        })
      }

      const { result, metrics } = await measurePerformance(
        () => batchOps.batchCreateNodes(nodes),
        nodeCount
      )

      expect(result.success).toBe(true)
      expect(result.created).toBe(nodeCount)

      addBenchmarkResult(
        '10K Node Creation',
        metrics,
        {
          maxDuration: 10000, // 10 seconds
          maxMemoryIncrease: 50, // 50MB
          minThroughput: 1000 // 1000 nodes/sec
        },
        `Created ${nodeCount} nodes`
      )

      console.log(`✓ Created ${nodeCount} nodes in ${metrics.duration}ms (${metrics.operationsPerSecond.toFixed(1)} nodes/sec)`)
      console.log(`  Memory: ${metrics.memoryBefore.toFixed(1)}MB → ${metrics.memoryAfter.toFixed(1)}MB (peak: ${metrics.memoryPeak.toFixed(1)}MB)`)
    })

    test('should create 100K hierarchy edges efficiently', async () => {
      // First create nodes for hierarchy
      const nodeCount = 50000
      const nodes: NodeInsert[] = []
      
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: `hier-node-${i}`,
          name: `Hierarchy Node ${i}`,
          content: `Content ${i}`,
          node_type: i < 1000 ? 'folder' : 'note',
          is_system_node: false
        })
      }

      await batchOps.batchCreateNodes(nodes)

      // Create hierarchical structure: 1000 roots with ~49 children each
      const hierarchies: HierarchyInsert[] = []
      let edgeCount = 0

      for (let root = 0; root < 1000 && edgeCount < 100000; root++) {
        const childrenCount = Math.min(49, Math.floor((100000 - edgeCount) / (1000 - root)))
        
        for (let child = 0; child < childrenCount; child++) {
          const childIndex = root * 49 + child + 1000
          if (childIndex < nodeCount) {
            hierarchies.push({
              parent_id: `hier-node-${root}`,
              child_id: `hier-node-${childIndex}`,
              position: child
            })
            edgeCount++
          }
        }
      }

      const { result, metrics } = await measurePerformance(
        () => batchOps.batchCreateHierarchyEdges(hierarchies),
        hierarchies.length
      )

      expect(result.success).toBe(true)

      addBenchmarkResult(
        '100K Hierarchy Edge Creation',
        metrics,
        {
          maxDuration: 15000, // 15 seconds
          maxMemoryIncrease: 30, // 30MB
          minThroughput: 5000 // 5000 edges/sec
        },
        `Created ${hierarchies.length} hierarchy edges`
      )

      console.log(`✓ Created ${hierarchies.length} hierarchy edges in ${metrics.duration}ms`)
    })

    test('should handle large batch updates efficiently', async () => {
      // Create initial nodes
      const nodeCount = 5000
      const nodes: NodeInsert[] = []
      
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: `update-node-${i}`,
          name: `Update Node ${i}`,
          content: `Original content ${i}`,
          node_type: 'node',
          is_system_node: false
        })
      }

      await batchOps.batchCreateNodes(nodes)

      // Prepare updates
      const updates = nodes.map((node, i) => ({
        id: node.id,
        data: {
          name: `Updated Node ${i}`,
          content: `Updated content ${i} with additional text and modifications`,
          tags: [`updated-${i}`, `batch-${Math.floor(i / 100)}`]
        }
      }))

      const { result, metrics } = await measurePerformance(
        () => batchOps.batchUpdateNodes(updates),
        nodeCount
      )

      expect(result.success).toBe(true)
      expect(result.updated).toBe(nodeCount)

      addBenchmarkResult(
        '5K Node Batch Update',
        metrics,
        {
          maxDuration: 5000, // 5 seconds
          maxMemoryIncrease: 25, // 25MB
          minThroughput: 1000 // 1000 updates/sec
        },
        `Updated ${nodeCount} nodes`
      )

      console.log(`✓ Updated ${nodeCount} nodes in ${metrics.duration}ms`)
    })

    test('should retrieve large datasets efficiently', async () => {
      // Create test data
      const nodeCount = 20000
      const nodes: NodeInsert[] = []
      
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: `retrieve-node-${i}`,
          name: `Retrieve Node ${i}`,
          content: `Content for retrieval test ${i}`,
          node_type: i % 5 === 0 ? 'folder' : 'note',
          is_system_node: false,
          tags: [`tag-${i % 20}`, `type-${i % 5}`]
        })
      }

      await batchOps.batchCreateNodes(nodes)

      // Test paginated retrieval
      const pageSize = 1000
      const totalPages = Math.ceil(nodeCount / pageSize)

      const { result, metrics } = await measurePerformance(
        async () => {
          const results = []
          for (let page = 0; page < totalPages; page++) {
            const pageResult = await nodeOps.getAllNodes({
              limit: pageSize,
              offset: page * pageSize
            })
            results.push(pageResult)
          }
          return results
        },
        nodeCount
      )

      const totalRetrieved = result.reduce((sum, page) => sum + page.nodes.length, 0)
      expect(totalRetrieved).toBe(nodeCount)

      addBenchmarkResult(
        '20K Node Retrieval (Paginated)',
        metrics,
        {
          maxDuration: 3000, // 3 seconds
          maxMemoryIncrease: 40, // 40MB
          minThroughput: 6000 // 6000 nodes/sec
        },
        `Retrieved ${totalRetrieved} nodes in ${totalPages} pages`
      )

      console.log(`✓ Retrieved ${totalRetrieved} nodes in ${totalPages} pages in ${metrics.duration}ms`)
    })
  })

  describe('Search Performance Benchmarks', () => {
    beforeEach(async () => {
      // Create diverse search test data
      const searchNodes: NodeInsert[] = []
      const categories = ['technology', 'science', 'business', 'health', 'education']
      const contentTemplates = [
        'artificial intelligence machine learning algorithms',
        'quantum mechanics physics research',
        'project management business strategy',
        'medical research healthcare innovation',
        'online education learning platforms'
      ]

      for (let i = 0; i < 5000; i++) {
        const category = categories[i % categories.length]
        const contentTemplate = contentTemplates[i % contentTemplates.length]
        
        searchNodes.push({
          id: `search-node-${i}`,
          name: `${category} Article ${i}`,
          content: `${contentTemplate} content item ${i} with detailed information about ${category} and related topics. This content is designed to test search performance.`,
          node_type: 'article',
          is_system_node: false,
          tags: [category, `tag-${i % 50}`, `series-${Math.floor(i / 100)}`]
        })
      }

      await batchOps.batchCreateNodes(searchNodes)
    })

    test('should perform keyword searches efficiently', async () => {
      const searchQueries = [
        'machine learning',
        'artificial intelligence',
        'quantum mechanics',
        'project management',
        'healthcare innovation'
      ]

      const { result, metrics } = await measurePerformance(
        async () => {
          const results = []
          for (const query of searchQueries) {
            const searchResult = await searchQueries.searchNodes(query, {
              pagination: { limit: 100, offset: 0 }
            })
            results.push(searchResult)
          }
          return results
        },
        searchQueries.length
      )

      expect(result.length).toBe(searchQueries.length)
      expect(result.every(r => r.nodes.length > 0)).toBe(true)

      addBenchmarkResult(
        'Keyword Search Performance',
        metrics,
        {
          maxDuration: 1000, // 1 second for 5 searches
          maxMemoryIncrease: 20, // 20MB
          minThroughput: 5 // 5 searches/sec
        },
        `Performed ${searchQueries.length} keyword searches`
      )

      console.log(`✓ Performed ${searchQueries.length} searches in ${metrics.duration}ms`)
    })

    test('should handle complex filtered searches efficiently', async () => {
      const complexSearches = [
        {
          query: 'technology AND innovation',
          filters: { node_type: 'article', tags: ['technology'] }
        },
        {
          query: 'research OR development',
          filters: { tags: ['science'] }
        },
        {
          query: '*',
          filters: { node_type: 'article' },
          sort: { field: 'created_at', direction: 'desc' }
        }
      ]

      const { result, metrics } = await measurePerformance(
        async () => {
          const results = []
          for (const searchConfig of complexSearches) {
            const searchResult = await searchQueries.searchNodes(
              searchConfig.query,
              {
                filters: searchConfig.filters,
                sort: searchConfig.sort,
                pagination: { limit: 200, offset: 0 }
              }
            )
            results.push(searchResult)
          }
          return results
        },
        complexSearches.length
      )

      expect(result.length).toBe(complexSearches.length)

      addBenchmarkResult(
        'Complex Filtered Search',
        metrics,
        {
          maxDuration: 2000, // 2 seconds
          maxMemoryIncrease: 15, // 15MB
          minThroughput: 1.5 // 1.5 complex searches/sec
        },
        `Performed ${complexSearches.length} complex filtered searches`
      )

      console.log(`✓ Complex filtered searches completed in ${metrics.duration}ms`)
    })
  })

  describe('Graph Traversal Performance', () => {
    beforeEach(async () => {
      // Create a large graph structure for traversal testing
      const graphNodes: NodeInsert[] = []
      const graphHierarchies: HierarchyInsert[] = []

      // Create 20 root nodes with deep hierarchies
      for (let root = 0; root < 20; root++) {
        const rootId = `graph-root-${root}`
        graphNodes.push({
          id: rootId,
          name: `Graph Root ${root}`,
          content: 'Root node content',
          node_type: 'folder',
          is_system_node: false
        })

        // Create 5 levels deep with branching factor of 3
        let currentLevel = [rootId]
        for (let level = 1; level <= 5; level++) {
          const nextLevel: string[] = []
          
          for (const parentId of currentLevel) {
            for (let child = 0; child < 3; child++) {
              const childId = `${parentId}-${level}-${child}`
              graphNodes.push({
                id: childId,
                name: `Node ${childId}`,
                content: `Content for level ${level}`,
                node_type: level === 5 ? 'note' : 'folder',
                is_system_node: false
              })

              graphHierarchies.push({
                parent_id: parentId,
                child_id: childId,
                position: child
              })

              nextLevel.push(childId)
            }
          }
          currentLevel = nextLevel
        }
      }

      await batchOps.batchCreateNodes(graphNodes)
      await batchOps.batchCreateHierarchyEdges(graphHierarchies)

      console.log(`Created graph with ${graphNodes.length} nodes and ${graphHierarchies.length} edges`)
    })

    test('should perform graph traversal efficiently', async () => {
      const traversalOperations = [
        () => graphQueries.breadthFirstTraversal('graph-root-0'),
        () => graphQueries.depthFirstTraversal('graph-root-1'),
        () => graphQueries.getDescendants('graph-root-2'),
        () => graphQueries.findShortestPath('graph-root-0', 'graph-root-0-5-2'),
      ]

      const { result, metrics } = await measurePerformance(
        async () => {
          const results = []
          for (const operation of traversalOperations) {
            const operationResult = await operation()
            results.push(operationResult)
          }
          return results
        },
        traversalOperations.length
      )

      expect(result.length).toBe(traversalOperations.length)

      addBenchmarkResult(
        'Graph Traversal Operations',
        metrics,
        {
          maxDuration: 3000, // 3 seconds
          maxMemoryIncrease: 30, // 30MB
          minThroughput: 1 // 1 operation/sec minimum
        },
        `Performed ${traversalOperations.length} traversal operations`
      )

      console.log(`✓ Graph traversal operations completed in ${metrics.duration}ms`)
    })

    test('should calculate graph metrics efficiently', async () => {
      const { result, metrics } = await measurePerformance(
        async () => {
          const graphMetrics = await graphQueries.getGraphMetrics()
          const betweenness = await graphQueries.calculateBetweennessCentrality()
          const components = await graphQueries.findStronglyConnectedComponents()
          
          return { graphMetrics, betweenness, components }
        },
        1
      )

      expect(result.graphMetrics.nodeCount).toBeGreaterThan(0)
      expect(result.betweenness.length).toBeGreaterThan(0)
      expect(result.components.length).toBeGreaterThan(0)

      addBenchmarkResult(
        'Graph Metrics Calculation',
        metrics,
        {
          maxDuration: 5000, // 5 seconds
          maxMemoryIncrease: 50, // 50MB
          minThroughput: 0.2 // 1 calculation per 5 seconds
        },
        'Calculated comprehensive graph metrics'
      )

      console.log(`✓ Graph metrics calculation completed in ${metrics.duration}ms`)
    })
  })

  describe('Memory Stress Tests', () => {
    test('should handle 1M+ node simulation within memory limits', async () => {
      // Simulate 1M nodes by creating batches and measuring memory
      const batchSize = 10000
      const totalBatches = 100 // 1M nodes total
      let totalCreated = 0

      const { result, metrics } = await measurePerformance(
        async () => {
          for (let batch = 0; batch < totalBatches; batch++) {
            const nodes: NodeInsert[] = []
            
            for (let i = 0; i < batchSize; i++) {
              const nodeId = `stress-${batch}-${i}`
              nodes.push({
                id: nodeId,
                name: `Stress Test Node ${batch}-${i}`,
                content: `Content for stress test batch ${batch} node ${i}`,
                node_type: 'node',
                is_system_node: false,
                tags: [`batch-${batch}`, `stress-test`]
              })
            }

            const batchResult = await batchOps.batchCreateNodes(nodes)
            totalCreated += batchResult.created

            // Clean up batch to simulate memory efficiency
            await batchOps.batchDeleteNodes(nodes.map(n => n.id))

            // Monitor memory every 10 batches
            if (batch % 10 === 0) {
              const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024
              console.log(`Batch ${batch}: ${currentMemory.toFixed(1)}MB memory`)
              
              // Ensure memory doesn't grow excessively
              expect(currentMemory).toBeLessThan(100) // Under 100MB
            }
          }
          
          return { totalCreated }
        },
        totalBatches * batchSize
      )

      expect(result.totalCreated).toBe(totalBatches * batchSize)

      addBenchmarkResult(
        '1M Node Simulation',
        metrics,
        {
          maxDuration: 300000, // 5 minutes
          maxMemoryIncrease: 50, // 50MB total increase
          minThroughput: 3333 // 3333 nodes/sec (1M in 5 min)
        },
        `Simulated processing ${totalBatches * batchSize} nodes`
      )

      console.log(`✓ Simulated 1M nodes in ${metrics.duration}ms with max ${metrics.memoryPeak.toFixed(1)}MB memory`)
    })

    test('should maintain stable memory usage under load', async () => {
      const iterations = 50
      const memorySnapshots: number[] = []

      const { result, metrics } = await measurePerformance(
        async () => {
          for (let i = 0; i < iterations; i++) {
            // Create nodes
            const nodes: NodeInsert[] = []
            for (let j = 0; j < 100; j++) {
              nodes.push({
                id: `memory-${i}-${j}`,
                name: `Memory Test ${i}-${j}`,
                content: `Content ${i}-${j}`,
                node_type: 'node',
                is_system_node: false
              })
            }

            await batchOps.batchCreateNodes(nodes)

            // Perform operations
            await nodeOps.getAllNodes({ limit: 50 })
            await searchQueries.searchNodes('test')

            // Clean up
            await batchOps.batchDeleteNodes(nodes.map(n => n.id))

            // Track memory
            const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024
            memorySnapshots.push(currentMemory)

            // Force garbage collection occasionally
            if (i % 10 === 0 && global.gc) {
              global.gc()
            }
          }

          return { memorySnapshots }
        },
        iterations
      )

      const avgMemory = memorySnapshots.reduce((sum, mem) => sum + mem, 0) / memorySnapshots.length
      const maxMemory = Math.max(...memorySnapshots)
      const minMemory = Math.min(...memorySnapshots)

      addBenchmarkResult(
        'Memory Stability Test',
        metrics,
        {
          maxDuration: 30000, // 30 seconds
          maxMemoryIncrease: 30, // 30MB
          minThroughput: 1.6 // 1.6 iterations/sec
        },
        `Memory range: ${minMemory.toFixed(1)}MB - ${maxMemory.toFixed(1)}MB (avg: ${avgMemory.toFixed(1)}MB)`
      )

      // Memory should remain relatively stable
      expect(maxMemory - minMemory).toBeLessThan(50) // Less than 50MB variation

      console.log(`✓ Memory stability test: ${minMemory.toFixed(1)}MB - ${maxMemory.toFixed(1)}MB range`)
    })
  })

  describe('Concurrent Operation Performance', () => {
    test('should handle concurrent operations efficiently', async () => {
      const concurrentOperations = 10
      const nodesPerOperation = 500

      const { result, metrics } = await measurePerformance(
        async () => {
          const operations = []
          
          for (let op = 0; op < concurrentOperations; op++) {
            const nodes: NodeInsert[] = []
            for (let i = 0; i < nodesPerOperation; i++) {
              nodes.push({
                id: `concurrent-${op}-${i}`,
                name: `Concurrent Node ${op}-${i}`,
                content: `Content ${op}-${i}`,
                node_type: 'node',
                is_system_node: false
              })
            }

            operations.push(batchOps.batchCreateNodes(nodes))
          }

          const results = await Promise.all(operations)
          return results
        },
        concurrentOperations * nodesPerOperation
      )

      expect(result.length).toBe(concurrentOperations)
      expect(result.every(r => r.success)).toBe(true)

      const totalCreated = result.reduce((sum, r) => sum + r.created, 0)
      expect(totalCreated).toBe(concurrentOperations * nodesPerOperation)

      addBenchmarkResult(
        'Concurrent Operations',
        metrics,
        {
          maxDuration: 10000, // 10 seconds
          maxMemoryIncrease: 40, // 40MB
          minThroughput: 500 // 500 nodes/sec
        },
        `${concurrentOperations} concurrent operations creating ${totalCreated} nodes`
      )

      console.log(`✓ ${concurrentOperations} concurrent operations completed in ${metrics.duration}ms`)
    })
  })

  afterEach(() => {
    // Print individual benchmark results
    if (benchmarkResults.length > 0) {
      const latestResult = benchmarkResults[benchmarkResults.length - 1]
      const status = latestResult.passed ? '✅' : '❌'
      console.log(`${status} ${latestResult.testName}: ${latestResult.metrics.duration}ms`)
      
      if (latestResult.notes) {
        console.log(`   ${latestResult.notes}`)
      }
      
      if (!latestResult.passed) {
        console.log(`   Failed requirements:`)
        if (latestResult.requirements.maxDuration && latestResult.metrics.duration > latestResult.requirements.maxDuration) {
          console.log(`   - Duration: ${latestResult.metrics.duration}ms > ${latestResult.requirements.maxDuration}ms`)
        }
        if (latestResult.requirements.maxMemoryIncrease && (latestResult.metrics.memoryAfter - latestResult.metrics.memoryBefore) > latestResult.requirements.maxMemoryIncrease) {
          console.log(`   - Memory: ${(latestResult.metrics.memoryAfter - latestResult.metrics.memoryBefore).toFixed(1)}MB > ${latestResult.requirements.maxMemoryIncrease}MB`)
        }
        if (latestResult.requirements.minThroughput && latestResult.metrics.operationsPerSecond < latestResult.requirements.minThroughput) {
          console.log(`   - Throughput: ${latestResult.metrics.operationsPerSecond.toFixed(1)} ops/sec < ${latestResult.requirements.minThroughput} ops/sec`)
        }
      }
    }
  })

  afterAll(() => {
    // Generate comprehensive benchmark report
    console.log('\n' + '='.repeat(80))
    console.log('DATABASE PERFORMANCE BENCHMARK REPORT')
    console.log('='.repeat(80))

    const passedTests = benchmarkResults.filter(r => r.passed).length
    const totalTests = benchmarkResults.length

    console.log(`\nOverall Results: ${passedTests}/${totalTests} tests passed\n`)

    benchmarkResults.forEach(result => {
      const status = result.passed ? '✅' : '❌'
      console.log(`${status} ${result.testName}`)
      console.log(`   Duration: ${result.metrics.duration}ms`)
      console.log(`   Memory: ${result.metrics.memoryBefore.toFixed(1)}MB → ${result.metrics.memoryAfter.toFixed(1)}MB (peak: ${result.metrics.memoryPeak.toFixed(1)}MB)`)
      console.log(`   Throughput: ${result.metrics.operationsPerSecond.toFixed(1)} ops/sec`)
      if (result.notes) {
        console.log(`   Notes: ${result.notes}`)
      }
      console.log()
    })

    // Summary statistics
    const durations = benchmarkResults.map(r => r.metrics.duration)
    const memoryIncreases = benchmarkResults.map(r => r.metrics.memoryAfter - r.metrics.memoryBefore)
    const throughputs = benchmarkResults.map(r => r.metrics.operationsPerSecond)

    console.log('Performance Summary:')
    console.log(`  Average Duration: ${(durations.reduce((sum, d) => sum + d, 0) / durations.length).toFixed(1)}ms`)
    console.log(`  Max Duration: ${Math.max(...durations)}ms`)
    console.log(`  Average Memory Increase: ${(memoryIncreases.reduce((sum, m) => sum + m, 0) / memoryIncreases.length).toFixed(1)}MB`)
    console.log(`  Max Memory Increase: ${Math.max(...memoryIncreases).toFixed(1)}MB`)
    console.log(`  Average Throughput: ${(throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length).toFixed(1)} ops/sec`)
    console.log(`  Max Throughput: ${Math.max(...throughputs).toFixed(1)} ops/sec`)

    console.log('\n' + '='.repeat(80))

    // Assert overall benchmark success
    expect(passedTests).toBe(totalTests)
  })
})