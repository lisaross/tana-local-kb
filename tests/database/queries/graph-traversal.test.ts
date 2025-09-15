#!/usr/bin/env bun
/**
 * Graph Traversal Tests
 * 
 * Tests for complex graph algorithms, path finding, relationship analysis,
 * and performance validation for large graph structures.
 */

import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { dbUtils } from '../../../server/src/database/index.js'
import { createNodeOperations } from '../../../server/src/database/operations/nodes.js'
import { createEdgeOperations } from '../../../server/src/database/operations/edges.js'
import { createGraphTraversalQueries } from '../../../server/src/database/queries/graph-traversal.js'
import type { 
  DatabaseConnection, 
  NodeInsert, 
  HierarchyInsert,
  ReferenceInsert 
} from '../../../server/src/database/types/index.js'

describe('Graph Traversal Algorithms', () => {
  let connection: DatabaseConnection
  let nodeOps: ReturnType<typeof createNodeOperations>
  let edgeOps: ReturnType<typeof createEdgeOperations>
  let graphQueries: ReturnType<typeof createGraphTraversalQueries>

  beforeEach(async () => {
    connection = await dbUtils.createTestConnection()
    nodeOps = createNodeOperations(connection)
    edgeOps = createEdgeOperations(connection)
    graphQueries = createGraphTraversalQueries(connection)

    // Create a complex test graph structure
    await setupComplexTestGraph()
  })

  afterEach(async () => {
    if (connection) {
      await connection.close()
    }
  })

  /**
   * Setup complex test graph:
   * 
   * Root Nodes: A, B, C
   * A -> A1 -> A1a, A1b
   *   -> A2 -> A2a
   * B -> B1 -> B1a
   *   -> B2
   * C -> C1
   * 
   * Cross-references:
   * A1a -> B1 (reference)
   * B2 -> A2a (reference)
   * C1 -> A1 (reference)
   */
  async function setupComplexTestGraph() {
    // Create nodes
    const nodes: NodeInsert[] = [
      // Root level
      { id: 'A', name: 'Root A', content: 'Root node A', node_type: 'folder', is_system_node: false },
      { id: 'B', name: 'Root B', content: 'Root node B', node_type: 'folder', is_system_node: false },
      { id: 'C', name: 'Root C', content: 'Root node C', node_type: 'folder', is_system_node: false },
      
      // Level 1
      { id: 'A1', name: 'A Child 1', content: 'First child of A', node_type: 'folder', is_system_node: false },
      { id: 'A2', name: 'A Child 2', content: 'Second child of A', node_type: 'folder', is_system_node: false },
      { id: 'B1', name: 'B Child 1', content: 'First child of B', node_type: 'folder', is_system_node: false },
      { id: 'B2', name: 'B Child 2', content: 'Second child of B', node_type: 'note', is_system_node: false },
      { id: 'C1', name: 'C Child 1', content: 'First child of C', node_type: 'note', is_system_node: false },
      
      // Level 2
      { id: 'A1a', name: 'A1 Child a', content: 'Child of A1', node_type: 'note', is_system_node: false },
      { id: 'A1b', name: 'A1 Child b', content: 'Child of A1', node_type: 'note', is_system_node: false },
      { id: 'A2a', name: 'A2 Child a', content: 'Child of A2', node_type: 'note', is_system_node: false },
      { id: 'B1a', name: 'B1 Child a', content: 'Child of B1', node_type: 'note', is_system_node: false }
    ]

    await nodeOps.createNodes(nodes)

    // Create hierarchy edges
    const hierarchies: HierarchyInsert[] = [
      // A branch
      { parent_id: 'A', child_id: 'A1', position: 0 },
      { parent_id: 'A', child_id: 'A2', position: 1 },
      { parent_id: 'A1', child_id: 'A1a', position: 0 },
      { parent_id: 'A1', child_id: 'A1b', position: 1 },
      { parent_id: 'A2', child_id: 'A2a', position: 0 },
      
      // B branch
      { parent_id: 'B', child_id: 'B1', position: 0 },
      { parent_id: 'B', child_id: 'B2', position: 1 },
      { parent_id: 'B1', child_id: 'B1a', position: 0 },
      
      // C branch
      { parent_id: 'C', child_id: 'C1', position: 0 }
    ]

    await edgeOps.createHierarchyEdges(hierarchies)

    // Create cross-references
    const references: ReferenceInsert[] = [
      { source_id: 'A1a', target_id: 'B1', reference_type: 'link' },
      { source_id: 'B2', target_id: 'A2a', reference_type: 'link' },
      { source_id: 'C1', target_id: 'A1', reference_type: 'link' },
      { source_id: 'A1', target_id: 'C1', reference_type: 'mention' },
      { source_id: 'A2a', target_id: 'B1a', reference_type: 'related' }
    ]

    // Note: This assumes reference operations are available
    // If not implemented yet, this will be skipped
    try {
      const refOps = (await import('../../../server/src/database/operations/references.js')).createReferenceOperations(connection)
      await refOps.createReferences(references)
    } catch (error) {
      console.log('Reference operations not available, skipping reference setup')
    }
  }

  describe('Basic Traversal Operations', () => {
    test('should perform breadth-first traversal from root', async () => {
      const result = await graphQueries.breadthFirstTraversal('A')
      
      expect(result.nodes.length).toBeGreaterThanOrEqual(5) // A, A1, A2, A1a, A1b, A2a
      expect(result.visitOrder[0].id).toBe('A') // Should start with root
      
      // Level 1 nodes should come before level 2 nodes
      const a1Index = result.visitOrder.findIndex(n => n.id === 'A1')
      const a1aIndex = result.visitOrder.findIndex(n => n.id === 'A1a')
      expect(a1Index).toBeLessThan(a1aIndex)
      
      console.log('BFS visit order:', result.visitOrder.map(n => n.id))
    })

    test('should perform depth-first traversal from root', async () => {
      const result = await graphQueries.depthFirstTraversal('A')
      
      expect(result.nodes.length).toBeGreaterThanOrEqual(5)
      expect(result.visitOrder[0].id).toBe('A')
      
      // Should go deep before going wide
      const a1Index = result.visitOrder.findIndex(n => n.id === 'A1')
      const a1aIndex = result.visitOrder.findIndex(n => n.id === 'A1a')
      const a2Index = result.visitOrder.findIndex(n => n.id === 'A2')
      
      // A1a should come before A2 in DFS
      expect(a1aIndex).toBeLessThan(a2Index)
      
      console.log('DFS visit order:', result.visitOrder.map(n => n.id))
    })

    test('should find shortest path between nodes', async () => {
      const path = await graphQueries.findShortestPath('A', 'A2a')
      
      expect(path.found).toBe(true)
      expect(path.path.length).toBe(3) // A -> A2 -> A2a
      expect(path.path[0].id).toBe('A')
      expect(path.path[1].id).toBe('A2')
      expect(path.path[2].id).toBe('A2a')
      expect(path.distance).toBe(2) // 2 hops
    })

    test('should find all paths between nodes', async () => {
      const paths = await graphQueries.findAllPaths('A1a', 'B1a', { maxDepth: 5 })
      
      expect(paths.length).toBeGreaterThan(0)
      
      // Should include direct path through references if available
      const directPath = paths.find(p => 
        p.some(n => n.id === 'B1') && p.length <= 3
      )
      
      if (directPath) {
        console.log('Found direct path:', directPath.map(n => n.id))
      }
    })

    test('should detect reachability between nodes', async () => {
      const reachable = await graphQueries.isReachable('A', 'A1a')
      expect(reachable.reachable).toBe(true)
      expect(reachable.distance).toBe(2)
      
      const unreachable = await graphQueries.isReachable('A1a', 'A')
      expect(unreachable.reachable).toBe(false) // Can't go up hierarchy by default
    })

    test('should find nodes within distance', async () => {
      const nearby = await graphQueries.findNodesWithinDistance('A', 2)
      
      expect(nearby.nodes.length).toBeGreaterThanOrEqual(5)
      
      // Should include all nodes at distance <= 2
      const nodeIds = nearby.nodes.map(n => n.id)
      expect(nodeIds).toContain('A1') // distance 1
      expect(nodeIds).toContain('A2') // distance 1
      expect(nodeIds).toContain('A1a') // distance 2
      expect(nodeIds).toContain('A2a') // distance 2
    })
  })

  describe('Advanced Graph Analysis', () => {
    test('should identify strongly connected components', async () => {
      const components = await graphQueries.findStronglyConnectedComponents()
      
      expect(components.length).toBeGreaterThan(0)
      
      // Most nodes should be in separate components due to hierarchy
      const componentSizes = components.map(c => c.nodes.length)
      const totalNodes = componentSizes.reduce((sum, size) => sum + size, 0)
      
      expect(totalNodes).toBeGreaterThanOrEqual(12) // Total nodes created
      
      console.log('Component sizes:', componentSizes)
    })

    test('should find bridges in the graph', async () => {
      const bridges = await graphQueries.findBridges()
      
      expect(bridges.length).toBeGreaterThan(0)
      
      // Hierarchy edges should be bridges
      const hierarchyBridge = bridges.find(b => 
        (b.source_id === 'A' && b.target_id === 'A1') ||
        (b.source_id === 'A1' && b.target_id === 'A')
      )
      
      expect(hierarchyBridge).toBeDefined()
      
      console.log('Found bridges:', bridges.map(b => `${b.source_id} -> ${b.target_id}`))
    })

    test('should identify articulation points', async () => {
      const articulationPoints = await graphQueries.findArticulationPoints()
      
      expect(articulationPoints.length).toBeGreaterThan(0)
      
      // Root nodes and intermediate nodes should be articulation points
      const articulationIds = articulationPoints.map(p => p.id)
      expect(articulationIds).toContain('A') // Root is articulation point
      expect(articulationIds).toContain('A1') // Intermediate node
      
      console.log('Articulation points:', articulationIds)
    })

    test('should calculate betweenness centrality', async () => {
      const centrality = await graphQueries.calculateBetweennessCentrality()
      
      expect(centrality.length).toBeGreaterThan(0)
      
      // Root and intermediate nodes should have higher centrality
      const rootACentrality = centrality.find(c => c.nodeId === 'A')
      const leafCentrality = centrality.find(c => c.nodeId === 'A1a')
      
      expect(rootACentrality?.centrality).toBeGreaterThan(leafCentrality?.centrality || 0)
      
      console.log('Top centrality nodes:', 
        centrality
          .sort((a, b) => b.centrality - a.centrality)
          .slice(0, 3)
          .map(c => ({ id: c.nodeId, centrality: c.centrality.toFixed(3) }))
      )
    })

    test('should calculate PageRank scores', async () => {
      const pageRank = await graphQueries.calculatePageRank({ 
        iterations: 10,
        dampingFactor: 0.85 
      })
      
      expect(pageRank.length).toBeGreaterThan(0)
      
      // Sum of all PageRank scores should be approximately equal to number of nodes
      const totalScore = pageRank.reduce((sum, pr) => sum + pr.score, 0)
      expect(totalScore).toBeCloseTo(pageRank.length, 1)
      
      // Highly connected nodes should have higher PageRank
      const sortedByScore = pageRank.sort((a, b) => b.score - a.score)
      console.log('Top PageRank nodes:', 
        sortedByScore.slice(0, 3).map(pr => ({ id: pr.nodeId, score: pr.score.toFixed(3) }))
      )
    })

    test('should detect cycles in the graph', async () => {
      const cycles = await graphQueries.detectCycles()
      
      // With references, there might be cycles
      if (cycles.length > 0) {
        expect(cycles[0].nodes.length).toBeGreaterThanOrEqual(2)
        
        console.log('Found cycles:', cycles.map(c => c.nodes.map(n => n.id)))
      } else {
        console.log('No cycles detected in current graph structure')
      }
    })
  })

  describe('Subgraph Operations', () => {
    test('should extract subgraph around node', async () => {
      const subgraph = await graphQueries.extractSubgraph('A1', { 
        radius: 2,
        includeReferences: true 
      })
      
      expect(subgraph.nodes.length).toBeGreaterThan(0)
      expect(subgraph.edges.length).toBeGreaterThan(0)
      
      // Should include A1 and its immediate neighbors
      const nodeIds = subgraph.nodes.map(n => n.id)
      expect(nodeIds).toContain('A1')
      expect(nodeIds).toContain('A') // parent
      expect(nodeIds).toContain('A1a') // child
      expect(nodeIds).toContain('A1b') // child
      
      console.log('Subgraph around A1:', nodeIds)
    })

    test('should find minimal spanning subgraph', async () => {
      const nodeIds = ['A', 'A1a', 'B1', 'C1']
      const spanning = await graphQueries.findMinimalSpanningSubgraph(nodeIds)
      
      expect(spanning.nodes.length).toBeGreaterThanOrEqual(nodeIds.length)
      expect(spanning.edges.length).toBeGreaterThan(0)
      
      // All requested nodes should be included
      const includedIds = spanning.nodes.map(n => n.id)
      for (const nodeId of nodeIds) {
        expect(includedIds).toContain(nodeId)
      }
      
      console.log('Spanning subgraph nodes:', includedIds)
    })

    test('should partition graph into clusters', async () => {
      const clusters = await graphQueries.partitionGraph({ 
        algorithm: 'modularity',
        targetClusters: 3 
      })
      
      expect(clusters.length).toBeGreaterThan(0)
      expect(clusters.length).toBeLessThanOrEqual(3)
      
      // Each cluster should have at least one node
      for (const cluster of clusters) {
        expect(cluster.nodes.length).toBeGreaterThan(0)
      }
      
      // All nodes should be assigned to exactly one cluster
      const totalAssigned = clusters.reduce((sum, c) => sum + c.nodes.length, 0)
      const totalNodes = await nodeOps.getNodeCount()
      expect(totalAssigned).toBe(totalNodes)
      
      console.log('Cluster sizes:', clusters.map(c => c.nodes.length))
    })

    test('should find densely connected subgraphs', async () => {
      const denseSubgraphs = await graphQueries.findDenseSubgraphs({ 
        minDensity: 0.5,
        minNodes: 3 
      })
      
      // May or may not find dense subgraphs depending on test data
      if (denseSubgraphs.length > 0) {
        for (const subgraph of denseSubgraphs) {
          expect(subgraph.nodes.length).toBeGreaterThanOrEqual(3)
          expect(subgraph.density).toBeGreaterThanOrEqual(0.5)
        }
        
        console.log('Dense subgraphs found:', denseSubgraphs.length)
      } else {
        console.log('No dense subgraphs found with current criteria')
      }
    })
  })

  describe('Performance and Scalability Tests', () => {
    test('should handle large graph traversal efficiently', async () => {
      // Create a larger test graph
      const largeNodes: NodeInsert[] = []
      const largeHierarchies: HierarchyInsert[] = []
      
      // Create 10 branches with 50 nodes each
      for (let branch = 0; branch < 10; branch++) {
        const branchRoot = `large-root-${branch}`
        largeNodes.push({
          id: branchRoot,
          name: `Large Root ${branch}`,
          content: 'Large graph root',
          node_type: 'folder',
          is_system_node: false
        })
        
        for (let i = 0; i < 50; i++) {
          const nodeId = `large-${branch}-${i}`
          largeNodes.push({
            id: nodeId,
            name: `Large Node ${branch}-${i}`,
            content: `Content ${branch}-${i}`,
            node_type: 'note',
            is_system_node: false
          })
          
          const parentId = i === 0 ? branchRoot : `large-${branch}-${i - 1}`
          largeHierarchies.push({
            parent_id: parentId,
            child_id: nodeId,
            position: 0
          })
        }
      }
      
      await nodeOps.createNodes(largeNodes)
      await edgeOps.createHierarchyEdges(largeHierarchies)
      
      // Test traversal performance
      const startTime = Date.now()
      const result = await graphQueries.breadthFirstTraversal('large-root-0')
      const duration = Date.now() - startTime
      
      expect(result.nodes.length).toBe(51) // 1 root + 50 children
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
      
      console.log(`Traversed ${result.nodes.length} nodes in ${duration}ms`)
    })

    test('should handle pathfinding in complex graphs efficiently', async () => {
      // Create a grid-like structure for pathfinding
      const gridSize = 20
      const gridNodes: NodeInsert[] = []
      const gridHierarchies: HierarchyInsert[] = []
      
      // Create grid nodes
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          const nodeId = `grid-${x}-${y}`
          gridNodes.push({
            id: nodeId,
            name: `Grid Node ${x},${y}`,
            content: `Grid position ${x},${y}`,
            node_type: 'note',
            is_system_node: false
          })
        }
      }
      
      // Create grid connections (each node connected to adjacent nodes)
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          const currentId = `grid-${x}-${y}`
          
          // Connect to right neighbor
          if (x < gridSize - 1) {
            gridHierarchies.push({
              parent_id: currentId,
              child_id: `grid-${x + 1}-${y}`,
              position: 0
            })
          }
          
          // Connect to bottom neighbor
          if (y < gridSize - 1) {
            gridHierarchies.push({
              parent_id: currentId,
              child_id: `grid-${x}-${y + 1}`,
              position: 1
            })
          }
        }
      }
      
      await nodeOps.createNodes(gridNodes)
      await edgeOps.createHierarchyEdges(gridHierarchies)
      
      // Test pathfinding from top-left to bottom-right
      const startTime = Date.now()
      const path = await graphQueries.findShortestPath('grid-0-0', `grid-${gridSize-1}-${gridSize-1}`)
      const duration = Date.now() - startTime
      
      expect(path.found).toBe(true)
      expect(path.distance).toBe((gridSize - 1) * 2) // Manhattan distance
      expect(duration).toBeLessThan(2000) // Should complete in under 2 seconds
      
      console.log(`Found path of length ${path.distance} in ${duration}ms`)
    })

    test('should maintain performance with memory constraints', async () => {
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024
      
      // Perform multiple complex operations
      const operations = [
        () => graphQueries.breadthFirstTraversal('A'),
        () => graphQueries.depthFirstTraversal('B'),
        () => graphQueries.findShortestPath('A', 'B1a'),
        () => graphQueries.findNodesWithinDistance('C', 3),
        () => graphQueries.calculateBetweennessCentrality()
      ]
      
      for (const operation of operations) {
        await operation()
        
        // Check memory after each operation
        const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024
        const memoryIncrease = currentMemory - initialMemory
        
        expect(memoryIncrease).toBeLessThan(50) // Less than 50MB increase
      }
      
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024
      const totalIncrease = finalMemory - initialMemory
      
      console.log(`Total memory increase: ${totalIncrease.toFixed(1)}MB`)
      expect(totalIncrease).toBeLessThan(100) // Less than 100MB total
    })
  })

  describe('Graph Metrics and Analysis', () => {
    test('should calculate basic graph metrics', async () => {
      const metrics = await graphQueries.getGraphMetrics()
      
      expect(metrics.nodeCount).toBeGreaterThan(0)
      expect(metrics.edgeCount).toBeGreaterThan(0)
      expect(metrics.density).toBeGreaterThanOrEqual(0)
      expect(metrics.density).toBeLessThanOrEqual(1)
      expect(metrics.averageDegree).toBeGreaterThanOrEqual(0)
      expect(metrics.diameter).toBeGreaterThan(0)
      
      console.log('Graph metrics:', {
        nodes: metrics.nodeCount,
        edges: metrics.edgeCount,
        density: metrics.density.toFixed(3),
        avgDegree: metrics.averageDegree.toFixed(2),
        diameter: metrics.diameter
      })
    })

    test('should analyze degree distribution', async () => {
      const distribution = await graphQueries.getDegreeDistribution()
      
      expect(distribution.length).toBeGreaterThan(0)
      
      // Sum of all counts should equal total nodes
      const totalCount = distribution.reduce((sum, d) => sum + d.count, 0)
      const totalNodes = await nodeOps.getNodeCount()
      expect(totalCount).toBe(totalNodes)
      
      console.log('Degree distribution:', 
        distribution.map(d => ({ degree: d.degree, count: d.count }))
      )
    })

    test('should identify hub nodes', async () => {
      const hubs = await graphQueries.findHubNodes({ 
        minDegree: 2,
        limit: 5 
      })
      
      expect(hubs.length).toBeGreaterThan(0)
      
      // All hubs should have degree >= minDegree
      for (const hub of hubs) {
        expect(hub.degree).toBeGreaterThanOrEqual(2)
      }
      
      // Should be sorted by degree (descending)
      for (let i = 1; i < hubs.length; i++) {
        expect(hubs[i].degree).toBeLessThanOrEqual(hubs[i-1].degree)
      }
      
      console.log('Hub nodes:', hubs.map(h => ({ id: h.nodeId, degree: h.degree })))
    })

    test('should calculate clustering coefficient', async () => {
      const clustering = await graphQueries.calculateClusteringCoefficient()
      
      expect(clustering.globalCoefficient).toBeGreaterThanOrEqual(0)
      expect(clustering.globalCoefficient).toBeLessThanOrEqual(1)
      expect(clustering.localCoefficients.length).toBeGreaterThan(0)
      
      // Average local coefficient should be reasonable
      const avgLocal = clustering.localCoefficients.reduce((sum, lc) => sum + lc.coefficient, 0) / 
                      clustering.localCoefficients.length
      expect(avgLocal).toBeGreaterThanOrEqual(0)
      expect(avgLocal).toBeLessThanOrEqual(1)
      
      console.log(`Clustering - Global: ${clustering.globalCoefficient.toFixed(3)}, Avg Local: ${avgLocal.toFixed(3)}`)
    })

    test('should analyze connectivity patterns', async () => {
      const connectivity = await graphQueries.analyzeConnectivity()
      
      expect(connectivity.isConnected).toBeDefined()
      expect(connectivity.componentCount).toBeGreaterThan(0)
      expect(connectivity.largestComponentSize).toBeGreaterThan(0)
      
      if (!connectivity.isConnected) {
        expect(connectivity.componentCount).toBeGreaterThan(1)
      }
      
      console.log('Connectivity analysis:', {
        connected: connectivity.isConnected,
        components: connectivity.componentCount,
        largestComponent: connectivity.largestComponentSize
      })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle traversal of non-existent nodes', async () => {
      const result = await graphQueries.breadthFirstTraversal('non-existent')
      expect(result.nodes).toHaveLength(0)
      expect(result.visitOrder).toHaveLength(0)
    })

    test('should handle pathfinding between disconnected nodes', async () => {
      const path = await graphQueries.findShortestPath('A', 'isolated-node')
      expect(path.found).toBe(false)
      expect(path.path).toHaveLength(0)
      expect(path.distance).toBe(-1)
    })

    test('should handle cycles gracefully in traversal', async () => {
      // Create a cycle
      await edgeOps.createHierarchyEdge({ 
        parent_id: 'C1', 
        child_id: 'C', 
        position: 0 
      })
      
      const result = await graphQueries.breadthFirstTraversal('C', { 
        maxDepth: 10,
        avoidCycles: true 
      })
      
      expect(result.nodes.length).toBeGreaterThan(0)
      expect(result.nodes.length).toBeLessThan(100) // Should not loop infinitely
      
      // Should visit each node only once
      const nodeIds = result.visitOrder.map(n => n.id)
      const uniqueIds = [...new Set(nodeIds)]
      expect(nodeIds.length).toBe(uniqueIds.length)
    })

    test('should handle very deep traversals efficiently', async () => {
      // Create a deep chain
      const deepNodes: NodeInsert[] = []
      const deepHierarchies: HierarchyInsert[] = []
      
      for (let i = 0; i < 100; i++) {
        const nodeId = `deep-${i}`
        deepNodes.push({
          id: nodeId,
          name: `Deep Node ${i}`,
          content: `Deep content ${i}`,
          node_type: 'note',
          is_system_node: false
        })
        
        if (i > 0) {
          deepHierarchies.push({
            parent_id: `deep-${i-1}`,
            child_id: nodeId,
            position: 0
          })
        }
      }
      
      await nodeOps.createNodes(deepNodes)
      await edgeOps.createHierarchyEdges(deepHierarchies)
      
      const startTime = Date.now()
      const result = await graphQueries.depthFirstTraversal('deep-0')
      const duration = Date.now() - startTime
      
      expect(result.nodes.length).toBe(100)
      expect(duration).toBeLessThan(2000) // Should handle deep traversal efficiently
      
      console.log(`Deep traversal of ${result.nodes.length} nodes in ${duration}ms`)
    })

    test('should handle empty graphs gracefully', async () => {
      // Create fresh empty database
      const emptyConnection = await dbUtils.createTestConnection()
      const emptyGraphQueries = createGraphTraversalQueries(emptyConnection)
      
      const metrics = await emptyGraphQueries.getGraphMetrics()
      expect(metrics.nodeCount).toBe(0)
      expect(metrics.edgeCount).toBe(0)
      expect(metrics.density).toBe(0)
      
      const traversal = await emptyGraphQueries.breadthFirstTraversal('any-node')
      expect(traversal.nodes).toHaveLength(0)
      
      await emptyConnection.close()
    })
  })
})